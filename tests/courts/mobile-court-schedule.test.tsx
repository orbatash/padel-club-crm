import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CourtSchedule } from '@/components/courts/court-schedule'
import { MobileCourtSchedule } from '@/components/courts/mobile-court-schedule'
import { dayWindow } from '@/lib/courts/day'
import { buildDaySchedule, courtAgenda, type CourtRow, type OccupancyRow } from '@/lib/courts/schedule'

const W = dayWindow('2026-09-29')
const courts: CourtRow[] = Array.from({ length: 8 }, (_, i) => ({ id: `c${i + 1}`, name: `מגרש ${i + 1}`, external_id: String(1294 + i), sport_type: 'פאדל' }))
type Over = Partial<Omit<OccupancyRow, 'reservation'>> & { reservation?: Partial<NonNullable<OccupancyRow['reservation']>> }
const row = (court: string, from: string, to: string, over: Over = {}): OccupancyRow => ({
  id: `${court}-${from}`,
  court_id: court,
  starts_at: `2026-09-29T${String(Number(from.slice(0, 2)) - 3).padStart(2, '0')}:${from.slice(3)}:00.000Z`,
  ends_at: `2026-09-29T${String(Number(to.slice(0, 2)) - 3).padStart(2, '0')}:${to.slice(3)}:00.000Z`,
  occupancy_type: over.occupancy_type ?? 'customer_booking',
  customer: over.customer ?? null,
  reservation: {
    status: 'confirmed',
    price: 320,
    is_paid: null,
    title: null,
    match_status: 'unmatched',
    customer_name_snapshot: `לקוח ${court}`,
    is_recurring: false,
    ...over.reservation,
  },
})
const render = (rows: OccupancyRow[], nowMin: number | null = null) =>
  renderToStaticMarkup(<MobileCourtSchedule schedule={buildDaySchedule(W, courts, rows)} nowMin={nowMin} />)
const ltr = (text: string) => `<bdi dir="ltr" class="num">${text}</bdi>`
/** Visible text only (drops attributes such as the row's title tooltip). */
const visible = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const NOW_LINE = /class="_mNow_\w+"/

describe('MobileCourtSchedule', () => {
  it('shows only the selected court: 8 selector tabs, one timeline', () => {
    const html = render([row('c1', '19:00', '20:30'), row('c2', '17:00', '18:30')])
    expect((html.match(/role="tab"/g) ?? []).length).toBe(8)
    expect((html.match(/role="tabpanel"/g) ?? []).length).toBe(1)
    expect(html).toContain('לקוח c1')
    expect(html).not.toContain('לקוח c2')
  })

  it('represents the selected court clearly: aria-selected, active style, roving focus, heading', () => {
    const html = render([row('c1', '19:00', '20:30')])
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>[^<]*<\/button>/g) ?? []
    const selected = tabs.filter((t) => t.includes('aria-selected="true"'))
    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatch(/mTabActive/)
    expect(selected[0]).toContain('tabindex="0"')
    expect(selected[0]).toContain('>מגרש 1<')
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(7)
    expect(tabs.some((t) => /\d+ הזמנות/.test(t))).toBe(false) // no counts cluttering the selector
    expect(html).toMatch(/aria-labelledby="court-tab-c1"/)
    expect(html).toMatch(/<h2[^>]*>מגרש 1<\/h2>/)
  })

  it('orders a booking as time range → name → tags → price, time dominant and LTR', () => {
    const html = render([
      row('c1', '07:00', '08:30', { reservation: { customer_name_snapshot: 'דניאל כהן', status: 'pendingPayment', price: 180 } }),
    ])
    const text = visible(html.slice(html.indexOf('<ol')))
    const time = text.indexOf('07:00–08:30')
    const name = text.indexOf('דניאל כהן')
    const type = text.indexOf('הזמנת לקוח')
    const status = text.indexOf('ממתין לתשלום')
    const price = text.indexOf('180 ₪')
    expect(time).toBeGreaterThan(-1)
    expect([time, name, type, status, price].every((v, i, a) => v > -1 && (i === 0 || v > a[i - 1]))).toBe(true)
    expect(html).toMatch(new RegExp(`class="[^"]*mTime[^"]*">${ltr('07:00–08:30')}`))
  })

  it('shows meaningful free windows as their own rows, not tiny gaps', () => {
    const html = render([row('c1', '07:00', '08:30'), row('c1', '10:00', '11:30'), row('c1', '11:50', '13:00')])
    expect(html).toContain(ltr('06:00–07:00'))
    expect(html).toContain(ltr('08:30–10:00'))
    expect(html).not.toContain(ltr('11:30–11:50')) // 20 min: noise
    expect(html).toContain(ltr('13:00–24:00'))
    expect((html.match(/mFreeLabel/g) ?? []).length).toBe(3)
  })

  it('renders an empty court as a deliberate "פנוי כל היום" state', () => {
    const html = render([row('c2', '17:00', '18:30')])
    expect(html).toMatch(/<strong>פנוי כל היום<\/strong>/)
    expect(html).toContain(ltr('06:00–24:00'))
    expect(html).not.toContain('<ol')
  })

  it('tags unmatched and ambiguous bookings, and linked ones not at all', () => {
    const html = render([
      row('c1', '07:00', '08:00', { reservation: { match_status: 'unmatched', customer_name_snapshot: 'א' } }),
      row('c1', '09:00', '10:00', { reservation: { match_status: 'ambiguous', customer_name_snapshot: 'ב' } }),
      row('c1', '11:00', '12:00', { reservation: { match_status: 'matched_phone' }, customer: { id: 'cust-1', full_name: 'דנה לוי' } }),
    ])
    expect(html).toContain('לא מזוהה')
    expect(html).toContain('כמה התאמות')
    const linked = html.slice(html.indexOf('href="/customers/cust-1"'))
    const linkedRow = linked.slice(0, linked.indexOf('</a>'))
    expect(linkedRow).toContain('דנה לוי')
    expect(linkedRow).not.toMatch(/לא מזוהה|כמה התאמות/)
  })

  it('distinguishes blocked and internal time without repeating the type', () => {
    const html = render([
      row('c1', '07:00', '08:00', { occupancy_type: 'blocked', reservation: { title: null, price: null } }),
      row('c1', '09:00', '10:00', { occupancy_type: 'internal_booking', reservation: { title: 'אימון נוער', price: null } }),
    ])
    expect(html).toMatch(/mRow_blocked/)
    expect((visible(html).match(/חסום/g) ?? []).length).toBe(1)
    expect(html).toMatch(/mRow_internal_booking/)
    expect(html).toContain('אימון נוער')
    expect(html).toContain('פנימי')
  })

  it('today: marks the current booking and the summary says what is next and when free', () => {
    const html = render([row('c1', '11:00', '12:30'), row('c1', '19:00', '20:30')], 12 * 60)
    expect(html).toMatch(/mCurrent/)
    expect(html).toContain('עכשיו')
    expect(html).toMatch(new RegExp(`הבא ${ltr('19:00')}`))
    expect(html).toMatch(new RegExp(`פנוי ${ltr('12:30–19:00')}`))
    expect(html).not.toContain('ראשון')
  })

  it('today inside a free window: says free now, until when', () => {
    const html = render([row('c1', '19:00', '20:30')], 12 * 60)
    expect(html).toMatch(new RegExp(`פנוי עכשיו עד ${ltr('19:00')}`))
  })

  it('today between items: draws a thin now line before the next item', () => {
    // 08:30–08:50 is a 20-minute gap (not shown), so now = 08:40 is in no item.
    const html = render([row('c1', '07:00', '08:30'), row('c1', '08:50', '10:00')], 8 * 60 + 40)
    expect(html).toMatch(new RegExp(`aria-label="עכשיו 08:40"`))
    const line = html.search(NOW_LINE)
    expect(line).toBeGreaterThan(html.indexOf(ltr('07:00–08:30')))
    expect(line).toBeLessThan(html.indexOf(ltr('08:50–10:00')))
  })

  it('another day: summary uses "first" wording and nothing is dimmed', () => {
    const html = render([row('c1', '16:00', '17:30')])
    expect(html).toMatch(new RegExp(`ראשון ${ltr('16:00')}`))
    expect(html).not.toMatch(/mPast|mCurrent/)
    expect(html).not.toMatch(NOW_LINE)
  })
})

describe('courtAgenda', () => {
  it('interleaves bookings and ≥30 min free windows in time order with timing', () => {
    const court = buildDaySchedule(W, courts, [row('c1', '08:00', '09:00'), row('c1', '12:00', '13:00')]).courts[0]
    const agenda = courtAgenda(court, 6 * 60, 24 * 60, 12 * 60 + 30)
    expect(agenda.map((i) => [i.kind, i.timing])).toEqual([
      ['free', 'past'],
      ['booking', 'past'],
      ['free', 'past'],
      ['booking', 'current'],
      ['free', 'upcoming'],
    ])
    expect(courtAgenda(court, 6 * 60, 24 * 60, null).every((i) => i.timing === null)).toBe(true)
  })
})

describe('desktop board is unchanged', () => {
  it('still renders every court as a column on the time grid, next to the mobile view', () => {
    const schedule = buildDaySchedule(W, courts, [row('c1', '19:00', '20:30'), row('c2', '17:00', '18:30')])
    const html = renderToStaticMarkup(<CourtSchedule schedule={schedule} nowIso="2026-09-29T09:00:00.000Z" isToday={false} />)
    expect(html).toMatch(/role="grid" aria-label="לוח מגרשים"/)
    expect((html.match(/role="columnheader"/g) ?? []).length).toBe(8)
    expect((html.match(/role="gridcell"/g) ?? []).length).toBe(8)
    // Desktop shows both courts' bookings at once, as positioned blocks.
    const board = html.slice(0, html.indexOf('role="tablist"'))
    expect(board).toContain('לקוח c1')
    expect(board).toContain('לקוח c2')
    expect(board).toMatch(/style="top:calc\(/)
    expect(board).not.toMatch(/mRow|mFree/)
  })
})
