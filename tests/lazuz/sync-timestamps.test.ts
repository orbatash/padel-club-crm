import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import { count, createTestDb, one } from '../helpers/db'
import { baseReservation as base, createTestClient, installFakeLazuz, syncFetchers } from '../helpers/fake-lazuz'
import { createPgliteSyncStore } from '../helpers/pglite-store'

// Every timestamp a real sync persists must come from the DATABASE clock (the
// run's started_at), even with the app clock 55 s behind.

const W = { start: '2026-09-28', end: '2026-10-05' }
const appNow = () => new Date(Date.now() - 55_000)

describe('sync timestamps use the database clock', () => {
  let db: PGlite
  let sync: (dryRun?: boolean) => ReturnType<typeof runReservationsSync>
  let run1: Date
  let run2: Date
  const startedAt = async (runId: string | null) =>
    (await one<{ started_at: Date }>(db, `select started_at from integration_sync_runs where id = $1`, [runId])).started_at
  const mismatches = (sql: string, at: Date) => count(db, sql, [at.toISOString()])

  beforeAll(async () => {
    db = await createTestDb()
    await db.query(`insert into customers (full_name, phone) values ('A', '+972501111111')`)
    installFakeLazuz({
      feed: [
        { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'A', phone: '0501111111', status: 'confirmed', price: 300 },
        { ...base, id: 2, court_id: 1294, booking_type: 'ext', client_id: 66, name: 'B', phone: '0502222222', status: 'confirmed', price: 300, start_time: '21:00:00', end_time: '22:30:00' },
        { ...base, id: 3, court_id: 1295, booking_type: 'int', title: 'X', price: 200, payed: 0, is_recurring: '0' },
      ],
    })
    const { client } = createTestClient()
    const store = createPgliteSyncStore(db)
    sync = (dryRun = false) => runReservationsSync(W, { dryRun }, { store, clubId: '213', ...syncFetchers(client), now: appNow })
  })

  it('run 1: last_seen_at, synced_at and new matched_at equal the run started_at', async () => {
    const report = await sync()
    expect(report.runRecord.status).toBe('recorded')
    run1 = await startedAt(report.runId)
    expect(run1.getTime() - appNow().getTime()).toBeGreaterThan(50_000) // app clock really is behind

    expect(await mismatches(`select count(*)::int n from court_reservations where last_seen_at is distinct from $1::timestamptz`, run1)).toBe(0)
    expect(await mismatches(`select count(*)::int n from courts where external_id in ('1294','1295') and synced_at is distinct from $1::timestamptz`, run1)).toBe(0)
    expect(await count(db, `select count(*)::int n from courts where external_id not in ('1294','1295') and synced_at is not null`)).toBe(0)
    expect(await mismatches(`select count(*)::int n from court_reservations where external_id = '1' and matched_at is distinct from $1::timestamptz`, run1)).toBe(0)
    expect(await count(db, `select count(*)::int n from court_reservations where external_id in ('2','3') and matched_at is not null`)).toBe(0)
  })

  it('run 2: a changed match gets the new run time, an unchanged one keeps its original', async () => {
    await db.query(`insert into customers (full_name, phone) values ('B', '+972502222222')`)
    await new Promise((r) => setTimeout(r, 20))
    const report = await sync()
    run2 = await startedAt(report.runId)
    expect(run2.getTime()).toBeGreaterThan(run1.getTime())

    expect(await mismatches(`select count(*)::int n from court_reservations where sync_state = 'present' and last_seen_at is distinct from $1::timestamptz`, run2)).toBe(0)
    expect(await mismatches(`select count(*)::int n from courts where external_id in ('1294','1295') and synced_at is distinct from $1::timestamptz`, run2)).toBe(0)
    expect(await mismatches(`select count(*)::int n from court_reservations where external_id = '2' and matched_at is distinct from $1::timestamptz`, run2)).toBe(0)
    expect(await mismatches(`select count(*)::int n from court_reservations where external_id = '1' and matched_at is distinct from $1::timestamptz`, run1)).toBe(0)
    expect(await mismatches(`select count(*)::int n from court_reservations where last_seen_at < $1::timestamptz`, run2)).toBe(0)
  })

  it('dry run persists no timestamps', async () => {
    const before = await one<{ t: Date }>(db, `select max(last_seen_at) t from court_reservations`)
    await sync(true)
    const after = await one<{ t: Date }>(db, `select max(last_seen_at) t from court_reservations`)
    expect(after.t.getTime()).toBe(before.t.getTime())
  })
})
