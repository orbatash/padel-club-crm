import { requireOwner } from '@/lib/auth'
import { isIntegrationError } from '@/lib/integrations/core/errors'
import { getLazuzClient } from '@/lib/integrations/lazuz/client'
import { listReservations, summarizeReservations } from '@/lib/integrations/lazuz/reservations'

// Owner-only LAZUZ diagnostics. Read-only.
//   GET /api/integrations/lazuz/health                      → authentication only
//   GET /api/integrations/lazuz/health?check=config         → TEMPORARY credential shape (no LAZUZ call)
//   GET /api/integrations/lazuz/health?check=reservations&start=YYYY-MM-DD&end=YYYY-MM-DD
// Never returns the token, credentials, or customer names/phones.

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

function isoDate(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d)
}

// TEMPORARY (remove once login works): shape of the credentials as Next.js
// parsed them from .env.local. Lengths and booleans only — never values.
// Does not contact LAZUZ.
function credentialShape() {
  const username = process.env.LAZUZ_USERNAME
  const password = process.env.LAZUZ_PASSWORD
  const hasEdgeWhitespace = (v: string) => v !== v.trim()
  return {
    username:
      username === undefined
        ? { set: false }
        : {
            set: true,
            length: username.length,
            startsWithPlus972: username.startsWith('+972'),
            hasLeadingOrTrailingWhitespace: hasEdgeWhitespace(username),
          },
    password:
      password === undefined
        ? { set: false }
        : {
            set: true,
            length: password.length,
            hasLeadingOrTrailingWhitespace: hasEdgeWhitespace(password),
          },
  }
}

export async function GET(request: Request) {
  await requireOwner()
  const url = new URL(request.url)

  if (url.searchParams.get('check') === 'config') {
    return json({ ok: true, temporaryDiagnostic: true, credentials: credentialShape() })
  }

  try {
    const client = getLazuzClient()
    const auth = await client.checkAuth()

    if (url.searchParams.get('check') !== 'reservations') {
      return json({ ok: true, auth })
    }

    const today = new Date()
    const start = url.searchParams.get('start') ?? isoDate(today)
    const end = url.searchParams.get('end') ?? isoDate(new Date(today.getTime() + 7 * 86_400_000))
    const result = await listReservations({ start, end })

    return json({
      ok: true,
      auth: client.tokenStatus(),
      range: { start, end },
      // Counts only: booking types, courts, statuses and expanded occurrences.
      // No names, phones, emails, titles or notes.
      reservations: summarizeReservations(result, start, end),
    })
  } catch (error) {
    if (isIntegrationError(error)) {
      return json({ ok: false, error: error.toSafeJSON(), auth: safeStatus() }, 502)
    }
    return json({ ok: false, error: { kind: 'unexpected', message: 'Unexpected error' } }, 500)
  }
}

function safeStatus() {
  try {
    return getLazuzClient().tokenStatus()
  } catch {
    return null
  }
}
