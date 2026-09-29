import { describe, expect, it } from 'vitest'
import { courtStatus, freeWindows, type ScheduleBlock } from '@/lib/courts/schedule'

const block = (startMin: number, endMin: number, occupancyType: ScheduleBlock['occupancyType'] = 'customer_booking'): ScheduleBlock => ({
  id: `${startMin}`, courtId: 'c1', startsAt: '', endsAt: '', startMin, endMin, continuesBefore: false, continuesAfter: false,
  occupancyType, label: 'x', customerId: null, match: null, status: null, price: null, isPaid: null, isRecurring: false, lane: 0, laneCount: 1,
})
const H = (h: number, m = 0) => h * 60 + m

describe('freeWindows', () => {
  it('returns the gaps between bookings inside the range', () => {
    const w = freeWindows([block(H(8), H(9, 30)), block(H(16), H(17, 30)), block(H(17, 30), H(19))], H(6), H(24))
    expect(w).toEqual([
      { startMin: H(6), endMin: H(8) },
      { startMin: H(9, 30), endMin: H(16) },
      { startMin: H(19), endMin: H(24) },
    ])
  })

  it('merges overlapping bookings and ignores gaps shorter than the minimum', () => {
    const w = freeWindows([block(H(18), H(19, 30)), block(H(18, 30), H(20)), block(H(20, 15), H(22))], H(18), H(22))
    expect(w).toEqual([]) // only a 15-minute gap at 20:00
  })

  it('treats an empty court as free all day', () => {
    expect(freeWindows([], H(6), H(24))).toEqual([{ startMin: H(6), endMin: H(24) }])
  })
})

describe('courtStatus', () => {
  const court = { blocks: [block(H(6), H(7), 'blocked'), block(H(8), H(9, 30), 'internal_booking'), block(H(16), H(17, 30)), block(H(19), H(20, 30))] }

  it('counts bookings (customer + internal) separately from blocked slots', () => {
    const st = courtStatus(court, H(6), H(24), null)
    expect([st.bookings, st.blocked]).toEqual([3, 1])
  })

  it('on another day: first booking and first free window of the day', () => {
    const st = courtStatus(court, H(6), H(24), null)
    expect(st.nextBooking?.startMin).toBe(H(8))
    expect(st.nextFree).toEqual({ startMin: H(7), endMin: H(8) })
  })

  it('today: next booking and the free window from now', () => {
    const st = courtStatus(court, H(6), H(24), H(12))
    expect(st.nextBooking?.startMin).toBe(H(16))
    expect(st.nextFree).toEqual({ startMin: H(12), endMin: H(16) }) // free right now until 16:00
  })

  it('today, mid-booking: the free window after it', () => {
    const st = courtStatus(court, H(6), H(24), H(16, 30))
    expect(st.nextFree).toEqual({ startMin: H(17, 30), endMin: H(19) })
    expect(st.nextBooking?.startMin).toBe(H(19))
  })

  it('reports none when nothing is left', () => {
    const full = { blocks: [block(H(6), H(24))] }
    const st = courtStatus(full, H(6), H(24), H(10))
    expect([st.nextBooking, st.nextFree]).toEqual([null, null])
  })
})
