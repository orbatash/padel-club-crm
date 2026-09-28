import 'server-only'

import { normalizePhone } from '@/lib/customers/phone'
import { IntegrationError } from '@/lib/integrations/core/errors'
import type { LazuzConfig } from './config'
import { fetchWithTimeout } from './http'

// POST /users/login { phone, password } → a short-lived token. This module only performs the
// login and parses the response; caching and refresh policy live in
// token-manager.ts.

export type LazuzToken = {
  token: string
  /** Epoch ms. */
  obtainedAt: number
  /** Epoch ms. */
  expiresAt: number
  expirySource: 'expires_in' | 'jwt_exp' | 'fallback'
}

const TOKEN_PATHS = [
  ['token'],
  ['access_token'],
  ['data', 'token'],
  ['data', 'access_token'],
  ['user', 'token'],
  ['user', 'access_token'],
] as const

const EXPIRES_IN_PATHS = [['expires_in'], ['data', 'expires_in'], ['user', 'expires_in']] as const

const MIN_TTL_MS = 60_000
const MAX_TTL_MS = 24 * 60 * 60_000

function pick(body: unknown, path: readonly string[]): unknown {
  let node = body
  for (const key of path) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** Reads `exp` from a JWT payload without verifying it (we only need the time). */
function jwtExpiry(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function parseLoginResponse(body: unknown, obtainedAt: number, fallbackTtlMs: number): LazuzToken | null {
  let token: string | null = null
  for (const path of TOKEN_PATHS) {
    const value = pick(body, path)
    if (typeof value === 'string' && value.trim()) {
      token = value.trim().replace(/^bearer\s+/i, '')
      break
    }
  }
  if (!token) return null

  const clamp = (ttl: number) => Math.min(Math.max(ttl, MIN_TTL_MS), MAX_TTL_MS)

  for (const path of EXPIRES_IN_PATHS) {
    const value = Number(pick(body, path))
    if (Number.isFinite(value) && value > 0) {
      return { token, obtainedAt, expiresAt: obtainedAt + clamp(value * 1000), expirySource: 'expires_in' }
    }
  }

  const exp = jwtExpiry(token)
  if (exp) {
    return { token, obtainedAt, expiresAt: obtainedAt + clamp(exp - obtainedAt), expirySource: 'jwt_exp' }
  }

  return { token, obtainedAt, expiresAt: obtainedAt + clamp(fallbackTtlMs), expirySource: 'fallback' }
}

export async function loginToLazuz(config: LazuzConfig, now: () => number = Date.now): Promise<LazuzToken> {
  // Start the clock before the request so any latency shortens the assumed
  // lifetime rather than extending it.
  const obtainedAt = now()
  const operation = 'login'

  // LAZUZ expects the phone in international format (+972…). Accept 05… or
  // +972… in LAZUZ_USERNAME and normalize; never include the value in errors.
  const phone = normalizePhone(config.username)
  if (!phone.ok) {
    throw new IntegrationError('not_configured', 'LAZUZ_USERNAME is not a valid phone number', {
      provider: 'lazuz',
      operation,
    })
  }

  const response = await fetchWithTimeout(
    `${config.baseUrl}/users/login`,
    {
      method: 'POST',
      // Mirrors the non-secret parts of the LAZUZ club dashboard's login request.
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://clubsnew.lazuz.co.il',
        Referer: 'https://clubsnew.lazuz.co.il/',
        app_version: 'dashboard-3.2.0',
        test: 'test',
      },
      body: JSON.stringify({ phone: phone.e164, password: config.password }),
    },
    config.requestTimeoutMs,
    operation
  )

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new IntegrationError('rate_limited', 'LAZUZ login rate-limited', {
      provider: 'lazuz',
      operation,
      status: 429,
      retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
    })
  }
  if (response.status === 404) {
    throw new IntegrationError('not_configured', 'LAZUZ login endpoint not found (check LAZUZ_API_BASE_URL)', {
      provider: 'lazuz',
      operation,
      status: 404,
    })
  }
  if ([400, 401, 403, 422].includes(response.status)) {
    throw new IntegrationError('auth', 'LAZUZ rejected the login credentials', {
      provider: 'lazuz',
      operation,
      status: response.status,
    })
  }
  if (!response.ok) {
    throw new IntegrationError('transient', 'LAZUZ login failed', {
      provider: 'lazuz',
      operation,
      status: response.status,
    })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new IntegrationError('invalid_response', 'LAZUZ login response is not JSON', {
      provider: 'lazuz',
      operation,
      status: response.status,
    })
  }

  const parsed = parseLoginResponse(body, obtainedAt, config.fallbackTokenTtlMs)
  if (!parsed) {
    const keys = body && typeof body === 'object' ? Object.keys(body).join(',') : typeof body
    throw new IntegrationError('invalid_response', 'LAZUZ login response has no token', {
      provider: 'lazuz',
      operation,
      status: response.status,
      hint: `top-level keys: ${keys}`,
    })
  }
  return parsed
}
