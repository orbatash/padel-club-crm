import { vi } from 'vitest'
import { loginToLazuz } from '@/lib/integrations/lazuz/auth'
import { LazuzClient } from '@/lib/integrations/lazuz/client'
import type { LazuzConfig } from '@/lib/integrations/lazuz/config'
import { listCourts } from '@/lib/integrations/lazuz/courts'
import { listReservations } from '@/lib/integrations/lazuz/reservations'
import { LazuzTokenManager } from '@/lib/integrations/lazuz/token-manager'

// A fake LAZUZ server installed as the global fetch. No network, no real
// credentials. Every request is recorded so tests can assert that only reads
// (plus the login POST) ever happen.

export const FAKE_PASSWORD = 'fake-password-for-tests'
export const FAKE_USERNAME = '050-000-0000'

export type RecordedRequest = { method: string; path: string; headers: Record<string, string>; body: unknown }

export type LazuzReservationFixture = Record<string, unknown>

export const baseReservation: LazuzReservationFixture = {
  club_id: 213,
  canceled: null,
  canceled_reason: null,
  class_id: null,
  userSubscriptionId: null,
  is_paid_reservation: null,
  parentResId: null,
  day_of_week: null,
  chargingTypeId: 1,
  created_date: '2026-09-20T10:00:00.000Z',
  client_id: null,
  name: null,
  phone: null,
  email: null,
  title: null,
  status: null,
  price: 0,
  payed: null,
  is_recurring: null,
  start_date: '2026-09-29',
  end_date: '2026-09-29',
  start_time: '19:00:00',
  end_time: '20:30:00',
}

export type FakeLazuz = {
  feed: LazuzReservationFixture[]
  courts: { id: number; title: string; type_title: string; parentId: number | null }[]
  /** HTTP status for GET /reservations (200 = serve the feed). */
  reservationsStatus: number
  /** Per-request override for GET /reservations: return a status for this Authorization header. */
  reservationsAuthStatus?: (authorization: string) => number | null
  loginStatus: number
  tokensIssued: number
  requests: RecordedRequest[]
}

export function installFakeLazuz(init: Partial<FakeLazuz> = {}): FakeLazuz {
  const state: FakeLazuz = {
    feed: [],
    courts: [1294, 1295].map((id, i) => ({ id, title: `מגרש ${i + 1}`, type_title: 'פאדל', parentId: null })),
    reservationsStatus: 200,
    loginStatus: 200,
    tokensIssued: 0,
    requests: [],
    ...init,
  }

  const fake = async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    state.requests.push({ method: init.method ?? 'GET', path: url.pathname, headers, body })
    await new Promise((r) => setTimeout(r, 2))

    if (url.pathname === '/users/login') {
      if (state.loginStatus !== 200) return Response.json({}, { status: state.loginStatus })
      const b = body as { phone?: string; password?: string }
      if (b?.phone !== '+972500000000' || b?.password !== FAKE_PASSWORD) return Response.json({}, { status: 401 })
      return Response.json({ data: { token: `tok-${++state.tokensIssued}` } })
    }
    if (url.pathname.startsWith('/club-management/courts/')) return Response.json({ results: state.courts })
    if (url.pathname === '/reservations') {
      const override = state.reservationsAuthStatus?.(headers.Authorization ?? '')
      if (override) return Response.json({}, { status: override })
      if (state.reservationsStatus !== 200) return Response.json({}, { status: state.reservationsStatus })
      const start = url.searchParams.get('start') ?? ''
      const end = url.searchParams.get('end') ?? ''
      return Response.json({
        results: state.feed.filter((r) => String(r.start_date) <= end && String(r.end_date) >= start),
      })
    }
    return Response.json({}, { status: 404 })
  }

  vi.stubGlobal('fetch', fake)
  return state
}

export function fakeConfig(overrides: Partial<LazuzConfig> = {}): LazuzConfig {
  return {
    baseUrl: 'https://lazuz.test',
    username: FAKE_USERNAME,
    password: FAKE_PASSWORD,
    clubId: '213',
    loginCooldownMs: 65 * 60_000,
    fallbackTokenTtlMs: 15 * 60_000,
    refreshMarginMs: 90_000,
    requestTimeoutMs: 1000,
    autoCreateCustomers: false,
    ...overrides,
  }
}

/** A LAZUZ client + token manager wired to the fake server, with an injectable clock. */
export function createTestClient(opts: { config?: LazuzConfig; now?: () => number } = {}) {
  const config = opts.config ?? fakeConfig()
  const now = opts.now ?? Date.now
  const tokens = new LazuzTokenManager({
    login: () => loginToLazuz(config, now),
    refreshMarginMs: config.refreshMarginMs,
    loginCooldownMs: config.loginCooldownMs,
    now,
  })
  const client = new LazuzClient({ config, tokens, now, sleep: async () => {} })
  return { client, tokens, config }
}

/** Fetchers for the sync, bound to a test client. */
export function syncFetchers(client: LazuzClient) {
  return {
    fetchCourts: () => listCourts({ client, clubId: '213' }),
    fetchReservations: (window: { start: string; end: string }) => listReservations(window, { client, clubId: '213' }),
  }
}

/** Collects every structured log line written through console. */
export function captureLogs(): string[] {
  const lines: string[] = []
  for (const method of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
  }
  return lines
}

/** True if any line contains a token, the fake password, phones or other personal data. */
export function containsSecrets(lines: string[], extra: RegExp[] = []): boolean {
  const text = lines.join('\n')
  return [/tok-\d/, new RegExp(FAKE_PASSWORD), /Bearer/, /\+9725\d/, /05\d-?\d{3}-?\d{4}/, ...extra].some((re) => re.test(text))
}
