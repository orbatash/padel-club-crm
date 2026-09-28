import { describe, expect, it } from 'vitest'
import { clubWallTimeToUtc, expandOccurrences, weekday } from '@/lib/integrations/lazuz/time'

describe('clubWallTimeToUtc (Asia/Jerusalem)', () => {
  it.each([
    ['summer IDT', '2026-09-28', '18:00:00', '2026-09-28T15:00:00.000Z'],
    ['winter IST', '2026-12-01', '18:00:00', '2026-12-01T16:00:00.000Z'],
    ['DST end overlap → first occurrence', '2026-10-25', '01:30:00', '2026-10-24T22:30:00.000Z'],
    ['after DST end', '2026-10-25', '09:00:00', '2026-10-25T07:00:00.000Z'],
    ['DST start gap → shifted forward', '2026-03-27', '02:30:00', '2026-03-27T00:30:00.000Z'],
    ['never UTC or server zone', '2026-07-01', '00:00:00', '2026-06-30T21:00:00.000Z'],
  ])('%s', (_label, date, time, expected) => {
    expect(clubWallTimeToUtc(date, time)).toBe(expected)
  })

  it('uses LAZUZ weekday numbering (0 = Sunday)', () => {
    expect(weekday('2026-09-28')).toBe(1)
  })
})

describe('expandOccurrences', () => {
  const W = ['2026-09-28', '2026-10-05'] as const
  const single = { startDate: '2026-09-29', startTime: '19:00:00', endDate: '2026-09-29', endTime: '20:30:00', isRecurring: null, recurrenceDayOfWeek: null, canceled: null }
  const series = { startDate: '2026-04-06', startTime: '17:00:00', endDate: '2027-12-27', endTime: '18:00:00', isRecurring: true, recurrenceDayOfWeek: 1, canceled: null }

  it('expands a single booking to one interval', () => {
    expect(expandOccurrences(single, ...W)).toEqual([
      { localDate: '2026-09-29', startsAt: '2026-09-29T16:00:00.000Z', endsAt: '2026-09-29T17:30:00.000Z' },
    ])
  })

  it('ends an overnight booking on the next day', () => {
    const [o] = expandOccurrences({ ...single, startTime: '23:00:00', endDate: '2026-09-30', endTime: '00:30:00' }, ...W)
    expect(o.endsAt).toBe('2026-09-29T21:30:00.000Z')
  })

  it('expands a recurring series by day_of_week within the window', () => {
    expect(expandOccurrences(series, ...W).map((o) => o.localDate)).toEqual(['2026-09-28', '2026-10-05'])
  })

  it('keeps the local time across the DST change', () => {
    expect(expandOccurrences(series, '2026-10-19', '2026-10-26').map((o) => o.startsAt)).toEqual([
      '2026-10-19T14:00:00.000Z',
      '2026-10-26T15:00:00.000Z',
    ])
  })

  it('produces nothing outside the window', () => {
    expect(expandOccurrences({ ...series, endDate: '2026-09-01' }, ...W)).toEqual([])
    expect(expandOccurrences({ ...single, startDate: '2026-11-01', endDate: '2026-11-01' }, ...W)).toEqual([])
  })

  it('produces no occupancy for cancelled bookings or series', () => {
    expect(expandOccurrences({ ...single, canceled: true }, ...W)).toEqual([])
    expect(expandOccurrences({ ...series, canceled: true }, ...W)).toEqual([])
    expect(expandOccurrences({ ...single, canceled: false }, ...W)).toHaveLength(1)
  })

  it('treats a removed middle occurrence as a gap between split series (no double count)', () => {
    const original = { ...series, endDate: '2026-09-27' } // Monday 28.09 removed
    const continuation = { ...series, startDate: '2026-10-05' } // parentResId → original
    const dates = [...expandOccurrences(original, ...W), ...expandOccurrences(continuation, ...W)].map((o) => o.localDate)
    expect(dates).toEqual(['2026-10-05'])
  })
})
