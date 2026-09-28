import { describe, expect, it } from 'vitest'
import type { LazuzReservation } from '@/lib/integrations/lazuz/reservations'
import { matchCustomer, type MatchContext } from '@/lib/integrations/lazuz/sync/plan'
import type { ExistingReservation } from '@/lib/integrations/lazuz/sync/types'

const reservation = (over: Partial<LazuzReservation> = {}): LazuzReservation => ({
  externalId: '1', clubExternalId: '213', courtExternalId: '1294', clientExternalId: '55',
  customerName: 'A', customerPhone: '050-111-1111', customerEmail: null, title: null,
  startDate: '2026-09-29', startTime: '19:00:00', endDate: '2026-09-29', endTime: '20:30:00',
  bookingType: 'ext', occupancyType: 'customer_booking', status: 'confirmed', canceled: null, canceledReason: null,
  price: 300, isPaid: null, userSubscriptionId: null, isRecurring: null, recurrenceDayOfWeek: null,
  parentExternalId: null, classId: null, eventDescription: null, chargingTypeId: 1, createdAt: null, raw: {},
  ...over,
})

const ctx = (identities: [string, string][] = [], phones: [string, string[]][] = []): MatchContext => ({
  identities: new Map(identities),
  customersByPhone: new Map(phones),
})

const existing = (over: Partial<ExistingReservation>) => ({ customer_id: null, match_status: 'unmatched', matched_at: null, ...over }) as ExistingReservation

describe('matchCustomer', () => {
  it('uses a known LAZUZ client_id first, even when the phone points elsewhere', () => {
    const m = matchCustomer(reservation(), undefined, ctx([['55', 'C-known']], [['+972501111111', ['C-phone']]]))
    expect(m).toMatchObject({ customerId: 'C-known', status: 'matched_client_id', newIdentity: null })
  })

  it('links an unambiguous phone match and remembers the client_id', () => {
    const m = matchCustomer(reservation(), undefined, ctx([], [['+972501111111', ['C1']]]))
    expect(m).toMatchObject({ customerId: 'C1', status: 'matched_phone', phoneE164: '+972501111111' })
    expect(m.newIdentity).toEqual({ provider: 'lazuz', external_id: '55', customer_id: 'C1', matched_by: 'phone' })
  })

  it('marks a phone shared by several customers as ambiguous', () => {
    const m = matchCustomer(reservation(), undefined, ctx([], [['+972501111111', ['C1', 'C2']]]))
    expect(m).toMatchObject({ customerId: null, status: 'ambiguous', newIdentity: null })
  })

  it('marks no match as unmatched and never creates a customer', () => {
    expect(matchCustomer(reservation(), undefined, ctx())).toMatchObject({ customerId: null, status: 'unmatched' })
  })

  it('never overrides an Owner manual link', () => {
    const m = matchCustomer(reservation(), existing({ customer_id: 'C-manual', match_status: 'manual' }), ctx([['55', 'C-other']]))
    expect(m).toMatchObject({ customerId: 'C-manual', status: 'manual' })
  })

  it('keeps the recorded status when the link is unchanged (idempotent re-sync)', () => {
    const m = matchCustomer(reservation(), existing({ customer_id: 'C1', match_status: 'matched_phone' }), ctx([['55', 'C1']]))
    expect(m.status).toBe('matched_phone')
  })

  it('does not match internal or blocked reservations', () => {
    const m = matchCustomer(reservation({ occupancyType: 'blocked', clientExternalId: null }), undefined, ctx([], [['+972501111111', ['C1']]]))
    expect(m).toMatchObject({ customerId: null, status: 'not_applicable' })
  })
})
