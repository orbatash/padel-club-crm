import 'server-only'

import { requireOwner } from '@/lib/auth'
import { dayWindow } from './day'
import { buildDaySchedule, type CourtRow, type DaySchedule, type OccupancyRow } from './schedule'

// Read-only court schedule data. Owner session + RLS-bound client (never the
// service role). Only display fields are selected — never raw LAZUZ JSON,
// phones or emails.

export class CourtsDataError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'CourtsDataError'
  }
}

export type SyncCoverage = {
  /** Any LAZUZ sync has ever completed. */
  hasSyncedData: boolean
  /** A successful/partial sync window included this date. */
  dayCovered: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
}

export type CourtsDay = { schedule: DaySchedule; coverage: SyncCoverage }

const OCCUPANCY_SELECT =
  'id, court_id, starts_at, ends_at, occupancy_type, reservation:court_reservations(status, price, is_paid, title, match_status, customer_name_snapshot, is_recurring), customer:customers(id, full_name)' as const

export async function getCourtsDay(date: string): Promise<CourtsDay> {
  const { supabase } = await requireOwner()
  const window = dayWindow(date)

  const [courts, occupancies, coveringRun, lastRun] = await Promise.all([
    supabase.from('courts').select('id, name, external_id, sport_type').eq('provider', 'lazuz').eq('is_active', true),
    // Everything that overlaps the local day, including bookings that cross midnight.
    supabase
      .from('court_occupancies')
      .select(OCCUPANCY_SELECT)
      .lt('starts_at', window.endUtc)
      .gt('ends_at', window.startUtc)
      .order('starts_at'),
    supabase
      .from('integration_sync_runs')
      .select('id')
      .eq('provider', 'lazuz')
      .in('status', ['success', 'partial'])
      .lte('window_start', date)
      .gte('window_end', date)
      .limit(1),
    supabase
      .from('integration_sync_runs')
      .select('status, started_at, finished_at')
      .eq('provider', 'lazuz')
      .in('status', ['success', 'partial'])
      .order('started_at', { ascending: false })
      .limit(1),
  ])

  for (const result of [courts, occupancies, coveringRun, lastRun]) {
    if (result.error) throw new CourtsDataError('טעינת לוח המגרשים נכשלה', result.error.code)
  }

  const last = lastRun.data?.[0] ?? null
  return {
    schedule: buildDaySchedule(window, (courts.data ?? []) satisfies CourtRow[], (occupancies.data ?? []) satisfies OccupancyRow[]),
    coverage: {
      hasSyncedData: Boolean(last),
      dayCovered: (coveringRun.data?.length ?? 0) > 0,
      lastSyncAt: last ? (last.finished_at ?? last.started_at) : null,
      lastSyncStatus: last?.status ?? null,
    },
  }
}
