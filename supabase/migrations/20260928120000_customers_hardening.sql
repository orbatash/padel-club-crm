-- Customers hardening
-- Status: APPLIED manually via the Supabase SQL Editor (2026-09-28) and
-- verified: RLS on, owner-only select/insert/update, player_level
-- numeric(2,1), phone/email indexed but not unique, full_name nullable,
-- audit trigger present, anon has no access.
--
-- Prerequisite (run once, separately, BEFORE this migration, then sign out/in):
--   update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'
--   where email = '<owner email>';
--
-- Safe to re-run: every step is idempotent. No data is deleted; the table is
-- currently empty, so no backfill is needed.

begin;

-- ───────────────────────────────────────────────────────────────
-- 1. New columns
-- ───────────────────────────────────────────────────────────────

alter table public.customers
  add column if not exists archived_at timestamptz,
  add column if not exists created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists updated_by  uuid references auth.users(id) on delete set null;

comment on column public.customers.archived_at is
  'Soft archive. Set instead of deleting; archived customers are hidden from default views.';
comment on column public.customers.created_by is
  'Human Supabase user (the Owner) who created the row, if any. Not the AI/system audit trail.';
comment on column public.customers.updated_by is
  'Human Supabase user (the Owner) who last updated the row, if any. Not the AI/system audit trail.';

-- ───────────────────────────────────────────────────────────────
-- 2. Tighten existing columns
-- ───────────────────────────────────────────────────────────────

-- player_level: text → numeric club rating (1.0–5.0 in 0.5 steps).
-- The table is empty; the USING clause still converts any numeric-looking
-- text safely and turns blanks into NULL.
alter table public.customers
  drop constraint if exists customers_player_level_check;

alter table public.customers
  alter column player_level type numeric(2,1)
  using nullif(btrim(player_level::text), '')::numeric(2,1);

-- full_name stays nullable: customers can arrive from inbound channels
-- (WhatsApp, Instagram, …) before their real name is known.
alter table public.customers
  alter column full_name        drop not null,
  alter column status           set default 'new',
  alter column status           set not null,
  alter column interests        set default '{}',
  alter column interests        set not null,
  alter column tags             set default '{}',
  alter column tags             set not null,
  alter column whatsapp_opt_in  set not null,
  alter column marketing_opt_in set not null;

-- ───────────────────────────────────────────────────────────────
-- 3. Data rules (the app validates first; these are the backstop)
-- ───────────────────────────────────────────────────────────────

alter table public.customers
  drop constraint if exists customers_full_name_check,
  add  constraint customers_full_name_check
       check (full_name is null
              or (full_name = btrim(full_name) and length(full_name) between 1 and 120)),

  drop constraint if exists customers_phone_e164,
  add  constraint customers_phone_e164
       check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),

  drop constraint if exists customers_email_check,
  add  constraint customers_email_check
       check (email is null or (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),

  drop constraint if exists customers_instagram_check,
  add  constraint customers_instagram_check
       check (instagram_username is null or instagram_username ~ '^[a-z0-9._]{1,30}$'),

  drop constraint if exists customers_status_check,
  add  constraint customers_status_check
       check (status in ('new', 'active', 'inactive')),

  drop constraint if exists customers_source_check,
  add  constraint customers_source_check
       check (source is null or source in (
         'walk_in', 'phone', 'whatsapp', 'instagram', 'facebook', 'website', 'google',
         'referral', 'lazuz', 'shopify', 'event', 'campaign', 'other'
       )),

  add  constraint customers_player_level_check
       check (player_level is null
              or (player_level between 1.0 and 5.0 and player_level * 2 = trunc(player_level * 2))),

  drop constraint if exists customers_notes_length,
  add  constraint customers_notes_length
       check (notes is null or length(notes) <= 10000);

comment on column public.customers.full_name is
  'Trimmed, 1–120 chars, or NULL when the name is not known yet (no placeholder names).';
comment on column public.customers.status is
  'Customer lifecycle: new | active | inactive. Leads and sales stages live in a separate leads model.';
comment on column public.customers.source is
  'First-touch acquisition channel. Detailed attribution (UTM etc.) will be modeled separately.';
comment on column public.customers.phone is
  'E.164 (e.g. +972501234567). Normalized by the app; not unique (families may share a number).';
comment on column public.customers.email is
  'Lowercased and trimmed. Not unique (families may share an address).';
comment on column public.customers.player_level is
  'Club rating 1.0–5.0 in 0.5 steps; NULL = unknown. External ratings (e.g. LAZUZ) are mapped onto this scale.';

-- ───────────────────────────────────────────────────────────────
-- 4. Indexes (duplicate checks, search, default sort)
--    Phone and email are indexed but deliberately NOT unique:
--    families and children may share contact details.
-- ───────────────────────────────────────────────────────────────

-- Remove legacy uniqueness. If either was created as a UNIQUE constraint,
-- dropping the constraint also drops its index; otherwise drop the index.
alter table public.customers
  drop constraint if exists customers_phone_unique,
  drop constraint if exists customers_email_unique;
drop index if exists public.customers_phone_unique;
drop index if exists public.customers_email_unique;

create index if not exists customers_phone_idx
  on public.customers (phone) where phone is not null;
create index if not exists customers_email_idx
  on public.customers (email) where email is not null;
create index if not exists customers_created_at_idx
  on public.customers (created_at desc);
create index if not exists customers_name_idx
  on public.customers (full_name) where archived_at is null;

-- ───────────────────────────────────────────────────────────────
-- 5. Row audit fields maintained by the database
-- ───────────────────────────────────────────────────────────────

-- The database, not the client, owns these four fields.
-- auth.uid() is the signed-in human (the Owner); it is NULL for
-- service-role / system writes, which will be attributed by the
-- future audit/event model instead.
create or replace function public.customers_set_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;   -- creation facts are immutable
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists customers_audit_fields on public.customers;
create trigger customers_audit_fields
  before insert or update on public.customers
  for each row execute function public.customers_set_audit_fields();

-- ───────────────────────────────────────────────────────────────
-- 6. Owner-only access (RLS)
--    One human user. app_metadata can only be set with the service
--    role, so users cannot grant it to themselves. This is not a
--    staff-role system.
-- ───────────────────────────────────────────────────────────────

create or replace function public.is_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'owner', false)
$$;

comment on function public.is_owner() is
  'True only for the single human Owner (app_metadata.role = owner). Used by RLS policies.';

revoke execute on function public.is_owner() from public, anon;
grant  execute on function public.is_owner() to authenticated;

alter table public.customers enable row level security;

-- Replace any existing policies on this table with the explicit set below.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'customers'
  loop
    execute format('drop policy %I on public.customers', p.policyname);
  end loop;
end
$$;

create policy "owner reads customers"
  on public.customers for select to authenticated
  using ((select public.is_owner()));

create policy "owner creates customers"
  on public.customers for insert to authenticated
  with check ((select public.is_owner()));

create policy "owner updates customers"
  on public.customers for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- Table privileges. Deliberately no DELETE: customers are archived, never
-- deleted, via the API. RLS above further limits rows to the Owner.
revoke all                      on public.customers from anon;
revoke delete, truncate         on public.customers from authenticated;
grant  select, insert, update   on public.customers to authenticated;

commit;
