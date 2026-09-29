import { describe, expect, it } from 'vitest'
import { dayWindow } from '@/lib/courts/day'
import { buildDaySchedule, sortCourts, type CourtRow, type OccupancyRow } from '@/lib/courts/schedule'

const DAY = '2026-09-29' // IDT, UTC+3
const W = dayWindow(DAY)
const courts: CourtRow[] = [
  { id: 'c10', name: 'מגרש 10', external_id: '1303', sport_type: 'פאדל' },
  { id: 'c2', name: 'מגרש 2', external_id: '1295', sport_type: 'פאדל' },
  { id: 'c1', name: 'מגרש 1', external_id: '1294', sport_type: 'פאדל' },
]
const at = (hhmm: string, date = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h - 3, m)).toISOString()
}
let seq = 0
const occ = (over: Partial<OccupancyRow> & { court_id?: string; from?: string; to?: string }): OccupancyRow => {
  const { from = '19:00', to = '20:30', ...rest } = over
  return {
    id: `o${++seq}`,
    court_id: 'c1',
    starts_at: at(from),
    ends_at: at(to),
    occupancy_type: 'customer_booking',
    reservation: { status: 'confirmed', price: 300, is_paid: null, title: null, match_status: 'unmatched', customer_name_snapshot: 'Snapshot Name', is_recurring: false },
    customer: null,
    ...rest,
  }
}
const blocks = (rows: OccupancyRow[], court = 'c1') => buildDaySchedule(W, courts, rows).courts.find((c) => c.id === court)!.blocks

describe('court ordering', () => {
  it('orders courts naturally by name (2 before 10)', () => {
    expect(sortCourts(courts).map((c) => c.name)).toEqual(['מגרש 1', 'מגרש 2', 'מגרש 10'])
    expect(buildDaySchedule(W, courts, []).courts.map((c) => c.id)).toEqual(['c1', 'c2', 'c10'])
  })
})

describe('occupancy mapping and labels', () => {
  it('shows the linked CRM customer name and links to the customer', () => {
    const [b] = blocks([occ({ customer: { id: 'cust-1', full_name: 'לקוח מקושר' }, reservation: { status: 'confirmed', price: 300, is_paid: null, title: null, match_status: 'matched_phone', customer_name_snapshot: 'Snapshot Name', is_recurring: false } })])
    expect(b).toMatchObject({ label: 'לקוח מקושר', customerId: 'cust-1', match: 'linked', occupancyType: 'customer_booking' })
  })

  it('falls back to the LAZUZ snapshot name for an unmatched customer', () => {
    const [b] = blocks([occ({})])
    expect(b).toMatchObject({ label: 'Snapshot Name', customerId: null, match: 'unmatched' })
  })

  it('falls back to a generic label when there is no snapshot either', () => {
    const [b] = blocks([occ({ reservation: { status: null, price: null, is_paid: null, title: null, match_status: 'unmatched', customer_name_snapshot: '  ', is_recurring: false } })])
    expect(b.label).toBe('לקוח לא מזוהה')
  })

  it('marks an ambiguous phone match', () => {
    const [b] = blocks([occ({ reservation: { status: 'confirmed', price: 300, is_paid: null, title: null, match_status: 'ambiguous', customer_name_snapshot: 'Sib', is_recurring: false } })])
    expect(b.match).toBe('ambiguous')
  })

  it('maps internal / blocked / unknown with titles or Hebrew fallbacks', () => {
    const rows = [
      occ({ from: '08:00', to: '09:00', occupancy_type: 'internal_booking', reservation: { status: null, price: 200, is_paid: false, title: 'Coach', match_status: 'not_applicable', customer_name_snapshot: null, is_recurring: false } }),
      occ({ from: '09:00', to: '10:00', occupancy_type: 'internal_booking', reservation: null }),
      occ({ from: '10:00', to: '11:00', occupancy_type: 'blocked', reservation: { status: null, price: 0, is_paid: null, title: null, match_status: 'not_applicable', customer_name_snapshot: null, is_recurring: true } }),
      occ({ from: '11:00', to: '12:00', occupancy_type: 'something_new', reservation: null }),
    ]
    const bs = blocks(rows)
    expect(bs.map((b) => [b.occupancyType, b.label, b.match])).toEqual([
      ['internal_booking', 'Coach', null],
      ['internal_booking', 'הזמנה פנימית', null],
      ['blocked', 'חסום', null],
      ['unknown', 'לא ידוע', null],
    ])
    expect(bs[2].isRecurring).toBe(true)
  })

  it('counts totals by occupancy type', () => {
    const s = buildDaySchedule(W, courts, [occ({}), occ({ occupancy_type: 'blocked', from: '06:00', to: '07:00' })])
    expect(s.totals).toEqual({ customer_booking: 1, internal_booking: 0, blocked: 1, unknown: 0, all: 2 })
  })
})

describe('overlapping bookings', () => {
  it('places overlapping blocks side by side and keeps the rest full-width', () => {
    const bs = blocks([occ({ from: '19:00', to: '20:30' }), occ({ from: '20:00', to: '21:00' }), occ({ from: '21:00', to: '22:00' })])
    expect(bs.map((b) => [b.startMin, b.lane, b.laneCount])).toEqual([
      [1140, 0, 2],
      [1200, 1, 2],
      [1260, 0, 1],
    ])
  })

  it('reuses a lane once it is free inside the same cluster', () => {
    const bs = blocks([occ({ from: '18:00', to: '21:00' }), occ({ from: '18:30', to: '19:00' }), occ({ from: '19:30', to: '20:00' })])
    expect(bs.map((b) => [b.lane, b.laneCount])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
    ])
  })
})

describe('day boundaries and range', () => {
  it('clips a booking that crosses midnight at both ends', () => {
    const fromYesterday = occ({ from: '23:00', to: '00:30' })
    fromYesterday.starts_at = at('23:00', '2026-09-28')
    fromYesterday.ends_at = at('00:30', DAY)
    const intoTomorrow = occ({ from: '23:30', to: '00:30' })
    intoTomorrow.ends_at = at('00:30', '2026-09-30')
    const [a, b] = blocks([fromYesterday, intoTomorrow])
    expect(a).toMatchObject({ startMin: 0, endMin: 30, continuesBefore: true, continuesAfter: false })
    expect(b).toMatchObject({ startMin: 1410, endMin: 1440, continuesBefore: false, continuesAfter: true })
  })

  it('treats an end at exactly next midnight as 24:00', () => {
    const r = occ({ from: '22:30', to: '00:00' })
    r.ends_at = at('00:00', '2026-09-30')
    expect(blocks([r])[0]).toMatchObject({ startMin: 1350, endMin: 1440, continuesAfter: false })
  })

  it('extends the visible range to fit early bookings (whole hours)', () => {
    expect(buildDaySchedule(W, courts, [occ({ from: '05:30', to: '06:30' })]).rangeStartMin).toBe(5 * 60)
    expect(buildDaySchedule(W, courts, [occ({})]).rangeStartMin).toBe(6 * 60)
  })
})

describe('empty day', () => {
  it('still lists every court, with no blocks and zero totals', () => {
    const s = buildDaySchedule(W, courts, [])
    expect(s.isEmpty).toBe(true)
    expect(s.courts).toHaveLength(3)
    expect(s.courts.every((c) => c.blocks.length === 0)).toBe(true)
    expect(s.totals.all).toBe(0)
    expect([s.rangeStartMin, s.rangeEndMin]).toEqual([360, 1440])
  })
})
