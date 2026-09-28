import type { Json } from '@/lib/database.types'
import type { OccupancyType } from '../reservations'

// Types shared by the LAZUZ → Supabase sync. The store interface is the only
// way the sync touches the database; production uses the service-role
// Supabase client (supabase-store.ts), tests use a real Postgres.

export type MatchStatus =
  | 'matched_client_id'
  | 'matched_phone'
  | 'manual'
  | 'ambiguous'
  | 'unmatched'
  | 'not_applicable'

export type SyncWindow = { start: string; end: string }

export type CourtRow = { id: string; external_id: string; name: string; sport_type: string | null }

export type CourtUpsert = {
  provider: 'lazuz'
  external_id: string
  club_external_id: string
  name: string
  sport_type: string | null
  raw: Json
  synced_at: string
}

/** Columns the sync writes to court_reservations (never id/created_at/first_seen_at/updated_at). */
export type ReservationUpsert = {
  provider: 'lazuz'
  external_id: string
  club_external_id: string | null
  court_id: string
  booking_type: string
  occupancy_type: OccupancyType
  status: string | null
  canceled: boolean
  canceled_reason: string | null
  price: number | null
  is_paid: boolean | null
  charging_type_id: number | null
  user_subscription_id: string | null
  class_id: string | null
  parent_external_id: string | null
  is_recurring: boolean
  recurrence_day_of_week: number | null
  start_date: string
  start_time: string
  end_date: string
  end_time: string
  title: string | null
  event_description: string | null
  client_external_id: string | null
  customer_name_snapshot: string | null
  customer_phone_e164: string | null
  customer_email_snapshot: string | null
  customer_id: string | null
  match_status: MatchStatus
  matched_at: string | null
  /** Original LAZUZ record (parsed JSON). */
  raw: Json
  external_created_at: string | null
  last_seen_at: string
  sync_state: 'present'
}

/** Existing row as stored — only the columns the sync compares. */
export type ExistingReservation = Omit<ReservationUpsert, 'last_seen_at' | 'sync_state' | 'match_status'> & {
  id: string
  match_status: MatchStatus
  sync_state: 'present' | 'missing'
}

export type IdentityInsert = { provider: 'lazuz'; external_id: string; customer_id: string; matched_by: 'phone' }

export type OccupancyRow = { id: string; reservation_id: string; starts_at: string; ends_at: string }

export type OccupancyUpsert = {
  reservation_id: string
  court_id: string
  starts_at: string
  ends_at: string
  local_date: string
  occupancy_type: OccupancyType
  customer_id: string | null
}

export type RunStatus = 'running' | 'success' | 'partial' | 'failed'

export type RunFinish = {
  status: Exclude<RunStatus, 'running'>
  fetched_count: number
  created_count: number
  updated_count: number
  skipped_count: number
  missing_count: number
  error: Record<string, unknown> | null
  finished_at: string
}

export interface SyncStore {
  loadCourts(): Promise<CourtRow[]>
  upsertCourts(rows: CourtUpsert[]): Promise<{ id: string; external_id: string }[]>

  loadReservationsByExternalIds(externalIds: string[]): Promise<ExistingReservation[]>
  /** Present rows whose date range overlaps the window (start_date ≤ end and end_date ≥ start). */
  loadPresentOverlapping(window: SyncWindow): Promise<{ id: string; external_id: string }[]>
  upsertReservations(rows: ReservationUpsert[]): Promise<{ id: string; external_id: string }[]>
  markMissing(ids: string[]): Promise<number>

  loadIdentities(clientExternalIds: string[]): Promise<{ external_id: string; customer_id: string }[]>
  /** Non-archived customers with one of these E.164 phones. Read-only on customers. */
  loadActiveCustomersByPhones(phones: string[]): Promise<{ id: string; phone: string }[]>
  insertIdentities(rows: IdentityInsert[]): Promise<void>

  /** Occupancies whose local_date is inside the window. */
  loadOccupancies(window: SyncWindow): Promise<OccupancyRow[]>
  upsertOccupancies(rows: OccupancyUpsert[]): Promise<void>
  deleteOccupancies(ids: string[]): Promise<number>

  hasRecentRunningRun(operation: string, sinceIso: string): Promise<boolean>
  /**
   * Inserts a 'running' row. Returns the DATABASE's started_at so the finish
   * time can be derived on the same clock (the app clock may be skewed).
   */
  startRun(operation: string, window: SyncWindow): Promise<{ id: string; startedAt: string }>
  /** Must reject (not resolve) if the row was not updated. */
  finishRun(id: string, finish: RunFinish): Promise<void>
}
