import 'server-only'

import { normalizePhone } from '@/lib/customers/phone'
import { IntegrationError, isIntegrationError } from '@/lib/integrations/core/errors'
import { logEvent } from '@/lib/integrations/core/log'
import type { LazuzCourt } from '../courts'
import type { ReservationsResult } from '../reservations'
import { isWallDate } from '../time'
import { planCourts, planOccupancies, planReservations, type MatchCounts } from './plan'
import type { SyncStore, SyncWindow } from './types'

// LAZUZ → Supabase reservations sync (one explicit date window).
//
// LAZUZ is only READ (courts + reservations). Only our integration tables are
// written, through the store (service role in production).
//
// Phases:
//   1. FETCH   courts and reservations from LAZUZ. Nothing is written yet, so a
//              LAZUZ failure can never mark anything missing.
//   2. READ    current DB state needed for planning.
//   3. PLAN    pure decisions (plan.ts).
//   4. WRITE   (skipped in dry-run), in a failure-safe order:
//              courts → identities → reservations → mark missing →
//              upsert occupancies → delete stale occupancies.
//   5. RECORD  the run in integration_sync_runs (not in dry-run).
//
// Each write is one PostgREST request (one transaction). The phases are not
// one transaction; the order is chosen so an interruption leaves data that is
// safe (never fewer occupancies than reality) and a re-run of the same window
// heals it. See the report in the API response for counts.

export const SYNC_OPERATION = 'reservations_sync'
export const MAX_WINDOW_DAYS = 62
const RUN_LOCK_MINUTES = 15

export type SyncDeps = {
  store: SyncStore
  clubId: string
  fetchCourts: () => Promise<LazuzCourt[]>
  fetchReservations: (window: SyncWindow) => Promise<ReservationsResult>
  /** App wall clock: only for the concurrent-run lock window and dry-run reports (never persisted). */
  now?: () => Date
  /** Monotonic milliseconds, for measuring run duration independent of clock skew. */
  monotonic?: () => number
}

export type SyncReport = {
  ok: boolean
  dryRun: boolean
  runId: string | null
  window: SyncWindow
  status: 'success' | 'partial' | 'failed'
  courts: { fetched: number; created: number; updated: number; unchanged: number }
  reservations: {
    fetched: number
    created: number
    updated: number
    unchanged: number
    skipped: number
    skippedReasons: Record<string, number>
    cancelled: number
    missing: number
    missingDetection: 'applied' | 'disabled'
    missingDisabledReason: string | null
  }
  matching: MatchCounts & { identitiesCreated: number }
  occupancies: { desired: number; created: number; changed: number; deleted: number }
  error: ReturnType<IntegrationError['toSafeJSON']> | null
  /**
   * Whether the integration_sync_runs row was finalized. 'failed' means the
   * sync itself may have completed but its run record could not be written.
   */
  runRecord: { status: 'not_applicable' | 'recorded' | 'failed'; error: ReturnType<IntegrationError['toSafeJSON']> | null }
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000)
}

export function validateWindow(window: SyncWindow) {
  if (!isWallDate(window.start) || !isWallDate(window.end) || window.start > window.end) {
    throw new IntegrationError('bad_request', 'start/end must be YYYY-MM-DD with start ≤ end', {
      provider: 'lazuz',
      operation: SYNC_OPERATION,
    })
  }
  if (daysBetween(window.start, window.end) + 1 > MAX_WINDOW_DAYS) {
    throw new IntegrationError('bad_request', `window is limited to ${MAX_WINDOW_DAYS} days`, {
      provider: 'lazuz',
      operation: SYNC_OPERATION,
    })
  }
}

function emptyReport(window: SyncWindow, dryRun: boolean): SyncReport {
  return {
    ok: false,
    dryRun,
    runId: null,
    window,
    status: 'failed',
    courts: { fetched: 0, created: 0, updated: 0, unchanged: 0 },
    reservations: {
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      skippedReasons: {},
      cancelled: 0,
      missing: 0,
      missingDetection: 'disabled',
      missingDisabledReason: null,
    },
    matching: {
      matched_client_id: 0,
      matched_phone: 0,
      manual: 0,
      ambiguous: 0,
      unmatched: 0,
      not_applicable: 0,
      identitiesCreated: 0,
    },
    occupancies: { desired: 0, created: 0, changed: 0, deleted: 0 },
    error: null,
    runRecord: { status: 'not_applicable', error: null },
  }
}

export async function runReservationsSync(
  window: SyncWindow,
  options: { dryRun: boolean },
  deps: SyncDeps
): Promise<SyncReport> {
  validateWindow(window)
  const now = deps.now ?? (() => new Date())
  const monotonic = deps.monotonic ?? (() => performance.now())
  const { store } = deps
  const report = emptyReport(window, options.dryRun)
  let runStartedAt: string | null = null
  let runStartedMono = 0

  if (!options.dryRun) {
    const since = new Date(now().getTime() - RUN_LOCK_MINUTES * 60_000).toISOString()
    if (await store.hasRecentRunningRun(SYNC_OPERATION, since)) {
      throw new IntegrationError('bad_request', 'another LAZUZ sync is already running', {
        provider: 'lazuz',
        operation: SYNC_OPERATION,
      })
    }
    const run = await store.startRun(SYNC_OPERATION, window)
    report.runId = run.id
    runStartedAt = run.startedAt
    runStartedMono = monotonic()
  }

  logEvent('info', 'lazuz.sync.start', { runId: report.runId, dryRun: options.dryRun, window })

  try {
    // 1. FETCH — no writes before this completes.
    const [lazuzCourts, fetched] = await Promise.all([deps.fetchCourts(), deps.fetchReservations(window)])
    // Real syncs stamp every persisted timestamp (last_seen_at, synced_at,
    // matched_at) with the run's DATABASE started_at, so they share the
    // database clock with created_at/first_seen_at/updated_at. A dry run
    // writes nothing, so the app clock is fine there.
    const nowIso = runStartedAt ?? now().toISOString()

    // 2+3. courts: read, plan, (write)
    const existingCourts = await store.loadCourts()
    const courtPlan = planCourts(lazuzCourts, existingCourts, deps.clubId, nowIso)
    report.courts = { fetched: lazuzCourts.length, ...courtPlanCounts(courtPlan) }

    const courtIdByExternal = new Map(existingCourts.map((c) => [c.external_id, c.id]))
    if (!options.dryRun && courtPlan.upserts.length) {
      for (const c of await store.upsertCourts(courtPlan.upserts)) courtIdByExternal.set(c.external_id, c.id)
    }

    // 2. READ reservation state
    const externalIds = fetched.reservations.map((r) => r.externalId)
    const clientIds = [...new Set(fetched.reservations.map((r) => r.clientExternalId).filter((v): v is string => !!v))]
    const [existingRows, presentOverlapping, identities] = await Promise.all([
      store.loadReservationsByExternalIds(externalIds),
      store.loadPresentOverlapping(window),
      store.loadIdentities(clientIds),
    ])
    const phones = [
      ...new Set(
        fetched.reservations
          .filter((r) => r.occupancyType === 'customer_booking' && r.customerPhone)
          .map((r) => normalizePhone(r.customerPhone!))
          .filter((p) => p.ok)
          .map((p) => (p as { e164: string }).e164)
      ),
    ]
    const customers = await store.loadActiveCustomersByPhones(phones)
    const customersByPhone = new Map<string, string[]>()
    for (const c of customers) customersByPhone.set(c.phone, [...(customersByPhone.get(c.phone) ?? []), c.id])

    // 3. PLAN reservations
    const plan = planReservations({
      window,
      reservations: fetched.reservations,
      parserSkipped: fetched.skipped,
      courtIdByExternal,
      existingByExternalId: new Map(existingRows.map((r) => [r.external_id, r])),
      presentOverlapping,
      match: { identities: new Map(identities.map((i) => [i.external_id, i.customer_id])), customersByPhone },
      now: nowIso,
    })

    report.reservations = {
      fetched: plan.counts.fetched,
      created: plan.counts.created,
      updated: plan.counts.updated,
      unchanged: plan.counts.unchanged,
      skipped: plan.counts.skipped,
      skippedReasons: {
        ...fetched.skippedReasons,
        ...(plan.counts.unknownCourt ? { unknown_court: plan.counts.unknownCourt } : {}),
      },
      cancelled: plan.counts.cancelled,
      missing: plan.counts.missing,
      missingDetection: plan.missingDisabledReason ? 'disabled' : 'applied',
      missingDisabledReason: plan.missingDisabledReason,
    }
    report.matching = { ...plan.matchCounts, identitiesCreated: plan.identities.length }

    // 4. WRITE (order matters — see header)
    const reservationIdByExternal = new Map(existingRows.map((r) => [r.external_id, r.id]))
    if (!options.dryRun) {
      if (plan.identities.length) await store.insertIdentities(plan.identities)
      if (plan.rows.length) {
        for (const r of await store.upsertReservations(plan.rows)) reservationIdByExternal.set(r.external_id, r.id)
      }
      if (plan.missingIds.length) await store.markMissing(plan.missingIds)
    }

    // Occupancies are planned after reservation writes so new rows have ids.
    const existingOccupancies = await store.loadOccupancies(window)
    const occ = planOccupancies({ window, rows: plan.rows, reservationIdByExternal, existing: existingOccupancies })
    report.occupancies = occ.counts
    if (!options.dryRun) {
      // Upsert first, delete stale second: an interruption can leave an extra
      // (stale) interval, never a hole where the court is actually booked.
      if (occ.upserts.length) await store.upsertOccupancies(occ.upserts)
      if (occ.staleIds.length) await store.deleteOccupancies(occ.staleIds)
    }

    report.status = plan.missingDisabledReason || plan.counts.skipped > 0 ? 'partial' : 'success'
    report.ok = true
  } catch (error) {
    const err = isIntegrationError(error)
      ? error
      : new IntegrationError('transient', 'LAZUZ sync failed unexpectedly', {
          provider: 'lazuz',
          operation: SYNC_OPERATION,
          hint: error instanceof Error ? error.name : undefined,
        })
    report.ok = false
    report.status = 'failed'
    report.error = err.toSafeJSON()
  } finally {
    if (report.runId && runStartedAt) {
      await finalizeRun(store, report, runStartedAt, monotonic() - runStartedMono)
    }
  }

  logEvent(report.ok ? 'info' : 'warn', 'lazuz.sync.finish', {
    runId: report.runId,
    dryRun: report.dryRun,
    status: report.status,
    window,
    reservations: report.reservations,
    occupancies: report.occupancies,
    matching: report.matching,
    error: report.error,
    runRecord: report.runRecord.status,
  })
  return report
}

/**
 * Writes the final state of the run row. finished_at is derived from the
 * DATABASE's started_at plus the measured duration, so it is always
 * ≥ started_at even when the app clock is behind the database clock (the
 * integration_sync_runs_finish_order constraint). Retries once; if it still
 * fails the report says so explicitly and a safe error is logged — it never
 * fails silently.
 */
async function finalizeRun(store: SyncStore, report: SyncReport, startedAt: string, elapsedMs: number) {
  const finishedAt = new Date(Date.parse(startedAt) + Math.max(0, Math.round(elapsedMs))).toISOString()
  const finish = {
    status: report.status,
    fetched_count: report.reservations.fetched,
    created_count: report.reservations.created,
    updated_count: report.reservations.updated,
    skipped_count: report.reservations.skipped,
    missing_count: report.reservations.missing,
    error: report.error,
    finished_at: finishedAt,
  } as const

  let lastError: IntegrationError | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await store.finishRun(report.runId!, finish)
      report.runRecord = { status: 'recorded', error: null }
      return
    } catch (error) {
      lastError = isIntegrationError(error)
        ? error
        : new IntegrationError('transient', 'Recording the sync run failed', {
            provider: 'lazuz',
            operation: 'db.finishRun',
          })
    }
  }
  report.runRecord = { status: 'failed', error: lastError!.toSafeJSON() }
  logEvent('error', 'lazuz.sync.run_finalize_failed', {
    runId: report.runId,
    syncStatus: report.status,
    error: lastError!.toSafeJSON(),
  })
}

function courtPlanCounts(p: ReturnType<typeof planCourts>) {
  return { created: p.created, updated: p.updated, unchanged: p.unchanged }
}
