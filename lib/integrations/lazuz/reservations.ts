import 'server-only'

import { IntegrationError } from '@/lib/integrations/core/errors'
import { logEvent } from '@/lib/integrations/core/log'
import { getLazuzClient, type LazuzClient } from './client'
import { getLazuzConfig } from './config'
import { expandOccurrences, isWallDate, isWallTime } from './time'

// GET /reservations?club_id&start&end — read-only.
//
// Parser based on the confirmed LAZUZ response (envelope `results`). Records
// describe court OCCUPANCY, not only customer bookings: internal bookings and
// blocked slots have no customer and must never be dropped.
//
// Observed semantics (club 213, 2026-09-28…10-05):
// - booking_type "ext": client_id, name and phone always present; status
//   "confirmed" | "pendingPayment" → customer_booking
// - booking_type "int": no client fields; title and price present → internal_booking
// - booking_type "na":  no client fields, price 0, often recurring → blocked
//   (provisional: treated as occupancy until LAZUZ confirms the meaning)
// - is_recurring "1" + day_of_week: start_date..end_date is the SERIES range
//   and start_time..end_time the weekly slot; occurrences are the dates in
//   that range matching day_of_week (see time.ts expandOccurrences)
// - parentResId: continuation link. When a recurring series is split (an
//   occurrence removed or edited), the continuation series points to the
//   original reservation id. A removed middle occurrence is a gap between the
//   split series; an edited occurrence is a separate one-off booking.
// - canceled = 1: cancelled. Cancelled records are kept as source records but
//   produce no court occupancy.
// - dates/times are club wall-clock (Asia/Jerusalem); created_date is ISO UTC
// - courts (GET /club-management/courts/213?hierarchical=true): 1294…1301 are
//   top-level padel courts titled "מגרש 1"…"מגרש 8"

export type OccupancyType = 'customer_booking' | 'internal_booking' | 'blocked' | 'unknown'

const OCCUPANCY_BY_BOOKING_TYPE: Record<string, OccupancyType> = {
  ext: 'customer_booking',
  int: 'internal_booking',
  na: 'blocked',
}

export type LazuzReservation = {
  externalId: string
  clubExternalId: string | null
  courtExternalId: string
  /** LAZUZ customer id — present on customer bookings ("ext"). */
  clientExternalId: string | null
  customerName: string | null
  /** As sent by LAZUZ; normalize with lib/customers/phone before matching. */
  customerPhone: string | null
  customerEmail: string | null
  /** Free-text label set in LAZUZ; may contain a person's name — treat as personal data. */
  title: string | null
  /** Club wall-clock values exactly as sent (no time zone). */
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  bookingType: string
  occupancyType: OccupancyType
  status: string | null
  /** true when canceled = 1. Cancelled records are kept but produce no occupancy. null = not set. */
  canceled: boolean | null
  canceledReason: string | null
  price: number | null
  /** From `payed` (1/0), else `is_paid_reservation`; null when neither is set. */
  isPaid: boolean | null
  userSubscriptionId: string | null
  isRecurring: boolean | null
  /** 0 = Sunday … 6 = Saturday; set on recurring series. */
  recurrenceDayOfWeek: number | null
  /**
   * parentResId: this series continues an earlier series that was split. The
   * parent usually ended before the requested range, so it isn't returned.
   */
  parentExternalId: string | null
  classId: string | null
  eventDescription: string | null
  chargingTypeId: number | null
  /** ISO UTC, when LAZUZ provides it. */
  createdAt: string | null
  raw: Record<string, unknown>
}

export type ReservationsResult = {
  reservations: LazuzReservation[]
  skipped: number
  /** Why records were skipped, by field name only. */
  skippedReasons: Record<string, number>
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

const id = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' && v.trim() ? v.trim() : null
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const flag = (v: unknown) =>
  v === true || v === 1 || v === '1' ? true : v === false || v === 0 || v === '0' ? false : null

function parseItem(item: Obj): { ok: true; value: LazuzReservation } | { ok: false; reason: string } {
  const externalId = id(item.id)
  if (!externalId) return { ok: false, reason: 'missing:id' }
  const courtExternalId = id(item.court_id)
  if (!courtExternalId) return { ok: false, reason: 'missing:court_id' }
  const bookingType = text(item.booking_type)
  if (!bookingType) return { ok: false, reason: 'missing:booking_type' }
  for (const key of ['start_date', 'end_date'] as const) {
    if (!isWallDate(item[key])) return { ok: false, reason: `invalid:${key}` }
  }
  for (const key of ['start_time', 'end_time'] as const) {
    if (!isWallTime(item[key])) return { ok: false, reason: `invalid:${key}` }
  }

  const dayOfWeek = num(item.day_of_week)
  const created = text(item.created_date)

  return {
    ok: true,
    value: {
      externalId,
      clubExternalId: id(item.club_id),
      courtExternalId,
      clientExternalId: id(item.client_id),
      customerName: text(item.name),
      customerPhone: text(item.phone),
      customerEmail: text(item.email),
      title: text(item.title),
      startDate: item.start_date as string,
      startTime: item.start_time as string,
      endDate: item.end_date as string,
      endTime: item.end_time as string,
      bookingType,
      occupancyType: OCCUPANCY_BY_BOOKING_TYPE[bookingType] ?? 'unknown',
      status: text(item.status),
      canceled: flag(item.canceled),
      canceledReason: text(item.canceled_reason),
      price: num(item.price),
      isPaid: flag(item.payed) ?? flag(item.is_paid_reservation),
      userSubscriptionId: id(item.userSubscriptionId),
      isRecurring: flag(item.is_recurring),
      recurrenceDayOfWeek: dayOfWeek !== null && dayOfWeek >= 0 && dayOfWeek <= 6 ? dayOfWeek : null,
      parentExternalId: id(item.parentResId),
      classId: id(item.class_id),
      eventDescription: text(item.event_description),
      chargingTypeId: num(item.chargingTypeId),
      createdAt: created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : null,
      raw: item,
    },
  }
}

export function parseReservations(body: unknown): ReservationsResult {
  const list = isObj(body) ? body.results : undefined
  if (!Array.isArray(list)) {
    const top = isObj(body) ? Object.keys(body).join(',') : Array.isArray(body) ? 'array' : typeof body
    throw new IntegrationError('invalid_response', 'LAZUZ reservations response has no `results` array', {
      provider: 'lazuz',
      operation: 'listReservations',
      hint: `top-level: ${top}`,
    })
  }

  const reservations: LazuzReservation[] = []
  const skippedReasons: Record<string, number> = {}
  for (const item of list) {
    const parsed = isObj(item) ? parseItem(item) : ({ ok: false, reason: 'not_an_object' } as const)
    if (parsed.ok) reservations.push(parsed.value)
    else skippedReasons[parsed.reason] = (skippedReasons[parsed.reason] ?? 0) + 1
  }
  const skipped = Object.values(skippedReasons).reduce((a, b) => a + b, 0)
  return { reservations, skipped, skippedReasons }
}

/**
 * Personal-data-free summary for diagnostics: counts by booking type and
 * court (cancelled reported separately), and ACTIVE occurrences inside the
 * window (recurring series expanded, cancelled records excluded).
 */
export function summarizeReservations(result: ReservationsResult, windowStart: string, windowEnd: string) {
  type TypeSummary = {
    count: number
    cancelled: number
    occupancyType: OccupancyType
    withClient: number
    recurringSeries: number
    /** Active (non-cancelled) occurrences inside the window. */
    occurrencesInWindow: number
  }
  const byBookingType: Record<string, TypeSummary> = {}
  const byCourt: Record<string, { records: number; cancelled: number; occurrencesInWindow: number }> = {}
  const statuses: Record<string, number> = {}
  let cancelled = 0

  for (const r of result.reservations) {
    const occurrences = expandOccurrences(r, windowStart, windowEnd).length
    const isCancelled = r.canceled === true
    if (isCancelled) cancelled++

    const t = (byBookingType[r.bookingType] ??= {
      count: 0,
      cancelled: 0,
      occupancyType: r.occupancyType,
      withClient: 0,
      recurringSeries: 0,
      occurrencesInWindow: 0,
    })
    t.count++
    if (isCancelled) t.cancelled++
    if (r.clientExternalId) t.withClient++
    if (r.isRecurring && r.recurrenceDayOfWeek !== null) t.recurringSeries++
    t.occurrencesInWindow += occurrences

    const c = (byCourt[r.courtExternalId] ??= { records: 0, cancelled: 0, occurrencesInWindow: 0 })
    c.records++
    if (isCancelled) c.cancelled++
    c.occurrencesInWindow += occurrences

    const s = `${r.bookingType}:${r.status ?? 'null'}`
    statuses[s] = (statuses[s] ?? 0) + 1
  }

  return {
    total: result.reservations.length,
    /** Cancelled source records (kept, but excluded from occurrences). */
    cancelled,
    active: result.reservations.length - cancelled,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
    byBookingType,
    courts: Object.keys(byCourt).sort(),
    byCourt,
    statusesByBookingType: statuses,
  }
}

/**
 * Reservations overlapping [start, end] for the configured club. Dates are
 * club-local `YYYY-MM-DD`; LAZUZ returns any reservation (including recurring
 * series) that overlaps the range, with the end date inclusive.
 */
export async function listReservations(
  { start, end }: { start: string; end: string },
  deps: { client?: LazuzClient; clubId?: string } = {}
): Promise<ReservationsResult> {
  const clubId = deps.clubId ?? getLazuzConfig().clubId
  if (!clubId) {
    throw new IntegrationError('not_configured', 'LAZUZ_CLUB_ID is not set', {
      provider: 'lazuz',
      operation: 'listReservations',
    })
  }
  if (!isWallDate(start) || !isWallDate(end) || start > end) {
    throw new IntegrationError('bad_request', 'start/end must be YYYY-MM-DD with start ≤ end', {
      provider: 'lazuz',
      operation: 'listReservations',
    })
  }

  const body = await (deps.client ?? getLazuzClient()).request({
    operation: 'listReservations',
    method: 'GET',
    path: '/reservations',
    query: { club_id: clubId, start, end },
  })

  const result = parseReservations(body)
  logEvent('info', 'lazuz.reservations.parsed', {
    count: result.reservations.length,
    skipped: result.skipped,
    skippedReasons: result.skippedReasons,
  })
  return result
}
