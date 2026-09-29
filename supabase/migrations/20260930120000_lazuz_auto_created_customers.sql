-- LAZUZ: allow auto-created CRM customers
-- Status: PROPOSED — not applied. Apply manually in the Supabase SQL Editor
-- after review. Constraint-only change: no new columns, no data changes.
--
-- Adds the value 'auto_created' where a CRM customer was created by the LAZUZ
-- sync (zero non-archived customers matched the booking's E.164 phone):
--   customer_external_identities.matched_by : phone | manual | auto_created
--   court_reservations.match_status         : … | auto_created
-- and counts 'auto_created' as a linked status in the customer-link rule.
--
-- Safe to re-run. Existing rows already satisfy the new constraints (they only
-- widen the allowed values).

begin;

alter table public.customer_external_identities
  drop constraint if exists customer_external_identities_matched_by_check,
  add  constraint customer_external_identities_matched_by_check
       check (matched_by in ('phone', 'manual', 'auto_created'));

comment on column public.customer_external_identities.matched_by is
  'phone: created from an unambiguous phone match · manual: linked by the Owner · auto_created: the sync created the CRM customer because no non-archived customer had this phone.';

alter table public.court_reservations
  drop constraint if exists court_reservations_match_status_check,
  add  constraint court_reservations_match_status_check
       check (match_status in ('matched_client_id', 'matched_phone', 'manual', 'auto_created', 'ambiguous', 'unmatched', 'not_applicable')),
  drop constraint if exists court_reservations_match_customer,
  add  constraint court_reservations_match_customer
       check ((match_status in ('matched_client_id', 'matched_phone', 'manual', 'auto_created')) = (customer_id is not null));

comment on column public.court_reservations.match_status is
  'matched_client_id: known LAZUZ client_id · matched_phone: exactly one non-archived customer with this phone · manual: linked by the Owner · auto_created: the sync created the customer (no non-archived customer had this phone) · ambiguous: several customers share the phone · unmatched: none (or no valid phone) · not_applicable: not a customer booking. Customers are never merged.';

commit;

-- ROLLBACK (only if no row uses 'auto_created' yet):
-- begin;
-- alter table public.customer_external_identities
--   drop constraint customer_external_identities_matched_by_check,
--   add constraint customer_external_identities_matched_by_check check (matched_by in ('phone', 'manual'));
-- alter table public.court_reservations
--   drop constraint court_reservations_match_status_check,
--   add constraint court_reservations_match_status_check
--       check (match_status in ('matched_client_id', 'matched_phone', 'manual', 'ambiguous', 'unmatched', 'not_applicable')),
--   drop constraint court_reservations_match_customer,
--   add constraint court_reservations_match_customer
--       check ((match_status in ('matched_client_id', 'matched_phone', 'manual')) = (customer_id is not null));
-- comment on column public.customer_external_identities.matched_by is
--   'phone: created from an unambiguous phone match · manual: linked by the Owner.';
-- comment on column public.court_reservations.match_status is
--   'matched_client_id: known LAZUZ client_id · matched_phone: exactly one non-archived customer with this phone · manual: linked by the Owner · ambiguous: several customers share the phone · unmatched: none · not_applicable: not a customer booking. Customers are never auto-created or merged.';
-- commit;
