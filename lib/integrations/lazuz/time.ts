// LAZUZ sends wall-clock dates and times with no time zone
// (start_date "YYYY-MM-DD", start_time "HH:MM:SS"). They are club-local times
// in Asia/Jerusalem. Conversion to real instants happens only here, at the
// domain/database boundary — never by passing them to `new Date(...)`, which
// would treat them as UTC or as the server's local zone.
//
// Pure functions, no I/O.

export const CLUB_TIME_ZONE = 'Asia/Jerusalem'

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

export function isWallDate(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value)
}

export function isWallTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value)
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of the club time zone from UTC at a given instant, in ms. */
function zoneOffsetMs(utcMs: number) {
  const p = Object.fromEntries(offsetFormatter.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * Club wall-clock date + time → UTC ISO string.
 * DST: a time skipped by the spring-forward gap resolves to the instant after
 * the gap; a time repeated in the autumn overlap resolves to its first
 * (daylight-time) occurrence.
 */
export function clubWallTimeToUtc(date: string, time: string): string {
  const d = DATE.exec(date)
  const t = TIME.exec(time)
  if (!d || !t) throw new Error('Invalid wall-clock date/time')
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +(t[3] ?? 0))

  // Try the offset before and after the candidate instant; prefer the earlier
  // valid instant (first occurrence in an overlap).
  const candidates = [wall - zoneOffsetMs(wall - 12 * 3600_000), wall - zoneOffsetMs(wall + 12 * 3600_000)]
  const valid = candidates.filter((utc) => utc + zoneOffsetMs(utc) === wall).sort((a, b) => a - b)
  // Gap (time doesn't exist): apply the pre-transition offset, which lands
  // the same distance after the gap, i.e. shifts forward.
  const utc = valid[0] ?? wall - zoneOffsetMs(wall - 12 * 3600_000)
  return new Date(utc).toISOString()
}

/** Adds days to a wall-clock date string (calendar arithmetic, no time zone). */
export function addDays(date: string, days: number): string {
  const d = DATE.exec(date)
  if (!d) throw new Error('Invalid wall-clock date')
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3] + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, as LAZUZ's day_of_week. */
export function weekday(date: string): number {
  const d = DATE.exec(date)
  if (!d) throw new Error('Invalid wall-clock date')
  return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).getUTCDay()
}

function timeToSeconds(time: string) {
  const t = TIME.exec(time)!
  return +t[1] * 3600 + +t[2] * 60 + +(t[3] ?? 0)
}

export type Occurrence = {
  /** Club-local date the occurrence starts on. */
  localDate: string
  startsAt: string // UTC ISO
  endsAt: string // UTC ISO
}

export type OccurrenceSource = {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  isRecurring: boolean | null
  recurrenceDayOfWeek: number | null
}

/**
 * Expands a LAZUZ reservation into concrete occurrences within
 * [windowStart, windowEnd] (inclusive club-local dates).
 *
 * - Single reservation: one occurrence from start date+time to end date+time
 *   (overnight bookings end on the next date).
 * - Recurring series (is_recurring "1" + day_of_week): start_date..end_date is
 *   the series range and start_time..end_time the weekly slot; one occurrence
 *   per matching weekday. PROVISIONAL: how LAZUZ represents skipped or edited
 *   single occurrences of a series is not confirmed yet.
 */
export function expandOccurrences(r: OccurrenceSource, windowStart: string, windowEnd: string): Occurrence[] {
  const recurring = r.isRecurring === true && r.recurrenceDayOfWeek !== null

  if (!recurring) {
    if (r.startDate < windowStart && r.endDate < windowStart) return []
    if (r.startDate > windowEnd) return []
    return [
      {
        localDate: r.startDate,
        startsAt: clubWallTimeToUtc(r.startDate, r.startTime),
        endsAt: clubWallTimeToUtc(r.endDate, r.endTime),
      },
    ]
  }

  const from = r.startDate > windowStart ? r.startDate : windowStart
  const to = r.endDate < windowEnd ? r.endDate : windowEnd
  const overnight = timeToSeconds(r.endTime) <= timeToSeconds(r.startTime)
  const occurrences: Occurrence[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (weekday(date) !== r.recurrenceDayOfWeek) continue
    occurrences.push({
      localDate: date,
      startsAt: clubWallTimeToUtc(date, r.startTime),
      endsAt: clubWallTimeToUtc(overnight ? addDays(date, 1) : date, r.endTime),
    })
  }
  return occurrences
}
