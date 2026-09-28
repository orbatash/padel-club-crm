import 'server-only'

import { IntegrationError, isIntegrationError } from '@/lib/integrations/core/errors'
import { logEvent } from '@/lib/integrations/core/log'
import type { LazuzToken } from './auth'

// The single owner of the LAZUZ token.
//
// - Lazy: a token is obtained or refreshed only when a request needs one, and
//   refreshed `refreshMarginMs` before it expires. No background timer.
// - Single-flight: concurrent callers share one in-flight login.
// - Guarded: after a rejected or rate-limited login, no new login is attempted
//   for `loginCooldownMs` (the old system's suspected-rate-limit guard).
//   Transient login failures back off briefly.
// - Resilient: if a refresh fails while the current token hasn't actually
//   expired yet, the current token is still used.
//
// The token never leaves this module except as the return value of
// getToken(), which only the LAZUZ HTTP client calls.

export type RefreshReason = 'cold_start' | 'near_expiry' | 'expired' | 'after_auth_error'

export type TokenManagerOptions = {
  login: () => Promise<LazuzToken>
  refreshMarginMs: number
  loginCooldownMs: number
  transientCooldownMs?: number
  now?: () => number
}

export type TokenStatus = {
  hasToken: boolean
  expiresInSec: number | null
  expirySource: LazuzToken['expirySource'] | null
  loginBlockedForSec: number
  loginsPerformed: number
}

export class LazuzTokenManager {
  private current: LazuzToken | null = null
  private inflight: Promise<LazuzToken> | null = null
  private blockedUntil = 0
  private blockedError: IntegrationError | null = null
  private logins = 0
  private readonly now: () => number

  constructor(private readonly options: TokenManagerOptions) {
    this.now = options.now ?? Date.now
  }

  /** Returns a valid token, logging in only when needed. */
  async getToken(hint?: RefreshReason): Promise<LazuzToken> {
    const now = this.now()
    const current = this.current

    if (current && now < current.expiresAt - this.options.refreshMarginMs) return current
    if (this.inflight) return this.inflight

    if (now < this.blockedUntil) {
      // Still inside the safety margin of a real token? Keep using it.
      if (current && now < current.expiresAt) return current
      throw new IntegrationError('login_cooldown', 'LAZUZ login is paused after a failed attempt', {
        provider: 'lazuz',
        operation: 'login',
        status: this.blockedError?.details.status,
        retryAfterSec: Math.ceil((this.blockedUntil - now) / 1000),
        hint: this.blockedError ? `last failure: ${this.blockedError.kind}` : undefined,
      })
    }

    const reason: RefreshReason = hint
      ? hint
      : !current
        ? 'cold_start'
      : now < current.expiresAt
        ? 'near_expiry'
        : 'expired'

    this.inflight = this.refresh(reason).finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  /**
   * Drop a token the provider rejected. Only clears it if it is still the
   * current one, so a late 401 can't discard a token that was just refreshed.
   */
  invalidate(token: string) {
    if (this.current?.token === token) {
      this.current = null
      logEvent('info', 'lazuz.token.invalidated', {})
    }
  }

  status(): TokenStatus {
    const now = this.now()
    return {
      hasToken: Boolean(this.current && now < this.current.expiresAt),
      expiresInSec: this.current ? Math.max(0, Math.round((this.current.expiresAt - now) / 1000)) : null,
      expirySource: this.current?.expirySource ?? null,
      loginBlockedForSec: Math.max(0, Math.ceil((this.blockedUntil - now) / 1000)),
      loginsPerformed: this.logins,
    }
  }

  private async refresh(reason: RefreshReason): Promise<LazuzToken> {
    const started = this.now()
    this.logins++
    try {
      const token = await this.options.login()
      this.current = token
      this.blockedUntil = 0
      this.blockedError = null
      logEvent('info', 'lazuz.token.refresh', {
        outcome: 'success',
        reason,
        durationMs: this.now() - started,
        expiresInSec: Math.round((token.expiresAt - this.now()) / 1000),
        expirySource: token.expirySource,
      })
      return token
    } catch (error) {
      const err = isIntegrationError(error)
        ? error
        : new IntegrationError('transient', 'LAZUZ login failed unexpectedly', {
            provider: 'lazuz',
            operation: 'login',
          })
      const cooldownMs =
        err.kind === 'auth' || err.kind === 'rate_limited'
          ? Math.max(this.options.loginCooldownMs, (err.details.retryAfterSec ?? 0) * 1000)
          : err.kind === 'transient' || err.kind === 'invalid_response'
            ? (this.options.transientCooldownMs ?? 30_000)
            : 0
      if (cooldownMs > 0) {
        this.blockedUntil = this.now() + cooldownMs
        this.blockedError = err
      }
      const stillValid = reason === 'near_expiry' && this.current && this.now() < this.current.expiresAt
      logEvent('warn', 'lazuz.token.refresh_failed', {
        reason,
        kind: err.kind,
        status: err.details.status,
        cooldownSec: Math.round(cooldownMs / 1000),
        usingStillValidToken: Boolean(stillValid),
      })
      // An early refresh failed but the current token hasn't expired: keep using it.
      if (stillValid && this.current) return this.current
      throw err
    }
  }

  /** Used by the client after a 401/403 on a token that was not just issued. */
  async forceRefresh(rejectedToken: string): Promise<LazuzToken> {
    this.invalidate(rejectedToken)
    return this.getToken('after_auth_error')
  }
}
