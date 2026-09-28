import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { IntegrationError } from '@/lib/integrations/core/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExistingReservation, SyncStore, SyncWindow } from './types'

// SyncStore backed by the service-role Supabase client. Server-only: the
// service-role key never leaves the server. Every call is one PostgREST
// request, i.e. one database transaction.

const IN_CHUNK = 100 // keeps `in.(…)` filters well under URL limits
const WRITE_CHUNK = 500
const PAGE = 1000 // PostgREST default max rows

type Db = SupabaseClient<Database>

function fail(operation: string, error: { code?: string; message?: string }): never {
  // Database messages can include values; expose only the error code and, for
  // constraint violations, the constraint's name (an identifier, never data).
  const constraint = /constraint "([a-z0-9_]+)"/i.exec(error.message ?? '')?.[1]
  const hint = [error.code && `code ${error.code}`, constraint && `constraint ${constraint}`].filter(Boolean).join(', ')
  throw new IntegrationError('transient', 'Database operation failed', {
    provider: 'lazuz',
    operation: `db.${operation}`,
    hint: hint || undefined,
  })
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const EXISTING_COLUMNS =
  'id, external_id, club_external_id, court_id, booking_type, occupancy_type, status, canceled, canceled_reason, price, is_paid, charging_type_id, user_subscription_id, class_id, parent_external_id, is_recurring, recurrence_day_of_week, start_date, start_time, end_date, end_time, title, event_description, client_external_id, customer_name_snapshot, customer_phone_e164, customer_email_snapshot, customer_id, match_status, matched_at, raw, external_created_at, sync_state, provider'

export function createSupabaseSyncStore(db: Db = createAdminClient()): SyncStore {
  return {
    async loadCourts() {
      const { data, error } = await db
        .from('courts')
        .select('id, external_id, name, sport_type')
        .eq('provider', 'lazuz')
      if (error) fail('loadCourts', error)
      return data
    },

    async upsertCourts(rows) {
      const { data, error } = await db
        .from('courts')
        .upsert(rows, { onConflict: 'provider,external_id' })
        .select('id, external_id')
      if (error) fail('upsertCourts', error)
      return data
    },

    async loadReservationsByExternalIds(externalIds) {
      const out: ExistingReservation[] = []
      for (const ids of chunks(externalIds, IN_CHUNK)) {
        const { data, error } = await db
          .from('court_reservations')
          .select(EXISTING_COLUMNS)
          .eq('provider', 'lazuz')
          .in('external_id', ids)
        if (error) fail('loadReservations', error)
        out.push(...(data as unknown as ExistingReservation[]))
      }
      return out
    },

    async loadPresentOverlapping(window: SyncWindow) {
      const out: { id: string; external_id: string }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('court_reservations')
          .select('id, external_id')
          .eq('provider', 'lazuz')
          .eq('sync_state', 'present')
          .lte('start_date', window.end)
          .gte('end_date', window.start)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) fail('loadPresentOverlapping', error)
        out.push(...data)
        if (data.length < PAGE) return out
      }
    },

    async upsertReservations(rows) {
      const out: { id: string; external_id: string }[] = []
      for (const batch of chunks(rows, WRITE_CHUNK)) {
        const { data, error } = await db
          .from('court_reservations')
          .upsert(batch, { onConflict: 'provider,external_id' })
          .select('id, external_id')
        if (error) fail('upsertReservations', error)
        out.push(...data)
      }
      return out
    },

    async markMissing(ids) {
      let count = 0
      for (const batch of chunks(ids, IN_CHUNK)) {
        const { data, error } = await db
          .from('court_reservations')
          .update({ sync_state: 'missing' })
          .in('id', batch)
          .eq('sync_state', 'present')
          .select('id')
        if (error) fail('markMissing', error)
        count += data.length
      }
      return count
    },

    async loadIdentities(clientExternalIds) {
      const out: { external_id: string; customer_id: string }[] = []
      for (const ids of chunks(clientExternalIds, IN_CHUNK)) {
        const { data, error } = await db
          .from('customer_external_identities')
          .select('external_id, customer_id')
          .eq('provider', 'lazuz')
          .in('external_id', ids)
        if (error) fail('loadIdentities', error)
        out.push(...data)
      }
      return out
    },

    async loadActiveCustomersByPhones(phones) {
      const out: { id: string; phone: string }[] = []
      for (const batch of chunks(phones, IN_CHUNK)) {
        const { data, error } = await db
          .from('customers')
          .select('id, phone')
          .in('phone', batch)
          .is('archived_at', null)
        if (error) fail('loadCustomersByPhone', error)
        for (const row of data) if (row.phone) out.push({ id: row.id, phone: row.phone })
      }
      return out
    },

    async insertIdentities(rows) {
      for (const batch of chunks(rows, WRITE_CHUNK)) {
        const { error } = await db
          .from('customer_external_identities')
          .upsert(batch, { onConflict: 'provider,external_id', ignoreDuplicates: true })
        if (error) fail('insertIdentities', error)
      }
    },

    async loadOccupancies(window) {
      const out: { id: string; reservation_id: string; starts_at: string; ends_at: string }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('court_occupancies')
          .select('id, reservation_id, starts_at, ends_at')
          .gte('local_date', window.start)
          .lte('local_date', window.end)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) fail('loadOccupancies', error)
        out.push(...data)
        if (data.length < PAGE) return out
      }
    },

    async upsertOccupancies(rows) {
      for (const batch of chunks(rows, WRITE_CHUNK)) {
        const { error } = await db
          .from('court_occupancies')
          .upsert(batch, { onConflict: 'reservation_id,starts_at' })
        if (error) fail('upsertOccupancies', error)
      }
    },

    async deleteOccupancies(ids) {
      let count = 0
      for (const batch of chunks(ids, IN_CHUNK)) {
        const { data, error } = await db.from('court_occupancies').delete().in('id', batch).select('id')
        if (error) fail('deleteOccupancies', error)
        count += data.length
      }
      return count
    },

    async hasRecentRunningRun(operation, sinceIso) {
      const { data, error } = await db
        .from('integration_sync_runs')
        .select('id')
        .eq('provider', 'lazuz')
        .eq('operation', operation)
        .eq('status', 'running')
        .gte('started_at', sinceIso)
        .limit(1)
      if (error) fail('hasRecentRunningRun', error)
      return data.length > 0
    },

    async startRun(operation, window) {
      const { data, error } = await db
        .from('integration_sync_runs')
        .insert({ provider: 'lazuz', operation, window_start: window.start, window_end: window.end })
        .select('id, started_at')
        .single()
      if (error) fail('startRun', error)
      return { id: data.id, startedAt: data.started_at }
    },

    async finishRun(id, finish) {
      const { data, error } = await db
        .from('integration_sync_runs')
        .update({ ...finish, error: finish.error as Database['public']['Tables']['integration_sync_runs']['Update']['error'] })
        .eq('id', id)
        .select('id')
      if (error) fail('finishRun', error)
      // An update that matched no row is a failure too, not a silent success.
      if (data.length !== 1) fail('finishRun', { code: 'no_row_updated' })
    },
  }
}

