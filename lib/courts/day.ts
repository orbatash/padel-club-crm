import { addDays, clubWallTimeToUtc, CLUB_TIME_ZONE, isWallDate, weekday } from '@/lib/integrations/lazuz/time'

// Club-day arithmetic for the court schedule. A "day" is a club-local
// (Asia/Jerusalem) calendar date; its instant window is local midnight to the
// next local midnight, so DST days are 23 or 25 hours long. Pure, client-safe.

export type DayWindow = {
  date: string
  /** UTC ISO instant of local 00:00 on `date` (inclusive). */
  startUtc: string
  /** UTC ISO instant of local 00:00 on the next day (exclusive). */
  endUtc: string
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLUB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLUB_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Today's date in the club's time zone (never the server's). */
export function clubToday(now: Date = new Date()): string {
  return dateFormatter.format(now)
}

/** The club-local date an instant falls on. */
export function clubDateOf(instant: string | Date): string {
  return dateFormatter.format(new Date(instant))
}

/** Minutes since local midnight (wall clock) of an instant, e.g. 19:30 → 1170. */
export function clubMinutesOf(instant: string | Date): number {
  const [h, m] = timeFormatter.format(new Date(instant)).split(':').map(Number)
  return h * 60 + m
}

export function dayWindow(date: string): DayWindow {
  return {
    date,
    startUtc: clubWallTimeToUtc(date, '00:00:00'),
    endUtc: clubWallTimeToUtc(addDays(date, 1), '00:00:00'),
  }
}

/** A valid YYYY-MM-DD from the URL, or today (club time). */
export function resolveDay(param: unknown, now: Date = new Date()): string {
  if (typeof param === 'string' && isWallDate(param)) {
    const d = new Date(`${param}T12:00:00Z`)
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === param) return param
  }
  return clubToday(now)
}

export const previousDay = (date: string) => addDays(date, -1)
export const nextDay = (date: string) => addDays(date, 1)

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/** { weekday: 'יום שלישי', short: '29.09.26' } */
export function describeDay(date: string) {
  const [y, m, d] = date.split('-')
  return { weekday: `יום ${WEEKDAYS[weekday(date)]}`, short: `${d}.${m}.${y.slice(2)}` }
}

/** "19:30" from minutes since midnight; 1440 → "24:00". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
