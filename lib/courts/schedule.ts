import { clubDateOf, clubMinutesOf, type DayWindow } from './day'

// Pure transformation from database rows to the day-schedule view model.
// Client-safe: no I/O, no raw LAZUZ JSON, only the fields the UI shows.

export type OccupancyType = 'customer_booking' | 'internal_booking' | 'blocked' | 'unknown'
export type MatchState = 'linked' | 'unmatched' | 'ambiguous' | null

export type CourtRow = { id: string; name: string; external_id: string; sport_type: string | null }

/** One court_occupancies row with its reservation and (optional) linked customer. */
export type OccupancyRow = {
  id: string
  court_id: string
  starts_at: string
  ends_at: string
  occupancy_type: string
  reservation: {
    status: string | null
    price: number | null
    is_paid: boolean | null
    title: string | null
    match_status: string
    customer_name_snapshot: string | null
    is_recurring: boolean
  } | null
  customer: { id: string; full_name: string | null } | null
}

export type ScheduleBlock = {
  id: string
  courtId: string
  startsAt: string
  endsAt: string
  /** Minutes since local midnight, clipped to the day. */
  startMin: number
  endMin: number
  /** True when the booking started the previous day / ends the next day. */
  continuesBefore: boolean
  continuesAfter: boolean
  occupancyType: OccupancyType
  /** What to show as the block's main line. */
  label: string
  /** Linked CRM customer (for navigation), if any. */
  customerId: string | null
  match: MatchState
  status: string | null
  price: number | null
  isPaid: boolean | null
  isRecurring: boolean
  /** Side-by-side placement for overlapping blocks in one court. */
  lane: number
  laneCount: number
}

export type ScheduleCourt = { id: string; name: string; sportType: string | null; blocks: ScheduleBlock[] }

export type DaySchedule = {
  date: string
  courts: ScheduleCourt[]
  totals: Record<OccupancyType, number> & { all: number }
  /** Visible time range in minutes since midnight (whole hours). */
  rangeStartMin: number
  rangeEndMin: number
  isEmpty: boolean
}

export const DEFAULT_RANGE = { startMin: 6 * 60, endMin: 24 * 60 }
const DAY_MINUTES = 24 * 60

const OCCUPANCY_TYPES: OccupancyType[] = ['customer_booking', 'internal_booking', 'blocked', 'unknown']
export const asOccupancyType = (value: string): OccupancyType =>
  (OCCUPANCY_TYPES as string[]).includes(value) ? (value as OccupancyType) : 'unknown'

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' })

/** "מגרש 2" before "מגרש 10"; ties by LAZUZ id. */
export function sortCourts<T extends { name: string; external_id: string }>(courts: T[]): T[] {
  return [...courts].sort(
    (a, b) => collator.compare(a.name, b.name) || collator.compare(a.external_id, b.external_id)
  )
}

export const FALLBACK_LABELS: Record<OccupancyType, string> = {
  customer_booking: 'לקוח לא מזוהה',
  internal_booking: 'הזמנה פנימית',
  blocked: 'חסום',
  unknown: 'לא ידוע',
}

function blockLabel(type: OccupancyType, row: OccupancyRow): { label: string; match: MatchState } {
  const r = row.reservation
  if (type === 'customer_booking') {
    const linkedName = row.customer?.full_name?.trim()
    if (row.customer) return { label: linkedName || 'לקוח ללא שם', match: 'linked' }
    const snapshot = r?.customer_name_snapshot?.trim()
    const match: MatchState = r?.match_status === 'ambiguous' ? 'ambiguous' : 'unmatched'
    return { label: snapshot || FALLBACK_LABELS.customer_booking, match }
  }
  return { label: r?.title?.trim() || FALLBACK_LABELS[type], match: null }
}

/** Greedy interval partitioning: each block gets the first free lane of its overlap cluster. */
function assignLanes(blocks: ScheduleBlock[]) {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  let cluster: ScheduleBlock[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    const laneCount = Math.max(1, ...cluster.map((b) => b.lane + 1))
    for (const b of cluster) b.laneCount = laneCount
    cluster = []
  }
  for (const block of sorted) {
    if (cluster.length && block.startMin >= clusterEnd) closeCluster()
    const laneEnds: number[] = []
    for (const b of cluster) laneEnds[b.lane] = Math.max(laneEnds[b.lane] ?? -1, b.endMin)
    let lane = laneEnds.findIndex((end) => end <= block.startMin)
    if (lane === -1) lane = laneEnds.length
    block.lane = lane
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.endMin)
  }
  if (cluster.length) closeCluster()
  return sorted
}

export function buildDaySchedule(window: DayWindow, courts: CourtRow[], rows: OccupancyRow[]): DaySchedule {
  const totals = { customer_booking: 0, internal_booking: 0, blocked: 0, unknown: 0, all: 0 }
  const byCourt = new Map<string, ScheduleBlock[]>()

  for (const row of rows) {
    const type = asOccupancyType(row.occupancy_type)
    const continuesBefore = Date.parse(row.starts_at) < Date.parse(window.startUtc)
    const continuesAfter = Date.parse(row.ends_at) > Date.parse(window.endUtc)
    const startMin = continuesBefore ? 0 : clubMinutesOf(row.starts_at)
    let endMin = continuesAfter ? DAY_MINUTES : clubMinutesOf(row.ends_at)
    // Ends exactly at next midnight → 24:00, not 00:00.
    if (!continuesAfter && endMin === 0 && clubDateOf(row.ends_at) !== window.date) endMin = DAY_MINUTES
    if (endMin <= startMin) continue // outside the day after clipping

    const { label, match } = blockLabel(type, row)
    const block: ScheduleBlock = {
      id: row.id,
      courtId: row.court_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      startMin,
      endMin,
      continuesBefore,
      continuesAfter,
      occupancyType: type,
      label,
      customerId: row.customer?.id ?? null,
      match,
      status: row.reservation?.status ?? null,
      price: row.reservation?.price ?? null,
      isPaid: row.reservation?.is_paid ?? null,
      isRecurring: row.reservation?.is_recurring ?? false,
      lane: 0,
      laneCount: 1,
    }
    byCourt.set(row.court_id, [...(byCourt.get(row.court_id) ?? []), block])
    totals[type]++
    totals.all++
  }

  const scheduleCourts: ScheduleCourt[] = sortCourts(courts).map((court) => ({
    id: court.id,
    name: court.name,
    sportType: court.sport_type,
    blocks: assignLanes(byCourt.get(court.id) ?? []),
  }))

  const allBlocks = scheduleCourts.flatMap((c) => c.blocks)
  const earliest = Math.min(DEFAULT_RANGE.startMin, ...allBlocks.map((b) => b.startMin))
  return {
    date: window.date,
    courts: scheduleCourts,
    totals,
    rangeStartMin: Math.floor(earliest / 60) * 60,
    rangeEndMin: DEFAULT_RANGE.endMin,
    isEmpty: totals.all === 0,
  }
}

export const STATUS_LABELS: Record<string, { label: string; tone: 'live' | 'warn' | 'neutral' }> = {
  confirmed: { label: 'מאושר', tone: 'live' },
  pendingPayment: { label: 'ממתין לתשלום', tone: 'warn' },
  active: { label: 'פעיל', tone: 'neutral' },
}

export const OCCUPANCY_LABELS: Record<OccupancyType, string> = {
  customer_booking: 'הזמנת לקוח',
  internal_booking: 'פנימי',
  blocked: 'חסום',
  unknown: 'לא מסווג',
}

// ─── Per-court helpers (mobile timeline / status strip) ───────────────────

export type FreeWindow = { startMin: number; endMin: number }

/** Free gaps (≥ minMinutes) between all occupancies of a court inside the visible range. */
export function freeWindows(
  blocks: Pick<ScheduleBlock, 'startMin' | 'endMin'>[],
  rangeStartMin: number,
  rangeEndMin: number,
  minMinutes = 30
): FreeWindow[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)
  const windows: FreeWindow[] = []
  let cursor = rangeStartMin
  for (const b of sorted) {
    if (b.startMin > cursor) windows.push({ startMin: cursor, endMin: Math.min(b.startMin, rangeEndMin) })
    cursor = Math.max(cursor, b.endMin)
    if (cursor >= rangeEndMin) break
  }
  if (cursor < rangeEndMin) windows.push({ startMin: cursor, endMin: rangeEndMin })
  return windows.filter((w) => w.endMin - w.startMin >= minMinutes)
}

export type CourtStatus = {
  /** Customer + internal bookings (blocked slots are not bookings). */
  bookings: number
  blocked: number
  nextBooking: ScheduleBlock | null
  nextFree: FreeWindow | null
}

/**
 * Compact status for one court from already-loaded data. `nowMin` is the
 * current club-clock minute when the day is today, otherwise null (then
 * "next" means the first of the day).
 */
export function courtStatus(
  court: Pick<ScheduleCourt, 'blocks'>,
  rangeStartMin: number,
  rangeEndMin: number,
  nowMin: number | null,
  minFreeMinutes = 30
): CourtStatus {
  const from = nowMin ?? rangeStartMin
  const isBooking = (b: ScheduleBlock) => b.occupancyType === 'customer_booking' || b.occupancyType === 'internal_booking'
  const nextBooking =
    [...court.blocks].filter(isBooking).sort((a, b) => a.startMin - b.startMin).find((b) => b.startMin >= from) ?? null
  const nextFree =
    freeWindows(court.blocks, rangeStartMin, rangeEndMin, 1)
      .map((w) => ({ startMin: Math.max(w.startMin, from), endMin: w.endMin }))
      .find((w) => w.endMin - w.startMin >= minFreeMinutes) ?? null
  return {
    bookings: court.blocks.filter(isBooking).length,
    blocked: court.blocks.filter((b) => b.occupancyType === 'blocked').length,
    nextBooking,
    nextFree,
  }
}

export type AgendaTiming = 'past' | 'current' | 'upcoming' | null

export type AgendaItem =
  | { kind: 'booking'; block: ScheduleBlock; timing: AgendaTiming }
  | { kind: 'free'; startMin: number; endMin: number; timing: AgendaTiming }

/**
 * One court's day as a time-ordered list of occupancies and the free gaps
 * (≥ minFreeMinutes) between them — the mobile card view. With `nowMin`
 * (today) every item is marked past / current / upcoming; otherwise null.
 */
export function courtAgenda(
  court: Pick<ScheduleCourt, 'blocks'>,
  rangeStartMin: number,
  rangeEndMin: number,
  nowMin: number | null,
  minFreeMinutes = 30
): AgendaItem[] {
  const timing = (startMin: number, endMin: number): AgendaTiming =>
    nowMin === null ? null : endMin <= nowMin ? 'past' : startMin <= nowMin ? 'current' : 'upcoming'
  const items: AgendaItem[] = [
    ...court.blocks.map((block): AgendaItem => ({ kind: 'booking', block, timing: timing(block.startMin, block.endMin) })),
    ...freeWindows(court.blocks, rangeStartMin, rangeEndMin, minFreeMinutes).map(
      (w): AgendaItem => ({ kind: 'free', ...w, timing: timing(w.startMin, w.endMin) })
    ),
  ]
  const startOf = (i: AgendaItem) => (i.kind === 'booking' ? i.block.startMin : i.startMin)
  const endOf = (i: AgendaItem) => (i.kind === 'booking' ? i.block.endMin : i.endMin)
  return items.sort((a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b))
}
