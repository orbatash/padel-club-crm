import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getLazuzConfig } from '@/lib/integrations/lazuz/config'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import type { SyncStore } from '@/lib/integrations/lazuz/sync/types'
import { count, createTestDb, one, rows } from '../helpers/db'
import { baseReservation as base, createTestClient, installFakeLazuz, syncFetchers, type FakeLazuz } from '../helpers/fake-lazuz'
import { createPgliteSyncStore } from '../helpers/pglite-store'

// Auto-creating CRM customers from LAZUZ customer bookings (strict rules).
// Runs against the real customers + LAZUZ migrations (incl. the draft
// 20260930120000_lazuz_auto_created_customers).

const W = { start: '2026-09-28', end: '2026-10-05' }

const FEED = [
  // zero match, valid phone → auto-create (two bookings, one client → one customer)
  { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 11, name: '  New   Person ', phone: '050-444-4444', email: ' New@Example.COM ', status: 'confirmed', price: 300 },
  { ...base, id: 2, court_id: 1295, booking_type: 'ext', client_id: 11, name: 'New Person', phone: '0504444444', status: 'confirmed', price: 300 },
  // exactly one active customer with the phone → link, no create
  { ...base, id: 3, court_id: 1294, booking_type: 'ext', client_id: 22, name: 'Solo', phone: '0501111111', status: 'confirmed', price: 300, start_time: '21:00:00', end_time: '22:30:00' },
  // two customers share the phone → ambiguous, no create
  { ...base, id: 4, court_id: 1295, booking_type: 'ext', client_id: 33, name: 'Sib', phone: '0502222222', status: 'confirmed', price: 300, start_time: '21:00:00', end_time: '22:30:00' },
  // missing / invalid phone → unmatched, no create (email alone never creates)
  { ...base, id: 5, court_id: 1294, booking_type: 'ext', client_id: 44, name: 'No Phone', phone: null, email: 'nophone@example.com', status: 'confirmed', price: 300, start_date: '2026-09-30', end_date: '2026-09-30' },
  { ...base, id: 6, court_id: 1295, booking_type: 'ext', client_id: 55, name: 'Bad Phone', phone: '12', status: 'confirmed', price: 300, start_date: '2026-09-30', end_date: '2026-09-30' },
  // known client_id beats a zero-match phone → link, no create
  { ...base, id: 7, court_id: 1294, booking_type: 'ext', client_id: 88, name: 'Known', phone: '0505555555', status: 'confirmed', price: 300, start_date: '2026-10-01', end_date: '2026-10-01' },
  // only an ARCHIVED customer has this phone → auto-create a new active customer; no name → full_name NULL
  { ...base, id: 8, court_id: 1295, booking_type: 'ext', client_id: 66, name: null, title: null, phone: '0503333333', status: 'confirmed', price: 300, start_date: '2026-10-01', end_date: '2026-10-01' },
  // two different LAZUZ clients share a zero-match phone in this batch → ambiguous, no create
  { ...base, id: 9, court_id: 1294, booking_type: 'ext', client_id: 77, name: 'Parent', phone: '0506666666', status: 'confirmed', price: 300, start_date: '2026-10-02', end_date: '2026-10-02' },
  { ...base, id: 10, court_id: 1295, booking_type: 'ext', client_id: 78, name: 'Child', phone: '0506666666', status: 'confirmed', price: 300, start_date: '2026-10-02', end_date: '2026-10-02' },
  // cancelled-only booking with a zero-match phone → never creates
  { ...base, id: 11, court_id: 1294, booking_type: 'ext', client_id: 99, name: 'Cancelled', phone: '0507777777', status: 'confirmed', price: 300, canceled: 1, start_date: '2026-10-03', end_date: '2026-10-03' },
  // internal booking → not a customer booking
  { ...base, id: 12, court_id: 1295, booking_type: 'int', title: 'Coach', price: 200, is_recurring: '0', start_date: '2026-10-03', end_date: '2026-10-03' },
]

type CustomerRow = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  source: string | null
  status: string
  created_by: string | null
  updated_by: string | null
  marketing_opt_in: boolean
  whatsapp_opt_in: boolean
  archived_at: string | null
}

async function seed(db: PGlite) {
  const insert = async (sql: string, params: unknown[] = []) => (await one<{ id: string }>(db, sql, params)).id
  const solo = await insert(`insert into customers (full_name, phone) values ('Solo', '+972501111111') returning id`)
  await db.query(`insert into customers (full_name, phone) values ('Sibling A', '+972502222222'), ('Sibling B', '+972502222222')`)
  const archived = await insert(`insert into customers (full_name, phone, archived_at) values ('Archived', '+972503333333', now()) returning id`)
  const known = await insert(`insert into customers (full_name, phone) values ('Known', '+972508888888') returning id`)
  await db.query(`insert into customer_external_identities (customer_id, external_id, matched_by) values ($1, '88', 'manual')`, [known])
  return { solo, archived, known }
}

const snapshotCustomers = (db: PGlite) =>
  rows<CustomerRow>(db, `select id, full_name, phone, email, source, status, created_by, updated_by, marketing_opt_in, whatsapp_opt_in, archived_at::text from customers order by id`)

function makeSync(db: PGlite, store: SyncStore = createPgliteSyncStore(db)) {
  const { client } = createTestClient()
  return (opts: { dryRun?: boolean; autoCreateCustomers?: boolean } = {}) =>
    runReservationsSync(W, { dryRun: opts.dryRun ?? false, autoCreateCustomers: opts.autoCreateCustomers ?? true }, {
      store,
      clubId: '213',
      ...syncFetchers(client),
    })
}

const reservation = (db: PGlite, externalId: string) =>
  one<{ match_status: string; customer_id: string | null }>(db, `select match_status, customer_id from court_reservations where external_id = $1`, [externalId])

describe('LAZUZ auto-created customers', () => {
  let db: PGlite
  let lazuz: FakeLazuz
  let ids: Awaited<ReturnType<typeof seed>>
  let existingBefore: CustomerRow[]
  let sync: ReturnType<typeof makeSync>
  let created: CustomerRow
  let createdNoName: CustomerRow

  beforeAll(async () => {
    db = await createTestDb()
    ids = await seed(db)
    existingBefore = await snapshotCustomers(db)
    lazuz = installFakeLazuz({ feed: FEED.map((r) => ({ ...r })) })
    sync = makeSync(db)
  })

  it('dry run reports would_auto_create and writes nothing', async () => {
    const report = await sync({ dryRun: true })
    expect(report.customers).toMatchObject({ autoCreated: 0, wouldAutoCreate: 2, sharedPhoneSkipped: 1 })
    expect(report.matching.would_auto_create).toBe(3) // bookings 1, 2, 8
    expect(report.matching.auto_created).toBe(0)
    expect(await count(db, `select count(*)::int n from customers`)).toBe(5)
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(0)
    expect(await count(db, `select count(*)::int n from customer_external_identities`)).toBe(1)
  })

  it('real sync creates each zero-match customer exactly once', async () => {
    const report = await sync()
    expect(report).toMatchObject({ ok: true, status: 'success' })
    expect(report.customers).toMatchObject({ autoCreated: 2, wouldAutoCreate: 0, autoCreateEnabled: true })
    expect(report.matching).toMatchObject({ auto_created: 3, matched_phone: 1, matched_client_id: 1, ambiguous: 3, unmatched: 3, would_auto_create: 0 })
    const newOnes = await rows<CustomerRow>(db, `select id, full_name, phone, email, source, status, created_by, updated_by, marketing_opt_in, whatsapp_opt_in, archived_at::text
      from customers where source = 'lazuz' order by phone`)
    expect(newOnes.map((c) => c.phone)).toEqual(['+972503333333', '+972504444444'])
    ;[createdNoName, created] = newOnes
  })

  it('creates the customer with safe defaults only', () => {
    expect(created).toMatchObject({
      full_name: 'New Person', // trimmed, single-spaced
      phone: '+972504444444',
      email: 'new@example.com', // lowercased and trimmed
      source: 'lazuz',
      status: 'active',
      created_by: null,
      updated_by: null,
      marketing_opt_in: false,
      whatsapp_opt_in: false,
      archived_at: null,
    })
  })

  it('uses NULL (never an empty string) when LAZUZ has no name', () => {
    expect(createdNoName).toMatchObject({ full_name: null, phone: '+972503333333', status: 'active', archived_at: null })
  })

  it('does not restore or touch the archived customer that shares the phone', async () => {
    expect(await one(db, `select archived_at is not null as archived, full_name from customers where id = $1`, [ids.archived])).toEqual({
      archived: true,
      full_name: 'Archived',
    })
  })

  it('links the bookings to the new customer and records the identity', async () => {
    expect(await reservation(db, '1')).toEqual({ match_status: 'auto_created', customer_id: created.id })
    expect(await reservation(db, '2')).toEqual({ match_status: 'auto_created', customer_id: created.id })
    expect(await reservation(db, '8')).toEqual({ match_status: 'auto_created', customer_id: createdNoName.id })
    expect(await rows(db, `select external_id, customer_id, matched_by from customer_external_identities where matched_by = 'auto_created' order by external_id`)).toEqual([
      { external_id: '11', customer_id: created.id, matched_by: 'auto_created' },
      { external_id: '66', customer_id: createdNoName.id, matched_by: 'auto_created' },
    ])
  })

  it('links a single phone match without creating anyone', async () => {
    expect(await reservation(db, '3')).toEqual({ match_status: 'matched_phone', customer_id: ids.solo })
    expect(await one(db, `select matched_by from customer_external_identities where external_id = '22'`)).toEqual({ matched_by: 'phone' })
  })

  it('prefers a known client_id over the phone', async () => {
    expect(await reservation(db, '7')).toEqual({ match_status: 'matched_client_id', customer_id: ids.known })
    expect(await count(db, `select count(*)::int n from customers where phone = '+972505555555'`)).toBe(0)
  })

  it('leaves shared phones ambiguous and creates nobody', async () => {
    expect(await reservation(db, '4')).toEqual({ match_status: 'ambiguous', customer_id: null })
    expect(await reservation(db, '9')).toEqual({ match_status: 'ambiguous', customer_id: null })
    expect(await reservation(db, '10')).toEqual({ match_status: 'ambiguous', customer_id: null })
    expect(await count(db, `select count(*)::int n from customers where phone in ('+972502222222', '+972506666666')`)).toBe(2) // the two siblings only
  })

  it('never creates from a missing/invalid phone, an email alone, or a cancelled-only booking', async () => {
    expect(await reservation(db, '5')).toEqual({ match_status: 'unmatched', customer_id: null })
    expect(await reservation(db, '6')).toEqual({ match_status: 'unmatched', customer_id: null })
    expect(await reservation(db, '11')).toEqual({ match_status: 'unmatched', customer_id: null })
    expect(await count(db, `select count(*)::int n from customers where email = 'nophone@example.com' or phone = '+972507777777'`)).toBe(0)
  })

  it('leaves existing CRM customers exactly as they were', async () => {
    const after = await snapshotCustomers(db)
    const existingIds = new Set(existingBefore.map((c) => c.id))
    expect(after.filter((c) => existingIds.has(c.id))).toEqual(existingBefore)
  })

  it('second sync creates no duplicate customers and changes nothing', async () => {
    const report = await sync()
    expect(report.customers).toMatchObject({ autoCreated: 0, wouldAutoCreate: 0 })
    expect(report.reservations).toMatchObject({ created: 0, updated: 0 })
    expect(report.matching.auto_created).toBe(3) // still linked as auto_created
    expect(await count(db, `select count(*)::int n from customers`)).toBe(7)
    expect(await count(db, `select count(*)::int n from customers where phone = '+972504444444'`)).toBe(1)
    expect(await count(db, `select count(*)::int n from customer_external_identities`)).toBe(4)
  })

  it('only reads from LAZUZ', () => {
    expect(lazuz.requests.filter((r) => r.method !== 'GET').every((r) => r.path === '/users/login')).toBe(true)
  })
})

describe('auto-create safeguards', () => {
  it('is off unless enabled: reports would_auto_create but creates nobody', async () => {
    const db = await createTestDb()
    await seed(db)
    installFakeLazuz({ feed: FEED.map((r) => ({ ...r })) })
    const report = await makeSync(db)({ autoCreateCustomers: false })
    expect(report.customers).toMatchObject({ autoCreated: 0, wouldAutoCreate: 2, autoCreateEnabled: false })
    expect(await count(db, `select count(*)::int n from customers where source = 'lazuz'`)).toBe(0)
    expect(await reservation(db, '1')).toEqual({ match_status: 'unmatched', customer_id: null })
  })

  it('writes no reservation (no misleading link) if customer creation fails', async () => {
    const db = await createTestDb()
    await seed(db)
    installFakeLazuz({ feed: FEED.map((r) => ({ ...r })) })
    const store = createPgliteSyncStore(db)
    const failing: SyncStore = { ...store, insertCustomers: async () => { throw new Error('insert failed') } }
    const report = await makeSync(db, failing)()
    expect(report).toMatchObject({ ok: false, status: 'failed' })
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(0)
    expect(await count(db, `select count(*)::int n from customers where source = 'lazuz'`)).toBe(0)
  })
})

describe('LAZUZ_AUTO_CREATE_CUSTOMERS setting', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('defaults to off and turns on only for "true"', () => {
    process.env.LAZUZ_USERNAME = '050-000-0000'
    process.env.LAZUZ_PASSWORD = 'fake'
    delete process.env.LAZUZ_AUTO_CREATE_CUSTOMERS
    expect(getLazuzConfig().autoCreateCustomers).toBe(false)
    process.env.LAZUZ_AUTO_CREATE_CUSTOMERS = 'yes'
    expect(getLazuzConfig().autoCreateCustomers).toBe(false)
    process.env.LAZUZ_AUTO_CREATE_CUSTOMERS = 'true'
    expect(getLazuzConfig().autoCreateCustomers).toBe(true)
  })
})
