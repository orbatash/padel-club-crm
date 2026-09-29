import 'server-only'

import { IntegrationError } from '@/lib/integrations/core/errors'

// LAZUZ configuration. Server-only; read lazily so the app builds and runs
// without LAZUZ configured, and fails with a structured error only when a
// LAZUZ call is actually made.

export type LazuzConfig = {
  baseUrl: string
  username: string
  password: string
  clubId: string | null
  /** After a failed or rate-limited login, don't try again for this long. */
  loginCooldownMs: number
  /** Token lifetime to assume when the login response and token don't say. */
  fallbackTokenTtlMs: number
  /** Refresh this long before the token expires. */
  refreshMarginMs: number
  requestTimeoutMs: number
  /**
   * Let the sync create CRM customers for customer bookings whose phone
   * matches no non-archived customer. Off unless LAZUZ_AUTO_CREATE_CUSTOMERS=true
   * (requires migration 20260930120000_lazuz_auto_created_customers).
   */
  autoCreateCustomers: boolean
}

const DEFAULT_BASE_URL = 'https://server.lazuz.co.il'

function positiveNumber(name: string, fallback: number) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new IntegrationError('not_configured', `${name} must be a positive number`, {
      provider: 'lazuz',
      operation: 'config',
    })
  }
  return n
}

export function getLazuzConfig(): LazuzConfig {
  const username = process.env.LAZUZ_USERNAME?.trim()
  const password = process.env.LAZUZ_PASSWORD
  if (!username || !password) {
    throw new IntegrationError('not_configured', 'LAZUZ_USERNAME and LAZUZ_PASSWORD are not set', {
      provider: 'lazuz',
      operation: 'config',
    })
  }

  const baseUrl = (process.env.LAZUZ_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  if (!baseUrl.startsWith('https://')) {
    throw new IntegrationError('not_configured', 'LAZUZ_API_BASE_URL must use https', {
      provider: 'lazuz',
      operation: 'config',
    })
  }

  return {
    baseUrl,
    username,
    password,
    clubId: process.env.LAZUZ_CLUB_ID?.trim() || null,
    // 65 minutes mirrors the old system's guard against a suspected login rate
    // limit. Configurable until the real LAZUZ behaviour is verified.
    loginCooldownMs: positiveNumber('LAZUZ_LOGIN_COOLDOWN_MINUTES', 65) * 60_000,
    fallbackTokenTtlMs: positiveNumber('LAZUZ_TOKEN_TTL_SECONDS', 15 * 60) * 1000,
    refreshMarginMs: positiveNumber('LAZUZ_TOKEN_REFRESH_MARGIN_SECONDS', 90) * 1000,
    requestTimeoutMs: 15_000,
    autoCreateCustomers: process.env.LAZUZ_AUTO_CREATE_CUSTOMERS?.trim().toLowerCase() === 'true',
  }
}
