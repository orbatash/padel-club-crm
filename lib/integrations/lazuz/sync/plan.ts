import { normalizePhone } from '@/lib/customers/phone'
import type { Json } from '@/lib/database.types'
import type { LazuzCourt } from '../courts'
import type { LazuzReservation } from '../reservations'
import { expandOccurrences } from '../time'
import type {
  CourtRow,
  CourtUpsert,
  ExistingReservation,
  IdentityInsert,
  MatchStatus,
  OccupancyRow,
  OccupancyUpsert,
  ReservationUpsert,
  SyncWindow,
} from './types'

// Pure planning for the LAZUZ sync: given what LAZUZ returned and what the
// database holds, decide exactly what to write. No I/O here — which keeps the
// rules testable and lets dry-run use the same code path.

// ─── helpers ──────────────────────────────────────────────────────────────

/** Stable JSON for comparisons (sorted object keys). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b))

/** Postgres `time` comes back as HH:MM:SS; LAZUZ may send HH:MM. */
const normTime = (t: string) => (t.length === 5 ? `${t}:00` : t)

const MATCHED: MatchStatus[] = ['matched_client_id', 'matched_phone', 'manual']

// ─── courts ───────────────────────────────────────────────────────────────

export function planCourts(fetched: LazuzCourt[], existing: CourtRow[], clubId: string, now: string) {
  const byExternal = new Map(existing.map((c) => [c.external_id, c]))
  const upserts: CourtUpsert[] = []
  let created = 0
  let updated = 0
  for (const court of fetched) {
    const current = byExternal.get(court.externalId)
    if (!current) created++
    else if (current.name !== court.name || current.sport_type !== court.sportType) updated++
    // indoor_outdoor / is_active are never sent, so local values are preserved.
    upserts.push({
      provider: 'lazuz',
      external_id: court.externalId,
      club_external_id: clubId,
      name: court.name,
      sport_type: court.sportType,
      raw: court.raw as Json,
      synced_at: now,
    })
  }
  return { upserts, created, updated, unchanged: fetched.length - created - updated }
}

// ─── customer matching ────────────────────────────────────────────────────

export type MatchContext = {
  /** LAZUZ client_id → CRM customer id */
  identities: Map<string, string>
  /** E.164 phone → ids of non-archived customers with that phone */
  customersByPhone: Map<string, string[]>
}

export type MatchResult = {
  customerId: string | null
  status: MatchStatus
  phoneE164: string | null
  /** Identity to create after an unambiguous phone match. */
  newIdentity: IdentityInsert | null
}

/**
 * Conservative matching (customer bookings only):
 *   1. an Owner's manual link is never overridden
 *   2. known LAZUZ client_id → its customer
 *   3. exactly one non-archived customer with the same E.164 phone → link
 *      (and remember the client_id for next time)
 *   4. several → ambiguous · none → unmatched
 * Never creates, edits or merges customers.
 */
export function matchCustomer(
  r: LazuzReservation,
  existing: ExistingReservation | undefined,
  ctx: MatchContext
): MatchResult {
  const phone = r.customerPhone ? normalizePhone(r.customerPhone) : null
  const phoneE164 = phone?.ok ? phone.e164 : null

  if (r.occupancyType !== 'customer_booking') {
    return { customerId: null, status: 'not_applicable', phoneE164, newIdentity: null }
  }

  if (existing?.match_status === 'manual' && existing.customer_id) {
    return { customerId: existing.customer_id, status: 'manual', phoneE164, newIdentity: null }
  }

  // Keep the recorded way a link was made if it still points at the same customer
  // (keeps re-syncs idempotent: a phone match stays "matched_phone").
  const keep = (customerId: string, fallback: MatchStatus): MatchStatus =>
    existing && existing.customer_id === customerId && MATCHED.includes(existing.match_status)
      ? existing.match_status
      : fallback

  if (r.clientExternalId) {
    const known = ctx.identities.get(r.clientExternalId)
    if (known) return { customerId: known, status: keep(known, 'matched_client_id'), phoneE164, newIdentity: null }
  }

  if (phoneE164) {
    const candidates = ctx.customersByPhone.get(phoneE164) ?? []
    if (candidates.length === 1) {
      const customerId = candidates[0]
      return {
        customerId,
        status: keep(customerId, 'matched_phone'),
        phoneE164,
        newIdentity: r.clientExternalId
          ? { provider: 'lazuz', external_id: r.clientExternalId, customer_id: customerId, matched_by: 'phone' }
          : null,
      }
    }
    if (candidates.length > 1) return { customerId: null, status: 'ambiguous', phoneE164, newIdentity: null }
  }

  return { customerId: null, status: 'unmatched', phoneE164, newIdentity: null }
}

// ─── reservations ─────────────────────────────────────────────────────────

export type ReservationPlanInput = {
  window: SyncWindow
  reservations: LazuzReservation[]
  /** Records the parser could not read — their ids are unknown. */
  parserSkipped: number
  courtIdByExternal: Map<string, string>
  existingByExternalId: Map<string, ExistingReservation>
  presentOverlapping: { id: string; external_id: string }[]
  match: MatchContext
  now: string
}

export type MatchCounts = Record<MatchStatus, number>

export function planReservations(input: ReservationPlanInput) {
  const rows: ReservationUpsert[] = []
  const identityByClient = new Map<string, IdentityInsert>()
  const matchCounts: MatchCounts = {
    matched_client_id: 0,
    matched_phone: 0,
    manual: 0,
    ambiguous: 0,
    unmatched: 0,
    not_applicable: 0,
  }
  let created = 0
  let updated = 0
  let unknownCourt = 0
  let cancelled = 0

  for (const r of input.reservations) {
    const courtId = input.courtIdByExternal.get(r.courtExternalId)
    if (!courtId) {
      unknownCourt++
      continue
    }
    const existing = input.existingByExternalId.get(r.externalId)
    const m = matchCustomer(r, existing, input.match)
    matchCounts[m.status]++
    if (m.newIdentity && !input.match.identities.has(m.newIdentity.external_id)) {
      identityByClient.set(m.newIdentity.external_id, m.newIdentity)
    }
    if (r.canceled === true) cancelled++

    const linkUnchanged =
      existing && existing.customer_id === m.customerId && MATCHED.includes(existing.match_status)
    const row: ReservationUpsert = {
      provider: 'lazuz',
      external_id: r.externalId,
      club_external_id: r.clubExternalId,
      court_id: courtId,
      booking_type: r.bookingType,
      occupancy_type: r.occupancyType,
      status: r.status,
      canceled: r.canceled === true,
      canceled_reason: r.canceledReason,
      price: r.price,
      is_paid: r.isPaid,
      charging_type_id: r.chargingTypeId,
      user_subscription_id: r.userSubscriptionId,
      class_id: r.classId,
      parent_external_id: r.parentExternalId,
      is_recurring: r.isRecurring === true,
      recurrence_day_of_week: r.recurrenceDayOfWeek,
      start_date: r.startDate,
      start_time: normTime(r.startTime),
      end_date: r.endDate,
      end_time: normTime(r.endTime),
      title: r.title,
      event_description: r.eventDescription,
      client_external_id: r.clientExternalId,
      customer_name_snapshot: r.customerName,
      customer_phone_e164: m.phoneE164,
      customer_email_snapshot: r.customerEmail?.toLowerCase() ?? null,
      customer_id: m.customerId,
      match_status: m.status,
      matched_at: MATCHED.includes(m.status) ? (linkUnchanged ? existing.matched_at : input.now) : null,
      raw: r.raw as Json, // parsed from a JSON response, so valid JSON
      external_created_at: r.createdAt,
      last_seen_at: input.now,
      sync_state: 'present',
    }
    rows.push(row)

    if (!existing) created++
    else if (reservationChanged(existing, row)) updated++
  }

  // Missing detection — only rows that overlap THIS window, were present, and
  // were not returned. Disabled if any record could not be read or mapped,
  // because then "not returned" can't be told apart from "not understood".
  const returned = new Set(input.reservations.map((r) => r.externalId))
  const missingDisabledReason =
    input.parserSkipped > 0 ? 'parser_skipped_records' : unknownCourt > 0 ? 'unknown_court' : null
  const missingIds = missingDisabledReason
    ? []
    : input.presentOverlapping.filter((row) => !returned.has(row.external_id)).map((row) => row.id)

  return {
    rows,
    identities: [...identityByClient.values()],
    missingIds,
    missingDisabledReason,
    counts: {
      fetched: input.reservations.length + input.parserSkipped,
      created,
      updated,
      unchanged: rows.length - created - updated,
      skipped: input.parserSkipped + unknownCourt,
      unknownCourt,
      cancelled,
      missing: missingIds.length,
    },
    matchCounts,
  }
}

const COMPARED: (keyof ReservationUpsert)[] = [
  'club_external_id', 'court_id', 'booking_type', 'occupancy_type', 'status', 'canceled', 'canceled_reason',
  'price', 'is_paid', 'charging_type_id', 'user_subscription_id', 'class_id', 'parent_external_id',
  'is_recurring', 'recurrence_day_of_week', 'start_date', 'start_time', 'end_date', 'end_time', 'title',
  'event_description', 'client_external_id', 'customer_name_snapshot', 'customer_phone_e164',
  'customer_email_snapshot', 'customer_id', 'match_status',
]

export function reservationChanged(existing: ExistingReservation, row: ReservationUpsert): boolean {
  if (existing.sync_state !== 'present') return true
  for (const key of COMPARED) {
    const a = (existing as unknown as Record<string, unknown>)[key]
    const b = row[key]
    if (key === 'price') {
      if ((a === null ? null : Number(a)) !== b) return true
    } else if (a !== b) return true
  }
  if (!sameInstant(existing.external_created_at, row.external_created_at)) return true
  if (!sameInstant(existing.matched_at, row.matched_at)) return true
  return canonical(existing.raw) !== canonical(row.raw)
}

// ─── occupancies ──────────────────────────────────────────────────────────

export type OccupancyPlanInput = {
  window: SyncWindow
  rows: ReservationUpsert[]
  /** external_id → reservation uuid (after upsert; in dry-run, only existing rows) */
  reservationIdByExternal: Map<string, string>
  existing: OccupancyRow[]
}

/**
 * Derived occupancies for the window: every ACTIVE returned reservation
 * (not cancelled) expanded into concrete intervals, keeping only those whose
 * club-local start date is inside the window. Existing occupancies in the
 * window that are no longer produced are stale and removed.
 */
export function planOccupancies(input: OccupancyPlanInput) {
  const desired: OccupancyUpsert[] = []
  for (const row of input.rows) {
    if (row.canceled) continue
    const occurrences = expandOccurrences(
      {
        startDate: row.start_date,
        startTime: row.start_time,
        endDate: row.end_date,
        endTime: row.end_time,
        isRecurring: row.is_recurring,
        recurrenceDayOfWeek: row.recurrence_day_of_week,
        canceled: row.canceled,
      },
      input.window.start,
      input.window.end
    )
    const reservationId = input.reservationIdByExternal.get(row.external_id) ?? `new:${row.external_id}`
    for (const o of occurrences) {
      if (o.localDate < input.window.start || o.localDate > input.window.end) continue
      desired.push({
        reservation_id: reservationId,
        court_id: row.court_id,
        starts_at: o.startsAt,
        ends_at: o.endsAt,
        local_date: o.localDate,
        occupancy_type: row.occupancy_type,
        customer_id: row.customer_id,
      })
    }
  }

  const key = (reservationId: string, startsAt: string) => `${reservationId}|${Date.parse(startsAt)}`
  const existingByKey = new Map(input.existing.map((o) => [key(o.reservation_id, o.starts_at), o]))
  const desiredKeys = new Set(desired.map((o) => key(o.reservation_id, o.starts_at)))

  let created = 0
  let changed = 0
  for (const o of desired) {
    const current = existingByKey.get(key(o.reservation_id, o.starts_at))
    if (!current) created++
    else if (!sameInstant(current.ends_at, o.ends_at)) changed++
  }
  const staleIds = input.existing.filter((o) => !desiredKeys.has(key(o.reservation_id, o.starts_at))).map((o) => o.id)

  return {
    upserts: desired.filter((o) => !o.reservation_id.startsWith('new:')),
    counts: { desired: desired.length, created, changed, deleted: staleIds.length },
    staleIds,
  }
}
