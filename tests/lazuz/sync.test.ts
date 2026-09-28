import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import { count, createTestDb, one, rows } from '../helpers/db'
import {
  baseReservation as base,
  captureLogs,
  containsSecrets,
  createTestClient,
  installFakeLazuz,
  syncFetchers,
  type FakeLazuz,
} from '../helpers/fake-lazuz'
import { createPgliteSyncStore } from '../helpers/pglite-store'

// End-to-end sync against a real Postgres (PGlite + committed migration) and
// a fake LAZUZ. Steps run in order and build on each other.

const W = { start: '2026-09-28', end: '2026-10-05' }

describe('LAZUZ reservations sync', () => {
  let db: PGlite
  let lazuz: FakeLazuz
  let logs: string[]
  let C1: string
  let C4: string
  let sync: (window?: { start: string; end: string }, dryRun?: boolean) => ReturnType<typeof runReservationsSync>
  const occupanciesFor = (externalId: string) =>
    count(db, `select count(*)::int n from court_occupancies o join court_reservations r on r.id = o.reservation_id where r.external_id = $1`, [externalId])
  const reservation = <T>(externalId: string, cols: string) =>
    one<T>(db, `select ${cols} from court_reservations where external_id = $1`, [externalId])

  beforeAll(async () => {
    db = await createTestDb()
    C1 = (await one<{ id: string }>(db, `insert into customers (full_name, phone) values ('Solo', '+972501111111') returning id`)).id
    await db.query(`insert into customers (full_name, phone) values ('Sibling A', '+972502222222'), ('Sibling B', '+972502222222')`)
    await db.query(`insert into customers (full_name, phone, archived_at) values ('Archived twin', '+972501111111', now())`)
    C4 = (await one<{ id: string }>(db, `insert into customers (full_name, phone) values ('Known', '+972504444444') returning id`)).id
    await db.query(`insert into customer_external_identities (customer_id, external_id, matched_by) values ($1, '88', 'manual')`, [C4])

    lazuz = installFakeLazuz({
      feed: [
        { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'Solo', phone: '050-111-1111', email: 'Solo@Example.com', status: 'confirmed', price: 300 },
        { ...base, id: 2, court_id: 1294, booking_type: 'ext', client_id: 66, name: 'Sib', phone: '0502222222', status: 'confirmed', price: 300, start_time: '21:00:00', end_time: '22:30:00' },
        { ...base, id: 3, court_id: 1295, booking_type: 'ext', client_id: 77, name: 'Nobody', phone: '0509999999', status: 'pendingPayment', price: 300 },
        { ...base, id: 4, court_id: 1295, booking_type: 'ext', client_id: 88, name: 'Known', phone: '0500000001', status: 'confirmed', price: 300, start_time: '21:00:00', end_time: '22:30:00' },
        { ...base, id: 5, court_id: 1294, booking_type: 'int', title: 'Coach', price: 200, payed: 0, is_recurring: '0', start_date: '2026-10-01', end_date: '2026-10-01' },
        { ...base, id: 6, court_id: 1295, booking_type: 'na', is_recurring: '1', day_of_week: '1', start_date: '2026-04-06', end_date: '2027-12-27', start_time: '06:00:00', end_time: '07:00:00', parentResId: 99 },
        { ...base, id: 7, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'Solo', phone: '0501111111', status: 'confirmed', price: 300, canceled: 1, canceled_reason: 'pay timeout', start_date: '2026-10-02', end_date: '2026-10-02' },
        { ...base, id: 8, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'Solo', phone: '0501111111', status: 'confirmed', price: 300, start_date: '2026-10-12', end_date: '2026-10-12' },
      ],
    })
    logs = captureLogs()
    const { client } = createTestClient()
    const store = createPgliteSyncStore(db)
    sync = (window = W, dryRun = false) =>
      runReservationsSync(window, { dryRun }, { store, clubId: '213', ...syncFetchers(client) })
  })

  it('dry run writes nothing but reports planned counts', async () => {
    const report = await sync(W, true)
    expect(report).toMatchObject({ ok: true, runId: null, courts: { fetched: 2 }, reservations: { created: 7 } })
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(0)
    expect(await count(db, `select count(*)::int n from integration_sync_runs`)).toBe(0)
  })

  it('first sync stores every reservation in the window', async () => {
    const report = await sync()
    expect(report).toMatchObject({ ok: true, status: 'success', reservations: { fetched: 7, created: 7 } })
    expect(report.runRecord.status).toBe('recorded')
    expect(await one(db, `select status, created_count from integration_sync_runs`)).toMatchObject({ status: 'success', created_count: 7 })
  })

  it('matches customers conservatively', async () => {
    const report = await sync(W, true) // counts only
    expect(report.matching).toMatchObject({ matched_client_id: 1, matched_phone: 2, ambiguous: 1, unmatched: 1, not_applicable: 2, manual: 0 })
    expect(await reservation('1', 'match_status, customer_id, customer_phone_e164, customer_email_snapshot')).toEqual({
      match_status: 'matched_phone', customer_id: C1, customer_phone_e164: '+972501111111', customer_email_snapshot: 'solo@example.com',
    })
    expect(await reservation<{ customer_id: string }>('4', 'customer_id')).toEqual({ customer_id: C4 }) // known client_id beats phone
    expect(await reservation('2', 'match_status, customer_id')).toEqual({ match_status: 'ambiguous', customer_id: null })
    expect(await reservation('3', 'match_status')).toEqual({ match_status: 'unmatched' })
  })

  it('creates an identity only for an unambiguous phone match (archived customers ignored)', async () => {
    expect(await rows(db, `select external_id, customer_id, matched_by from customer_external_identities order by external_id`)).toEqual([
      { external_id: '55', customer_id: C1, matched_by: 'phone' },
      { external_id: '88', customer_id: C4, matched_by: 'manual' },
    ])
  })

  it('never writes to CRM customers', async () => {
    expect(await count(db, `select count(*)::int n from customers`)).toBe(5)
  })

  it('stores cancelled reservations without occupancy', async () => {
    expect(await reservation('7', 'canceled')).toEqual({ canceled: true })
    expect(await occupanciesFor('7')).toBe(0)
  })

  it('builds occupancies for active reservations, expanding recurring series', async () => {
    expect(await occupanciesFor('6')).toBe(2) // two Mondays in the window
    expect(await count(db, `select count(*)::int n from court_occupancies`)).toBe(7)
    const { s } = await one<{ s: string }>(db, `select to_char(o.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') s
      from court_occupancies o join court_reservations r on r.id = o.reservation_id where r.external_id = '1'`)
    expect(s).toBe('2026-09-29T16:00') // 19:00 Asia/Jerusalem
  })

  it('is idempotent on re-sync', async () => {
    const before = await rows(db, `select external_id, updated_at from court_reservations order by external_id`)
    const report = await sync()
    expect(report.reservations).toMatchObject({ created: 0, updated: 0, unchanged: 7 })
    expect(report.occupancies).toMatchObject({ created: 0, changed: 0, deleted: 0 })
    expect(report.matching).toMatchObject({ identitiesCreated: 0, matched_phone: 2 })
    expect(await rows(db, `select external_id, updated_at from court_reservations order by external_id`)).toEqual(before)
  })

  it('keeps a reservation cancelled in LAZUZ as a source row and removes its occupancy', async () => {
    lazuz.feed = lazuz.feed.map((r) => (r.id === 1 ? { ...r, canceled: 1, canceled_reason: 'user' } : r))
    const report = await sync()
    expect(report.reservations.updated).toBe(1)
    expect(await reservation('1', 'canceled')).toEqual({ canceled: true })
    expect(await occupanciesFor('1')).toBe(0)
  })

  it('marks missing only within the fetched window and never deletes', async () => {
    const other = await sync({ start: '2026-10-10', end: '2026-10-14' })
    expect(other.reservations.created).toBe(1) // id 8
    lazuz.feed = lazuz.feed.filter((r) => r.id !== 5)
    const report = await sync()
    expect(report.reservations.missing).toBe(1)
    expect(await reservation('5', 'sync_state')).toEqual({ sync_state: 'missing' })
    expect(await occupanciesFor('5')).toBe(0)
    expect(await reservation('8', 'sync_state')).toEqual({ sync_state: 'present' }) // outside W
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(8)
  })

  it('disables missing detection when a record cannot be parsed', async () => {
    lazuz.feed = [...lazuz.feed.filter((r) => r.id !== 3), { ...base, id: 42, court_id: 1294, booking_type: 'ext', start_time: 'bad' }]
    const report = await sync()
    expect(report.status).toBe('partial')
    expect(report.reservations).toMatchObject({ missingDetection: 'disabled', missingDisabledReason: 'parser_skipped_records' })
    expect(await reservation('3', 'sync_state')).toEqual({ sync_state: 'present' })
    lazuz.feed = lazuz.feed.filter((r) => r.id !== 42)
  })

  it('changes nothing when LAZUZ fails, and records a safe error', async () => {
    lazuz.reservationsStatus = 500
    const before = await rows(db, `select external_id, sync_state from court_reservations order by external_id`)
    const occBefore = await count(db, `select count(*)::int n from court_occupancies`)
    const report = await sync()
    expect(report).toMatchObject({ ok: false, status: 'failed' })
    expect(await rows(db, `select external_id, sync_state from court_reservations order by external_id`)).toEqual(before)
    expect(await count(db, `select count(*)::int n from court_occupancies`)).toBe(occBefore)
    const run = await one<{ status: string; error: { kind: string } }>(db, `select status, error from integration_sync_runs order by started_at desc limit 1`)
    expect(run.status).toBe('failed')
    expect(run.error.kind).toBe('transient')
    expect(JSON.stringify(run.error)).not.toMatch(/tok-|Bearer|050|Solo/)
    lazuz.reservationsStatus = 200
  })

  it('preserves an Owner manual link', async () => {
    await db.query(`update court_reservations set match_status = 'manual', customer_id = $1 where external_id = '2'`, [C4])
    const report = await sync()
    expect(report.matching.manual).toBe(1)
    expect(await reservation('2', 'match_status, customer_id')).toEqual({ match_status: 'manual', customer_id: C4 })
    expect(await reservation('3', 'sync_state')).toEqual({ sync_state: 'missing' }) // now a clean sync
  })

  it('restores a record that reappears', async () => {
    lazuz.feed.push({ ...base, id: 5, court_id: 1294, booking_type: 'int', title: 'Coach', price: 200, payed: 0, is_recurring: '0', start_date: '2026-10-01', end_date: '2026-10-01' })
    await sync()
    expect(await reservation('5', 'sync_state')).toEqual({ sync_state: 'present' })
    expect(await occupanciesFor('5')).toBe(1)
  })

  it('finalizes every run', async () => {
    expect(await count(db, `select count(*)::int n from integration_sync_runs where status = 'running'`)).toBe(0)
  })

  it('only reads from LAZUZ (no write operations)', () => {
    const nonGet = lazuz.requests.filter((r) => r.method !== 'GET')
    expect(nonGet.every((r) => r.method === 'POST' && r.path === '/users/login')).toBe(true)
    expect(new Set(lazuz.requests.map((r) => `${r.method} ${r.path}`))).toEqual(
      new Set(['POST /users/login', 'GET /club-management/courts/213', 'GET /reservations'])
    )
  })

  it('never logs tokens, credentials, phones or names', () => {
    expect(logs.length).toBeGreaterThan(0)
    expect(containsSecrets(logs, [/Solo|Sibling|Known|Coach|Example\.com/i])).toBe(false)
  })
})
