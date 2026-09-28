import { describe, expect, it } from 'vitest'
import { IntegrationError } from '@/lib/integrations/core/errors'
import { parseCourts } from '@/lib/integrations/lazuz/courts'
import { parseReservations, summarizeReservations } from '@/lib/integrations/lazuz/reservations'
import { baseReservation as base } from '../helpers/fake-lazuz'

const W = ['2026-09-28', '2026-10-05'] as const

const body = {
  results: [
    { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'Test Person', phone: '0500000000', email: 't@example.com', title: 'Test Person', status: 'confirmed', price: 300 },
    { ...base, id: 2, court_id: 1294, booking_type: 'int', title: 'Coach lesson', price: 200, payed: 0, is_recurring: '0' },
    { ...base, id: 3, court_id: 1294, booking_type: 'na', payed: 1, is_recurring: '1', day_of_week: '1', start_date: '2026-04-06', end_date: '2027-12-27', parentResId: 99 },
    { ...base, id: 4, court_id: 1294, booking_type: 'ext', client_id: 56, name: 'Other', phone: '0501111111', status: 'confirmed', price: 300, canceled: 1, canceled_reason: 'pay timeout' },
    { ...base, id: 5, court_id: 1294, booking_type: 'na', is_recurring: '1', day_of_week: '2', start_date: '2026-04-07', end_date: '2027-12-28', canceled: '1' },
    { ...base, id: 6, court_id: 1294, booking_type: 'xyz' },
    { ...base, id: 7, court_id: 1294, booking_type: 'ext', start_time: '7pm' },
    { ...base, id: null, court_id: 1294, booking_type: 'ext' },
    'garbage',
  ],
}

describe('parseReservations', () => {
  const parsed = parseReservations(body)
  const byId = Object.fromEntries(parsed.reservations.map((r) => [r.externalId, r]))

  it('keeps every valid record (including cancelled) and counts skips by reason', () => {
    expect(parsed.reservations).toHaveLength(6)
    expect(parsed.skipped).toBe(3)
    expect(parsed.skippedReasons).toEqual({ 'invalid:start_time': 1, 'missing:id': 1, not_an_object: 1 })
  })

  it('maps booking types to occupancy types and never drops unknown ones', () => {
    expect(byId['1'].occupancyType).toBe('customer_booking')
    expect(byId['2'].occupancyType).toBe('internal_booking')
    expect(byId['3'].occupancyType).toBe('blocked')
    expect(byId['6'].occupancyType).toBe('unknown')
  })

  it('reads customer fields, recurrence and the split-series parent link', () => {
    expect(byId['1']).toMatchObject({ clientExternalId: '55', customerPhone: '0500000000', status: 'confirmed', isPaid: null })
    expect(byId['2']).toMatchObject({ clientExternalId: null, isPaid: false, isRecurring: false })
    expect(byId['3']).toMatchObject({ isRecurring: true, recurrenceDayOfWeek: 1, parentExternalId: '99', courtExternalId: '1294' })
  })

  it('treats canceled 1 / "1" as cancelled and keeps the reason and raw record', () => {
    expect(byId['4']).toMatchObject({ canceled: true, canceledReason: 'pay timeout' })
    expect(byId['4'].raw.id).toBe(4)
    expect(byId['5'].canceled).toBe(true)
    expect(byId['1'].canceled).toBeNull()
  })

  it('keeps wall-clock values exactly as sent and converts created_date to ISO', () => {
    expect(byId['1']).toMatchObject({ startDate: '2026-09-29', startTime: '19:00:00', createdAt: '2026-09-20T10:00:00.000Z' })
  })

  it('rejects a response without a `results` array', () => {
    expect(() => parseReservations({ data: [] })).toThrowError(IntegrationError)
  })
})

describe('summarizeReservations', () => {
  const summary = summarizeReservations(parseReservations(body), ...W)

  it('reports cancelled records separately and excludes them from occupancy', () => {
    expect(summary).toMatchObject({ total: 6, cancelled: 2, active: 4 })
    expect(summary.byBookingType.ext).toMatchObject({ count: 2, cancelled: 1, occurrencesInWindow: 1 })
    expect(summary.byBookingType.na).toMatchObject({ count: 2, cancelled: 1, recurringSeries: 2, occurrencesInWindow: 2 })
    expect(summary.byCourt['1294'].cancelled).toBe(2)
  })

  it('contains no personal data', () => {
    expect(JSON.stringify(summary)).not.toMatch(/Test Person|Other|050|example\.com|Coach lesson|pay timeout/)
  })
})

describe('parseCourts', () => {
  it('keeps top-level courts with confirmed fields only', () => {
    const courts = parseCourts({
      results: [
        { id: 1294, title: 'מגרש 1', type_title: 'פאדל', parentId: null, secret: 'x' },
        { id: 9999, title: 'Sub', type_title: 'פאדל', parentId: 1294 },
      ],
    })
    expect(courts).toEqual([
      { externalId: '1294', name: 'מגרש 1', sportType: 'פאדל', raw: { id: 1294, title: 'מגרש 1', type_title: 'פאדל', parentId: null } },
    ])
  })
})
