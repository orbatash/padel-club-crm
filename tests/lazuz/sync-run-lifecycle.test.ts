import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import { count, createTestDb, one } from '../helpers/db'
import {
  baseReservation as base,
  captureLogs,
  containsSecrets,
  createTestClient,
  installFakeLazuz,
  syncFetchers,
  type FakeLazuz,
} from '../helpers/fake-lazuz'
import { createPgliteSyncStore, type StoreHooks } from '../helpers/pglite-store'

// integration_sync_runs lifecycle. Regression for the live incident where the
// app clock was ~55 s behind the database: finished_at (app clock) was earlier
// than started_at (DB clock), the finalizing UPDATE violated
// integration_sync_runs_finish_order, and the failure was swallowed — leaving
// the row 'running' with zero counts.

const W = { start: '2026-09-28', end: '2026-10-05' }
const APP_CLOCK_BEHIND_DB = -55_000

type RunRow = {
  status: string
  fetched_count: number
  created_count: number
  updated_count: number
  skipped_count: number
  missing_count: number
  error: Record<string, unknown> | null
  started_at: Date
  finished_at: Date | null
  ordered: boolean | null
  consistent: boolean
}

const latestRun = (db: PGlite) =>
  one<RunRow>(db, `select status, fetched_count, created_count, updated_count, skipped_count, missing_count, error,
      started_at, finished_at, (finished_at >= started_at) as ordered, ((status = 'running') = (finished_at is null)) as consistent
    from integration_sync_runs order by started_at desc limit 1`)

describe('sync run lifecycle', () => {
  let db: PGlite
  let lazuz: FakeLazuz

  beforeEach(async () => {
    db = await createTestDb()
    lazuz = installFakeLazuz({
      feed: [
        { ...base, id: 1, court_id: 1294, booking_type: 'ext', client_id: 55, name: 'Solo', phone: '0509999999', status: 'confirmed', price: 300 },
        { ...base, id: 2, court_id: 1295, booking_type: 'int', title: 'Coach', price: 200, payed: 0, is_recurring: '0' },
        { ...base, id: 3, court_id: 1295, booking_type: 'na', is_recurring: '1', day_of_week: '1', start_date: '2026-04-06', end_date: '2027-12-27', start_time: '06:00:00', end_time: '07:00:00' },
      ],
    })
  })

  const run = (opts: { skewMs?: number; dryRun?: boolean; hooks?: StoreHooks } = {}) => {
    const { client } = createTestClient()
    return runReservationsSync(W, { dryRun: opts.dryRun ?? false }, {
      store: createPgliteSyncStore(db, opts.hooks),
      clubId: '213',
      ...syncFetchers(client),
      now: () => new Date(Date.now() + (opts.skewMs ?? 0)),
    })
  }

  it('finalizes the same row when the app clock is behind the database (live incident)', async () => {
    const report = await run({ skewMs: APP_CLOCK_BEHIND_DB })
    expect(report).toMatchObject({ ok: true, status: 'success', runRecord: { status: 'recorded' } })
    const row = await latestRun(db)
    expect(row).toMatchObject({ status: 'success', fetched_count: 3, created_count: 3, updated_count: 0, skipped_count: 0, missing_count: 0, error: null })
    expect(row.finished_at).not.toBeNull()
    expect(row.ordered).toBe(true) // integration_sync_runs_finish_order
    expect(row.consistent).toBe(true) // (status = 'running') = (finished_at is null)
    const durationMs = row.finished_at!.getTime() - row.started_at.getTime()
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(durationMs).toBeLessThan(10_000) // on the DB clock, not 55 s earlier
  })

  it('finalizes a second (idempotent) run and leaves nothing running', async () => {
    await run({ skewMs: APP_CLOCK_BEHIND_DB })
    const second = await run({ skewMs: APP_CLOCK_BEHIND_DB })
    expect(second.runRecord.status).toBe('recorded')
    expect(await latestRun(db)).toMatchObject({ status: 'success', created_count: 0, fetched_count: 3 })
    expect(await count(db, `select count(*)::int n from integration_sync_runs where status = 'running'`)).toBe(0)
  })

  it('finalizes when the app clock is ahead of the database', async () => {
    const report = await run({ skewMs: 55_000 })
    expect(report.runRecord.status).toBe('recorded')
    expect(await latestRun(db)).toMatchObject({ status: 'success', ordered: true, consistent: true })
  })

  it('marks the same row failed with a safe error when LAZUZ fails', async () => {
    lazuz.reservationsStatus = 500
    const report = await run({ skewMs: APP_CLOCK_BEHIND_DB })
    expect(report).toMatchObject({ ok: false, status: 'failed', runRecord: { status: 'recorded' } })
    const row = await latestRun(db)
    expect(row).toMatchObject({ status: 'failed', ordered: true, consistent: true })
    expect(row.error).toMatchObject({ kind: 'transient', operation: 'listReservations' })
    expect(JSON.stringify(row.error)).not.toMatch(/tok-|Bearer|050|Solo/)
    expect(await count(db, `select count(*)::int n from court_reservations`)).toBe(0)
  })

  it('surfaces a finalization failure after one retry, with an explicit safe log', async () => {
    const logs = captureLogs()
    let attempts = 0
    const report = await run({ skewMs: APP_CLOCK_BEHIND_DB, hooks: { onFinish: () => attempts++, failFinish: () => true } })
    expect(attempts).toBe(2)
    expect(report.ok).toBe(true) // the data sync itself succeeded
    expect(report.runRecord).toMatchObject({ status: 'failed', error: { operation: 'db.finishRun' } })
    const line = logs.find((l) => l.includes('lazuz.sync.run_finalize_failed'))
    expect(line).toBeDefined()
    expect(containsSecrets([line!], [/Solo/])).toBe(false)
  })

  it('recovers when finalization fails once', async () => {
    let attempts = 0
    const report = await run({ hooks: { onFinish: () => attempts++, failFinish: () => attempts === 1 } })
    expect(attempts).toBe(2)
    expect(report.runRecord.status).toBe('recorded')
    expect((await latestRun(db)).status).toBe('success')
  })

  it('dry run creates no run row', async () => {
    const report = await run({ dryRun: true })
    expect(report.runRecord.status).toBe('not_applicable')
    expect(await count(db, `select count(*)::int n from integration_sync_runs`)).toBe(0)
  })
})
