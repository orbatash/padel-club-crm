import { describe, expect, it } from 'vitest'
import { clubMinutesOf, clubToday, dayWindow, describeDay, nextDay, previousDay, resolveDay } from '@/lib/courts/day'

const hours = (w: { startUtc: string; endUtc: string }) => (Date.parse(w.endUtc) - Date.parse(w.startUtc)) / 3_600_000

describe('club day in Asia/Jerusalem', () => {
  it('uses the club date, not UTC, around midnight', () => {
    expect(clubToday(new Date('2026-09-28T21:30:00Z'))).toBe('2026-09-29') // 00:30 IDT
    expect(clubToday(new Date('2026-09-28T20:30:00Z'))).toBe('2026-09-28') // 23:30 IDT
    expect(clubToday(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-02') // 00:30 IST
  })

  it('builds the local-midnight window for a normal day (24 h)', () => {
    expect(dayWindow('2026-09-29')).toEqual({
      date: '2026-09-29',
      startUtc: '2026-09-28T21:00:00.000Z',
      endUtc: '2026-09-29T21:00:00.000Z',
    })
  })

  it('handles DST days: 25 h in autumn, 23 h in spring', () => {
    expect(hours(dayWindow('2026-10-25'))).toBe(25)
    expect(hours(dayWindow('2026-03-27'))).toBe(23)
    expect(dayWindow('2026-12-01').startUtc).toBe('2026-11-30T22:00:00.000Z')
  })

  it('reads wall-clock minutes in club time', () => {
    expect(clubMinutesOf('2026-09-29T16:00:00Z')).toBe(19 * 60)
    expect(clubMinutesOf('2026-12-01T17:30:00Z')).toBe(19 * 60 + 30)
  })

  it('resolves the ?date param: valid kept, invalid → today', () => {
    const now = new Date('2026-09-28T21:30:00Z')
    expect(resolveDay('2026-10-01', now)).toBe('2026-10-01')
    expect(resolveDay('2026-02-30', now)).toBe('2026-09-29')
    expect(resolveDay('tomorrow', now)).toBe('2026-09-29')
    expect(resolveDay(undefined, now)).toBe('2026-09-29')
    expect(resolveDay(['2026-10-01'], now)).toBe('2026-09-29')
  })

  it('steps days across month and year boundaries', () => {
    expect(nextDay('2026-09-30')).toBe('2026-10-01')
    expect(previousDay('2027-01-01')).toBe('2026-12-31')
  })

  it('describes a day in Hebrew with an LTR short date', () => {
    expect(describeDay('2026-09-29')).toEqual({ weekday: 'יום שלישי', short: '29.09.26' })
  })
})
