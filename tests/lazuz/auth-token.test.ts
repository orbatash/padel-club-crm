import { beforeEach, describe, expect, it } from 'vitest'
import { IntegrationError } from '@/lib/integrations/core/errors'
import { parseLoginResponse } from '@/lib/integrations/lazuz/auth'
import {
  captureLogs,
  containsSecrets,
  createTestClient,
  fakeConfig,
  FAKE_PASSWORD,
  installFakeLazuz,
  type FakeLazuz,
} from '../helpers/fake-lazuz'

const T0 = 1_800_000_000_000
const jwt = (expSec: number) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url'), 'c2lnbmF0dXJl'].join('.')

const reservationsReq = {
  operation: 'listReservations',
  method: 'GET' as const,
  path: '/reservations',
  query: { club_id: '213', start: '2026-09-28', end: '2026-10-05' },
}

async function expectIntegrationError(promise: Promise<unknown>): Promise<IntegrationError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(IntegrationError)
    return error as IntegrationError
  }
  throw new Error('expected an IntegrationError')
}

describe('parseLoginResponse', () => {
  it.each([
    ['token', { token: 't1' }],
    ['access_token', { access_token: 't1' }],
    ['data.token', { data: { token: 't1' } }],
    ['data.access_token', { data: { access_token: 't1' } }],
    ['user.token', { user: { token: 't1' } }],
    ['user.access_token', { user: { access_token: 't1' } }],
  ])('finds the token at %s', (_label, body) => {
    const parsed = parseLoginResponse(body, T0, 900_000)
    expect(parsed).toMatchObject({ token: 't1', expirySource: 'fallback', expiresAt: T0 + 900_000 })
  })

  it('strips a "Bearer " prefix', () => {
    expect(parseLoginResponse({ token: 'Bearer abc' }, T0, 900_000)?.token).toBe('abc')
  })

  it('prefers expires_in, then JWT exp', () => {
    expect(parseLoginResponse({ data: { token: 'x', expires_in: 600 } }, T0, 900_000)).toMatchObject({
      expiresAt: T0 + 600_000,
      expirySource: 'expires_in',
    })
    expect(parseLoginResponse({ token: jwt(T0 / 1000 + 840) }, T0, 900_000)).toMatchObject({
      expiresAt: T0 + 840_000,
      expirySource: 'jwt_exp',
    })
  })

  it('returns null when there is no token', () => {
    expect(parseLoginResponse({ ok: true }, T0, 900_000)).toBeNull()
  })
})

describe('LAZUZ login request', () => {
  let lazuz: FakeLazuz
  beforeEach(() => {
    lazuz = installFakeLazuz()
  })

  it('sends { phone, password } with the phone normalized to +972 and browser-like headers', async () => {
    const { tokens } = createTestClient()
    await tokens.getToken()
    const login = lazuz.requests.find((r) => r.path === '/users/login')!
    expect(login.method).toBe('POST')
    expect(Object.keys(login.body as object).sort()).toEqual(['password', 'phone'])
    expect((login.body as { phone: string }).phone).toBe('+972500000000')
    expect(login.headers).toMatchObject({
      Origin: 'https://clubsnew.lazuz.co.il',
      Referer: 'https://clubsnew.lazuz.co.il/',
      app_version: 'dashboard-3.2.0',
      test: 'test',
      Accept: 'application/json, text/plain, */*',
    })
  })

  it('rejects an invalid username without calling LAZUZ and without a cooldown', async () => {
    const { tokens } = createTestClient({ config: fakeConfig({ username: 'not-a-phone' }) })
    const err = await expectIntegrationError(tokens.getToken())
    expect(err.kind).toBe('not_configured')
    expect(lazuz.requests).toHaveLength(0)
    expect(tokens.status().loginBlockedForSec).toBe(0)
  })
})

describe('token lifecycle', () => {
  let lazuz: FakeLazuz
  let clock: number
  const now = () => clock
  beforeEach(() => {
    lazuz = installFakeLazuz()
    clock = T0
  })
  const logins = () => lazuz.requests.filter((r) => r.path === '/users/login').length

  it('reuses a valid token', async () => {
    const { tokens } = createTestClient({ now })
    const a = await tokens.getToken()
    clock += 5 * 60_000
    const b = await tokens.getToken()
    expect(b.token).toBe(a.token)
    expect(logins()).toBe(1)
  })

  it('refreshes once inside the safety margin before expiry', async () => {
    const { tokens } = createTestClient({ now })
    await tokens.getToken()
    clock += 14 * 60_000 // 15-min fallback TTL − 90 s margin
    const b = await tokens.getToken()
    expect(b.token).toBe('tok-2')
    expect(logins()).toBe(2)
  })

  it('deduplicates concurrent logins (10 callers → 1 login)', async () => {
    const { tokens } = createTestClient({ now })
    const all = await Promise.all(Array.from({ length: 10 }, () => tokens.getToken()))
    expect(logins()).toBe(1)
    expect(new Set(all.map((t) => t.token))).toEqual(new Set(['tok-1']))
  })

  it('keeps a still-valid token if an early refresh fails, without a login storm', async () => {
    const { tokens } = createTestClient({ now })
    await tokens.getToken()
    clock += 14 * 60_000
    lazuz.loginStatus = 503
    const a = await tokens.getToken()
    const b = await tokens.getToken()
    expect([a.token, b.token]).toEqual(['tok-1', 'tok-1'])
    expect(logins()).toBe(2) // initial + one failed refresh, then backoff
  })

  it('pauses logins for the configured cooldown after rejected credentials', async () => {
    const { tokens } = createTestClient({ now, config: fakeConfig({ password: 'wrong' }) })
    expect((await expectIntegrationError(tokens.getToken())).kind).toBe('auth')
    const err = await expectIntegrationError(tokens.getToken())
    expect(err.kind).toBe('login_cooldown')
    expect(err.details.retryAfterSec).toBe(65 * 60)
    expect(logins()).toBe(1)
  })

  it('logs in again after the cooldown has passed', async () => {
    const config = fakeConfig({ password: 'wrong' })
    const { tokens } = createTestClient({ now, config })
    await expectIntegrationError(tokens.getToken())
    config.password = FAKE_PASSWORD
    clock += 66 * 60_000
    await expect(tokens.getToken()).resolves.toMatchObject({ token: 'tok-1' })
    expect(logins()).toBe(2)
  })

  it('applies the cooldown after a rate-limited login (429)', async () => {
    lazuz.loginStatus = 429
    const { tokens } = createTestClient({ now })
    expect((await expectIntegrationError(tokens.getToken())).kind).toBe('rate_limited')
    expect((await expectIntegrationError(tokens.getToken())).kind).toBe('login_cooldown')
    expect(logins()).toBe(1)
  })
})

describe('authenticated requests', () => {
  let lazuz: FakeLazuz
  let clock: number
  const now = () => clock
  beforeEach(() => {
    lazuz = installFakeLazuz()
    clock = T0
  })
  const logins = () => lazuz.requests.filter((r) => r.path === '/users/login').length
  const authHeaders = () => lazuz.requests.filter((r) => r.path === '/reservations').map((r) => r.headers.Authorization)

  it.each([401, 403])('%i → invalidate, log in once, retry once', async (status) => {
    const { client } = createTestClient({ now })
    await client.checkAuth()
    clock += 5 * 60_000
    lazuz.reservationsAuthStatus = (auth) => (auth === 'Bearer tok-1' ? status : null)
    await expect(client.request(reservationsReq)).resolves.toEqual({ results: [] })
    expect(logins()).toBe(2)
    expect(authHeaders()).toEqual(['Bearer tok-1', 'Bearer tok-2'])
  })

  it('returns a structured error when the retry is rejected too', async () => {
    const { client } = createTestClient({ now })
    await client.checkAuth()
    clock += 5 * 60_000
    lazuz.reservationsStatus = 401
    const err = await expectIntegrationError(client.request(reservationsReq))
    expect(err.kind).toBe('auth')
    expect(err.details.attempts).toBe(2)
    expect(logins()).toBe(2)
  })

  it('does not log in again when a brand-new token is rejected', async () => {
    const { client } = createTestClient({ now })
    lazuz.reservationsStatus = 403
    const err = await expectIntegrationError(client.request(reservationsReq))
    expect(err.kind).toBe('forbidden')
    expect(logins()).toBe(1)
  })

  it('shares one refresh between concurrent 401s', async () => {
    const { client } = createTestClient({ now })
    await client.checkAuth()
    clock += 5 * 60_000
    lazuz.reservationsAuthStatus = (auth) => (auth === 'Bearer tok-1' ? 401 : null)
    await Promise.all(Array.from({ length: 5 }, () => client.request(reservationsReq)))
    expect(logins()).toBe(2)
  })

  it('retries transient GET failures', async () => {
    const { client } = createTestClient({ now })
    let calls = 0
    lazuz.reservationsAuthStatus = () => (++calls === 1 ? 502 : null)
    await expect(client.request(reservationsReq)).resolves.toEqual({ results: [] })
    expect(calls).toBe(2)
  })

  it('never retries a write on a transient failure and flags it as possibly applied', async () => {
    const { client } = createTestClient({ now })
    lazuz.reservationsStatus = 500
    const err = await expectIntegrationError(
      client.request({ operation: 'writeProbe', method: 'POST', path: '/reservations', body: { probe: true } })
    )
    expect(err.details.mayHaveSucceeded).toBe(true)
    expect(lazuz.requests.filter((r) => r.path === '/reservations')).toHaveLength(1)
  })

  it('never logs tokens, credentials or phone numbers', async () => {
    const logs = captureLogs()
    const { client } = createTestClient({ now })
    await client.checkAuth()
    clock += 5 * 60_000
    lazuz.reservationsAuthStatus = (auth) => (auth === 'Bearer tok-1' ? 401 : null)
    await client.request(reservationsReq)
    expect(logs.length).toBeGreaterThan(0)
    expect(containsSecrets(logs)).toBe(false)
  })
})
