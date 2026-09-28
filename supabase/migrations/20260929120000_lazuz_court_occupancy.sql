-- LAZUZ court occupancy schema
-- Status: APPLIED manually via the Supabase SQL Editor and verified.
--
-- Tables:
--   courts                        LAZUZ courts (resources) — seeded with the 8 confirmed courts
--   court_reservations            one row per LAZUZ source reservation (cancelled rows kept)
--   court_occupancies             derived, ACTIVE concrete time intervals for availability
--   customer_external_identities  CRM customer ↔ LAZUZ client_id links
--   integration_sync_runs         one row per sync run (safe, non-secret diagnostics)
--
-- Access model (same as customers): RLS on; the Owner can SELECT; browser
-- sessions can never INSERT/UPDATE/DELETE. All writes come from the backend
-- sync job using the service role, which bypasses RLS.
--
-- Time model: LAZUZ sends club wall-clock values (no time zone). Source rows
-- keep them exactly as sent (date + time columns). Occurrences are converted
-- to timestamptz using Asia/Jerusalem by the sync code
-- (lib/integrations/lazuz/time.ts) before being written here.
--
-- Depends on: public.customers, public.is_owner() (20260928120000).
-- Requires no extensions.

begin;

-- ───────────────────────────────────────────────────────────────
-- 0. Shared trigger function: updated_at
-- ───────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger: sets updated_at to now().';

-- ───────────────────────────────────────────────────────────────
-- 1. courts
-- ───────────────────────────────────────────────────────────────

create table if not exists public.courts (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null default 'lazuz',
  external_id      text not null,
  club_external_id text not null,
  name             text not null,
  sport_type       text,
  indoor_outdoor   text,
  is_active        boolean not null default true,
  raw              jsonb not null default '{}'::jsonb,
  synced_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint courts_provider_check        check (provider in ('lazuz')),
  constraint courts_name_check            check (length(btrim(name)) between 1 and 80),
  constraint courts_indoor_outdoor_check  check (indoor_outdoor is null or indoor_outdoor in ('indoor', 'outdoor')),
  constraint courts_raw_object            check (jsonb_typeof(raw) = 'object'),
  constraint courts_provider_external_id_key unique (provider, external_id)
);

comment on table public.courts is
  'Courts as LAZUZ resources. LAZUZ court_id (e.g. 1294) is external_id. Source: GET /club-management/courts/{club_id}?hierarchical=true (top-level entries).';
comment on column public.courts.sport_type is
  'LAZUZ type_title as sent (e.g. פאדל).';
comment on column public.courts.indoor_outdoor is
  'Not provided by LAZUZ. NULL until set locally.';
comment on column public.courts.synced_at is
  'Last time this row was refreshed from LAZUZ. NULL for the initial seed.';

drop trigger if exists courts_set_updated_at on public.courts;
create trigger courts_set_updated_at
  before update on public.courts
  for each row execute function public.set_updated_at();

-- Seed: the 8 courts confirmed by GET /club-management/courts/213?hierarchical=true
-- on 2026-09-29 (all top-level, parentId null, type_title פאדל).
insert into public.courts (provider, external_id, club_external_id, name, sport_type, raw)
values
  ('lazuz', '1294', '213', 'מגרש 1', 'פאדל', '{"id":1294,"title":"מגרש 1","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1295', '213', 'מגרש 2', 'פאדל', '{"id":1295,"title":"מגרש 2","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1296', '213', 'מגרש 3', 'פאדל', '{"id":1296,"title":"מגרש 3","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1297', '213', 'מגרש 4', 'פאדל', '{"id":1297,"title":"מגרש 4","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1298', '213', 'מגרש 5', 'פאדל', '{"id":1298,"title":"מגרש 5","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1299', '213', 'מגרש 6', 'פאדל', '{"id":1299,"title":"מגרש 6","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1300', '213', 'מגרש 7', 'פאדל', '{"id":1300,"title":"מגרש 7","type_title":"פאדל","parentId":null}'),
  ('lazuz', '1301', '213', 'מגרש 8', 'פאדל', '{"id":1301,"title":"מגרש 8","type_title":"פאדל","parentId":null}')
on conflict (provider, external_id) do nothing;

-- ───────────────────────────────────────────────────────────────
-- 2. court_reservations — one row per LAZUZ source reservation
-- ───────────────────────────────────────────────────────────────

create table if not exists public.court_reservations (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null default 'lazuz',
  external_id             text not null,
  club_external_id        text,
  court_id                uuid not null references public.courts(id) on delete restrict,

  booking_type            text not null,
  occupancy_type          text not null,
  status                  text,
  canceled                boolean not null default false,
  canceled_reason         text,

  price                   numeric(10,2),
  is_paid                 boolean,
  charging_type_id        integer,
  user_subscription_id    text,
  class_id                text,

  parent_external_id      text,
  is_recurring            boolean not null default false,
  recurrence_day_of_week  smallint,

  start_date              date not null,
  start_time              time not null,
  end_date                date not null,
  end_time                time not null,

  title                   text,
  event_description       text,

  client_external_id      text,
  customer_name_snapshot  text,
  customer_phone_e164     text,
  customer_email_snapshot text,
  -- RESTRICT: customers are archived, never hard-deleted, and a matched
  -- reservation must keep its customer (see court_reservations_match_customer).
  customer_id             uuid references public.customers(id) on delete restrict,
  match_status            text not null,
  matched_at              timestamptz,

  raw                     jsonb not null,
  external_created_at     timestamptz,
  first_seen_at           timestamptz not null default now(),
  last_seen_at            timestamptz not null default now(),
  sync_state              text not null default 'present',

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint court_reservations_provider_check
    check (provider in ('lazuz')),
  constraint court_reservations_provider_external_id_key
    unique (provider, external_id),
  constraint court_reservations_occupancy_type_check
    check (occupancy_type in ('customer_booking', 'internal_booking', 'blocked', 'unknown')),
  constraint court_reservations_price_check
    check (price is null or price >= 0),
  constraint court_reservations_dow_check
    check (recurrence_day_of_week is null or recurrence_day_of_week between 0 and 6),
  constraint court_reservations_date_order_check
    check (end_date >= start_date),
  constraint court_reservations_phone_e164
    check (customer_phone_e164 is null or customer_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint court_reservations_sync_state_check
    check (sync_state in ('present', 'missing')),
  constraint court_reservations_match_status_check
    check (match_status in ('matched_client_id', 'matched_phone', 'manual', 'ambiguous', 'unmatched', 'not_applicable')),
  -- Only customer bookings take part in customer matching.
  constraint court_reservations_match_applicability
    check ((occupancy_type = 'customer_booking') = (match_status <> 'not_applicable')),
  -- A customer is linked exactly when the match status says so.
  constraint court_reservations_match_customer
    check ((match_status in ('matched_client_id', 'matched_phone', 'manual')) = (customer_id is not null)),
  constraint court_reservations_raw_object
    check (jsonb_typeof(raw) = 'object')
);

comment on table public.court_reservations is
  'One row per LAZUZ reservation (GET /reservations). Represents court OCCUPANCY, not only customer bookings: internal (int) and blocked (na) rows have no customer. Rows are never hard-deleted: cancelled rows keep canceled = true, and rows that disappear from the feed get sync_state = missing.';
comment on column public.court_reservations.booking_type is
  'LAZUZ booking_type as sent: ext (customer booking), int (internal booking), na (blocked/hold), or other.';
comment on column public.court_reservations.occupancy_type is
  'Derived: ext → customer_booking, int → internal_booking, na → blocked (provisional), otherwise unknown.';
comment on column public.court_reservations.canceled is
  'LAZUZ canceled = 1. Cancelled rows are kept as source records but produce no court_occupancies.';
comment on column public.court_reservations.is_paid is
  'From LAZUZ payed (1/0), else is_paid_reservation. NULL when LAZUZ does not say.';
comment on column public.court_reservations.parent_external_id is
  'LAZUZ parentResId: split-series continuation link. When one occurrence of a recurring series is removed, LAZUZ ends the original series the day before and creates a continuation series (from date + 7) pointing to the original id. The removed date is a gap between the two series; an edited occurrence is a separate one-off reservation.';
comment on column public.court_reservations.is_recurring is
  'LAZUZ is_recurring = "1". For recurring rows, start_date..end_date is the SERIES range and start_time..end_time the weekly slot; occurrences are the dates in the range whose weekday equals recurrence_day_of_week.';
comment on column public.court_reservations.recurrence_day_of_week is
  'LAZUZ day_of_week: 0 = Sunday … 6 = Saturday.';
comment on column public.court_reservations.start_date is
  'Club wall-clock date as sent by LAZUZ (Asia/Jerusalem, no time zone). Do not interpret as UTC.';
comment on column public.court_reservations.start_time is
  'Club wall-clock time as sent by LAZUZ (Asia/Jerusalem, no time zone).';
comment on column public.court_reservations.title is
  'Free-text LAZUZ label. May contain a person''s name — treat as personal data.';
comment on column public.court_reservations.customer_phone_e164 is
  'LAZUZ phone normalized to E.164 (+972…) for matching. Snapshot; the customer record is the source of truth.';
comment on column public.court_reservations.match_status is
  'matched_client_id: known LAZUZ client_id · matched_phone: exactly one non-archived customer with this phone · manual: linked by the Owner · ambiguous: several customers share the phone · unmatched: none · not_applicable: not a customer booking. Customers are never auto-created or merged.';
comment on column public.court_reservations.sync_state is
  'present: seen in the latest sync of its date range · missing: no longer returned by LAZUZ (never hard-deleted).';

create index if not exists court_reservations_court_start_idx
  on public.court_reservations (court_id, start_date);
create index if not exists court_reservations_customer_idx
  on public.court_reservations (customer_id, start_date desc) where customer_id is not null;
create index if not exists court_reservations_client_idx
  on public.court_reservations (client_external_id) where client_external_id is not null;
create index if not exists court_reservations_phone_idx
  on public.court_reservations (customer_phone_e164) where customer_phone_e164 is not null;
create index if not exists court_reservations_match_review_idx
  on public.court_reservations (match_status) where match_status in ('ambiguous', 'unmatched');
create index if not exists court_reservations_parent_idx
  on public.court_reservations (parent_external_id) where parent_external_id is not null;
create index if not exists court_reservations_missing_idx
  on public.court_reservations (last_seen_at) where sync_state = 'missing';

-- updated_at changes only when the reservation itself changes — not when a
-- sync merely confirms it (last_seen_at). first_seen_at is immutable.
create or replace function public.court_reservations_set_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.first_seen_at := old.first_seen_at;
  new.created_at := old.created_at;
  if (to_jsonb(new) - 'last_seen_at' - 'updated_at') is distinct from
     (to_jsonb(old) - 'last_seen_at' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$$;

drop trigger if exists court_reservations_set_timestamps on public.court_reservations;
create trigger court_reservations_set_timestamps
  before update on public.court_reservations
  for each row execute function public.court_reservations_set_timestamps();

-- ───────────────────────────────────────────────────────────────
-- 3. court_occupancies — derived ACTIVE intervals
-- ───────────────────────────────────────────────────────────────

create table if not exists public.court_occupancies (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.court_reservations(id) on delete cascade,
  court_id       uuid not null references public.courts(id) on delete restrict,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  local_date     date not null,
  occupancy_type text not null,
  customer_id    uuid references public.customers(id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint court_occupancies_time_order check (ends_at > starts_at),
  constraint court_occupancies_occupancy_type_check
    check (occupancy_type in ('customer_booking', 'internal_booking', 'blocked', 'unknown')),
  constraint court_occupancies_reservation_start_key unique (reservation_id, starts_at)
);

comment on table public.court_occupancies is
  'Concrete, ACTIVE court occupancy intervals derived from court_reservations (recurring series expanded by day_of_week). Never contains cancelled or missing reservations. Rebuilt by the sync job for a rolling horizon; rows here are derived data, not source records.';
comment on column public.court_occupancies.starts_at is
  'Real instant, converted from the club wall-clock time using Asia/Jerusalem.';
comment on column public.court_occupancies.local_date is
  'Club-local (Asia/Jerusalem) date the occurrence starts on.';
comment on column public.court_occupancies.customer_id is
  'Copied from court_reservations.customer_id and kept in sync by trigger.';

create index if not exists court_occupancies_court_start_idx
  on public.court_occupancies (court_id, starts_at);
create index if not exists court_occupancies_customer_idx
  on public.court_occupancies (customer_id, starts_at desc) where customer_id is not null;
-- Overlap / free-slot queries: tstzrange(starts_at, ends_at) && tstzrange(...)
create index if not exists court_occupancies_range_gist
  on public.court_occupancies using gist (tstzrange(starts_at, ends_at, '[)'));

-- Guard: an occupancy can only belong to an active reservation, on the same
-- court, with the same occupancy type and customer.
create or replace function public.court_occupancies_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
begin
  select canceled, sync_state, court_id, occupancy_type, customer_id
    into r
    from public.court_reservations
   where id = new.reservation_id;

  if r.canceled or r.sync_state <> 'present' then
    raise exception 'court_occupancies: reservation % is not active', new.reservation_id
      using errcode = 'check_violation';
  end if;

  new.court_id := r.court_id;
  new.occupancy_type := r.occupancy_type;
  new.customer_id := r.customer_id;
  return new;
end
$$;

drop trigger if exists court_occupancies_guard on public.court_occupancies;
create trigger court_occupancies_guard
  before insert or update on public.court_occupancies
  for each row execute function public.court_occupancies_guard();

-- Keep occupancies consistent when their reservation changes: remove them
-- when it becomes cancelled or missing; propagate customer / type changes.
create or replace function public.court_reservations_sync_occupancies()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.canceled or new.sync_state <> 'present' then
    delete from public.court_occupancies where reservation_id = new.id;
  elsif new.customer_id is distinct from old.customer_id
     or new.occupancy_type is distinct from old.occupancy_type
     or new.court_id is distinct from old.court_id then
    update public.court_occupancies
       set customer_id = new.customer_id,
           occupancy_type = new.occupancy_type,
           court_id = new.court_id
     where reservation_id = new.id;
  end if;
  return null;
end
$$;

drop trigger if exists court_reservations_sync_occupancies on public.court_reservations;
create trigger court_reservations_sync_occupancies
  after update of canceled, sync_state, customer_id, occupancy_type, court_id on public.court_reservations
  for each row execute function public.court_reservations_sync_occupancies();

-- ───────────────────────────────────────────────────────────────
-- 4. customer_external_identities — CRM customer ↔ LAZUZ client_id
-- ───────────────────────────────────────────────────────────────

create table if not exists public.customer_external_identities (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  provider    text not null default 'lazuz',
  external_id text not null,
  matched_by  text not null,
  matched_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint customer_external_identities_provider_check check (provider in ('lazuz')),
  constraint customer_external_identities_matched_by_check check (matched_by in ('phone', 'manual')),
  constraint customer_external_identities_provider_external_id_key unique (provider, external_id),
  constraint customer_external_identities_customer_provider_external_key unique (customer_id, provider, external_id)
);

comment on table public.customer_external_identities is
  'Links a CRM customer to a LAZUZ client_id. One LAZUZ client maps to at most one customer; a customer may have several LAZUZ clients. Matching order: known client_id → exactly one non-archived customer with the same E.164 phone → otherwise ambiguous/unmatched. Never auto-creates or merges customers.';
comment on column public.customer_external_identities.matched_by is
  'phone: created from an unambiguous phone match · manual: linked by the Owner.';

create index if not exists customer_external_identities_customer_idx
  on public.customer_external_identities (customer_id);

drop trigger if exists customer_external_identities_set_updated_at on public.customer_external_identities;
create trigger customer_external_identities_set_updated_at
  before update on public.customer_external_identities
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────
-- 5. integration_sync_runs
-- ───────────────────────────────────────────────────────────────

create table if not exists public.integration_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  operation     text not null,
  window_start  date,
  window_end    date,
  status        text not null default 'running',
  fetched_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  missing_count integer not null default 0,
  error         jsonb,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  constraint integration_sync_runs_provider_check check (provider in ('lazuz')),
  constraint integration_sync_runs_operation_check check (operation ~ '^[a-z][a-z_]{0,39}$'),
  constraint integration_sync_runs_status_check check (status in ('running', 'success', 'partial', 'failed')),
  constraint integration_sync_runs_window_check check (window_end is null or window_start is null or window_end >= window_start),
  constraint integration_sync_runs_counts_check check (
    fetched_count >= 0 and created_count >= 0 and updated_count >= 0 and skipped_count >= 0 and missing_count >= 0
  ),
  constraint integration_sync_runs_finished_check check ((status = 'running') = (finished_at is null)),
  constraint integration_sync_runs_finish_order check (finished_at is null or finished_at >= started_at),
  constraint integration_sync_runs_error_check check (
    error is null or (jsonb_typeof(error) = 'object' and pg_column_size(error) <= 8192)
  )
);

comment on table public.integration_sync_runs is
  'One row per integration sync run.';
comment on column public.integration_sync_runs.error is
  'IntegrationError.toSafeJSON() only (kind, message, operation, status, attempts, hint). Never tokens, credentials, request bodies, raw responses or personal data.';

create index if not exists integration_sync_runs_recent_idx
  on public.integration_sync_runs (provider, operation, started_at desc);

-- ───────────────────────────────────────────────────────────────
-- 6. Access: RLS on; Owner SELECT only; writes via service role only
-- ───────────────────────────────────────────────────────────────

alter table public.courts                       enable row level security;
alter table public.court_reservations           enable row level security;
alter table public.court_occupancies            enable row level security;
alter table public.customer_external_identities enable row level security;
alter table public.integration_sync_runs        enable row level security;

drop policy if exists "owner reads courts" on public.courts;
create policy "owner reads courts"
  on public.courts for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "owner reads court reservations" on public.court_reservations;
create policy "owner reads court reservations"
  on public.court_reservations for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "owner reads court occupancies" on public.court_occupancies;
create policy "owner reads court occupancies"
  on public.court_occupancies for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "owner reads customer external identities" on public.customer_external_identities;
create policy "owner reads customer external identities"
  on public.customer_external_identities for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "owner reads integration sync runs" on public.integration_sync_runs;
create policy "owner reads integration sync runs"
  on public.integration_sync_runs for select to authenticated
  using ((select public.is_owner()));

-- No INSERT/UPDATE/DELETE policies, and no write privileges for browser roles.
revoke all on public.courts, public.court_reservations, public.court_occupancies,
              public.customer_external_identities, public.integration_sync_runs
  from anon;
revoke insert, update, delete, truncate
  on public.courts, public.court_reservations, public.court_occupancies,
     public.customer_external_identities, public.integration_sync_runs
  from authenticated;
grant select
  on public.courts, public.court_reservations, public.court_occupancies,
     public.customer_external_identities, public.integration_sync_runs
  to authenticated;
grant all
  on public.courts, public.court_reservations, public.court_occupancies,
     public.customer_external_identities, public.integration_sync_runs
  to service_role;

-- Trigger functions are not meant to be called directly.
revoke execute on function public.set_updated_at()                      from public, anon, authenticated;
revoke execute on function public.court_reservations_set_timestamps()   from public, anon, authenticated;
revoke execute on function public.court_occupancies_guard()             from public, anon, authenticated;
revoke execute on function public.court_reservations_sync_occupancies() from public, anon, authenticated;

commit;

-- ───────────────────────────────────────────────────────────────
-- ROLLBACK (manual; run only if you intend to discard this schema)
-- All data in these tables can be re-fetched from LAZUZ, except
-- customer_external_identities with matched_by = 'manual' and any
-- match decisions — export them first if they matter.
--
-- begin;
-- drop table if exists public.court_occupancies;
-- drop table if exists public.court_reservations;
-- drop table if exists public.customer_external_identities;
-- drop table if exists public.integration_sync_runs;
-- drop table if exists public.courts;
-- drop function if exists public.court_reservations_sync_occupancies();
-- drop function if exists public.court_occupancies_guard();
-- drop function if exists public.court_reservations_set_timestamps();
-- drop function if exists public.set_updated_at();   -- only if no other table uses it
-- commit;
-- ───────────────────────────────────────────────────────────────
