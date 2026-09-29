import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourtSchedule } from '@/components/courts/court-schedule'
import { dayWindow } from '@/lib/courts/day'
import { buildDaySchedule, type CourtRow, type OccupancyRow } from '@/lib/courts/schedule'

const W = dayWindow('2026-09-29')
const courts: CourtRow[] = [
  { id: 'c1', name: 'מגרש 1', external_id: '1294', sport_type: 'פאדל' },
  { id: 'c2', name: 'מגרש 2', external_id: '1295', sport_type: 'פאדל' },
]
const row = (over: Partial<OccupancyRow>): OccupancyRow => ({
  id: 'o1',
  court_id: 'c1',
  starts_at: '2026-09-29T16:00:00.000Z',
  ends_at: '2026-09-29T17:30:00.000Z',
  occupancy_type: 'customer_booking',
  reservation: { status: 'pendingPayment', price: 300, is_paid: null, title: null, match_status: 'unmatched', customer_name_snapshot: 'Snapshot Name', is_recurring: false },
  customer: null,
  ...over,
})
const render = (rows: OccupancyRow[]) =>
  renderToStaticMarkup(<CourtSchedule schedule={buildDaySchedule(W, courts, rows)} nowIso="2026-09-29T09:00:00Z" isToday={false} />)

describe('CourtSchedule rendering', () => {
  it('renders an empty day with every court free', () => {
    const html = render([])
    expect(html).toContain('מגרש 1')
    expect(html).toContain('מגרש 2')
    expect(html).toContain('פנוי כל היום')
    expect(html).not.toContain('לא מזוהה')
  })

  it('renders an unmatched booking with its snapshot name, status, LTR time and price', () => {
    const html = render([row({})])
    expect(html).toContain('Snapshot Name')
    expect(html).toContain('לא מזוהה')
    expect(html).toContain('ממתין לתשלום')
    expect(html).toMatch(/<bdi dir="ltr" class="num">19:00–20:30<\/bdi>/)
    expect(html).toMatch(/300 ₪/)
  })

  it('links a matched booking to the CRM customer', () => {
    const html = render([row({ customer: { id: 'cust-1', full_name: 'לקוח מקושר' }, reservation: { status: 'confirmed', price: 300, is_paid: null, title: null, match_status: 'matched_phone', customer_name_snapshot: 'x', is_recurring: false } })])
    expect(html).toContain('href="/customers/cust-1"')
    expect(html).toContain('לקוח מקושר')
    expect(html).not.toContain('לא מזוהה')
  })

  it('never renders raw LAZUZ fields', () => {
    const html = render([row({})])
    expect(html).not.toMatch(/"raw"|client_id|customer_phone|booking_type/)
  })
})
