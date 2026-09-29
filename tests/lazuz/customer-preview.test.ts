import type { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import { buildCustomerPreview, emailDomain, maskPhone } from '@/lib/integrations/lazuz/sync/preview'
import { count, createTestDb } from '../helpers/db'
import { baseReservation as base, captureLogs, createTestClient, installFakeLazuz, syncFetchers } from '../helpers/fake-lazuz'
import { createPgliteSyncStore } from '../helpers/pglite-store'

// Dry-run preview of auto-created customers: masked, dry-run only, never logged.

describe('masking', () => {
  it('masks phones to country code + last 4 with a fixed-width mask', () => {
    expect(maskPhone('+972501234567')).toBe('+972*****4567')
    expect(maskPhone('+97231234567')).toBe('+972*****4567') // shorter number, same mask width
    expect(maskPhone('+14155550123')).toBe('+*****0123')
    expect(maskPhone('0501234567')).toBe('***')
    expect(maskPhone('+97212')).toBe('***')
    expect(maskPhone('')).toBe('***')
  })

  it('reduces an email to its domain only', () => {
    expect(emailDomain('dana.levi@gmail.com')).toBe('gmail.com')
    expect(emailDomain('A@Sub.Example.CO.IL')).toBe('sub.example.co.il')
    expect(emailDomain(null)).toBeNull()
    expect(emailDomain('no-at-sign')).toBeNull()
    expect(emailDomain('x@localhost')).toBeNull()
  })
})

describe('buildCustomerPreview', () => {
  const creations = Array.from({ length: 30 }, (_, i) => ({
    phone: `+9725000000${String(i).padStart(2, '0')}`,
    full_name: i % 3 === 0 ? null : `Person ${i}`,
    email: i % 2 === 0 ? `person${i}@example.com` : null,
    clientExternalId: i % 5 === 0 ? null : String(1000 + i),
  }))
  const byPhone = new Map(creations.map((c, i) => [c.phone, i % 4 === 0 ? 3 : 1]))
  const preview = buildCustomerPreview(creations, byPhone)

  it('caps the sample at 25, busiest first, with counts over all candidates', () => {
    expect(preview).toMatchObject({ total: 30, shown: 25 })
    expect(preview.items).toHaveLength(25)
    expect(preview.items.slice(0, 8).every((p) => p.reservations === 3)).toBe(true)
    expect(preview.counts).toEqual({
      candidatesWithName: 20,
      candidatesWithoutName: 10,
      candidatesWithEmail: 15,
      candidatesWithoutEmail: 15,
      candidatesWithClientId: 24,
      candidatesWithoutClientId: 6,
      candidatesWithMultipleReservations: 8,
    })
  })

  it('items carry only the allowed fields', () => {
    for (const item of preview.items) {
      expect(Object.keys(item).sort()).toEqual(['emailDomain', 'full_name', 'hasClientId', 'phoneMasked', 'reservations'])
    }
  })

  it('contains no full phone, email local part or client_id', () => {
    const json = JSON.stringify(preview)
    for (const c of creations) {
      expect(json).not.toContain(c.phone)
      expect(json).not.toContain(c.phone.slice(1))
      if (c.email) expect(json).not.toContain(c.email.split('@')[0] + '@')
      if (c.clientExternalId) expect(json).not.toMatch(new RegExp(`\\b${c.clientExternalId}\\b`))
    }
  })
})

describe('dry-run preview in the sync report', () => {
  const FEED = [
    { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 4711, name: 'Dana Levi', phone: '050-444-4444', email: 'dana.secret@gmail.com', status: 'confirmed', price: 300 },
    { ...base, id: 2, court_id: 1295, booking_type: 'ext', client_id: 4711, name: 'Dana Levi', phone: '0504444444', status: 'confirmed', price: 300 },
    { ...base, id: 3, court_id: 1294, booking_type: 'ext', client_id: null, name: null, title: null, phone: '0503339876', status: 'confirmed', price: 300, start_date: '2026-10-01', end_date: '2026-10-01' },
  ]
  const PII = ['+972504444444', '972504444444', '0504444444', '050-444-4444', '+972503339876', '0503339876', 'dana.secret', '4711']

  let db: PGlite
  afterEach(() => vi.restoreAllMocks())

  const sync = async (dryRun: boolean, autoCreateCustomers: boolean) => {
    db = await createTestDb()
    installFakeLazuz({ feed: FEED.map((r) => ({ ...r })) })
    const { client } = createTestClient()
    return runReservationsSync({ start: '2026-09-28', end: '2026-10-05' }, { dryRun, autoCreateCustomers }, {
      store: createPgliteSyncStore(db),
      clubId: '213',
      ...syncFetchers(client),
    })
  }

  it('returns a masked preview on dry run and writes nothing', async () => {
    const logs = captureLogs()
    const report = await sync(true, false)
    expect(report.customers.preview).toEqual({
      total: 2,
      shown: 2,
      items: [
        { full_name: 'Dana Levi', phoneMasked: '+972*****4444', emailDomain: 'gmail.com', hasClientId: true, reservations: 2 },
        { full_name: null, phoneMasked: '+972*****9876', emailDomain: null, hasClientId: false, reservations: 1 },
      ],
      counts: {
        candidatesWithName: 1,
        candidatesWithoutName: 1,
        candidatesWithEmail: 1,
        candidatesWithoutEmail: 1,
        candidatesWithClientId: 1,
        candidatesWithoutClientId: 1,
        candidatesWithMultipleReservations: 1,
      },
    })
    const reservationsInPreview = report.customers.preview!.items.reduce((n, p) => n + p.reservations, 0)
    expect(reservationsInPreview).toBe(report.matching.would_auto_create)

    const previewJson = JSON.stringify(report.customers.preview)
    for (const value of PII) expect(previewJson).not.toContain(value)
    expect(previewJson).not.toMatch(/"raw"|booking_type|client_id/)

    // never logged
    const logText = logs.join('\n')
    expect(logText).not.toContain('preview')
    expect(logText).not.toContain('Dana')
    expect(logText).not.toContain('*****')

    expect(await count(db, `select count(*)::int n from customers`)).toBe(0)
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(0)
  })

  it('is dry-run only: a real sync returns no preview', async () => {
    captureLogs()
    const report = await sync(false, true)
    expect(report.customers.autoCreated).toBe(2)
    expect(report.customers.preview).toBeUndefined()
  })
})
