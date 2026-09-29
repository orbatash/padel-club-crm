import { requireOwner } from '@/lib/auth'
import { isIntegrationError } from '@/lib/integrations/core/errors'
import { listCourts } from '@/lib/integrations/lazuz/courts'
import { getLazuzConfig } from '@/lib/integrations/lazuz/config'
import { listReservations } from '@/lib/integrations/lazuz/reservations'
import { runReservationsSync } from '@/lib/integrations/lazuz/sync/run'
import { createSupabaseSyncStore } from '@/lib/integrations/lazuz/sync/supabase-store'

// Owner-only manual LAZUZ → Supabase sync for one date window.
//
//   POST /api/integrations/lazuz/sync
//   Content-Type: application/json
//   { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "dryRun": true }
//
// Dry-run is the DEFAULT: it fetches, plans and returns counts without writing
// anything. Pass "dryRun": false to write. LAZUZ is only read, never written.
// The response contains counts only — no names, phones, emails or titles.

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  await requireOwner()

  // CSRF guard: JSON only (cross-site forms can't send it without CORS), same origin.
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: { kind: 'bad_request', message: 'Content-Type must be application/json' } }, 415)
  }
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: { kind: 'forbidden', message: 'Cross-origin request rejected' } }, 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: { kind: 'bad_request', message: 'Body must be JSON' } }, 400)
  }
  const { start, end, dryRun } = (body ?? {}) as { start?: unknown; end?: unknown; dryRun?: unknown }
  if (typeof start !== 'string' || typeof end !== 'string') {
    return json({ ok: false, error: { kind: 'bad_request', message: 'start and end (YYYY-MM-DD) are required' } }, 400)
  }

  try {
    const config = getLazuzConfig()
    const clubId = config.clubId
    if (!clubId) {
      return json({ ok: false, error: { kind: 'not_configured', message: 'LAZUZ_CLUB_ID is not set' } }, 500)
    }
    const report = await runReservationsSync(
      { start, end },
      // Customer auto-creation is a server setting (LAZUZ_AUTO_CREATE_CUSTOMERS),
      // never a request parameter. Dry runs report would_auto_create either way.
      { dryRun: dryRun !== false, autoCreateCustomers: config.autoCreateCustomers },
      {
        store: createSupabaseSyncStore(),
        clubId,
        fetchCourts: () => listCourts({ clubId }),
        fetchReservations: (window) => listReservations(window, { clubId }),
      }
    )
    // A sync whose run record could not be finalized is reported as an error,
    // even if the data itself was written.
    const recorded = report.dryRun || report.runRecord.status === 'recorded'
    return json(report, report.ok && recorded ? 200 : report.ok ? 500 : 502)
  } catch (error) {
    if (isIntegrationError(error)) {
      return json({ ok: false, error: error.toSafeJSON() }, error.kind === 'bad_request' ? 400 : 502)
    }
    return json({ ok: false, error: { kind: 'unexpected', message: 'Unexpected error' } }, 500)
  }
}
