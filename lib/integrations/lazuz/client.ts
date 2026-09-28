import 'server-only'

import { IntegrationError, isIntegrationError } from '@/lib/integrations/core/errors'
import { logEvent } from '@/lib/integrations/core/log'
import { loginToLazuz } from './auth'
import { getLazuzConfig, type LazuzConfig } from './config'
import { fetchWithTimeout } from './http'
import { LazuzTokenManager } from './token-manager'

// Authenticated LAZUZ HTTP client (server-only).
//
// Every request:
//   1. gets a token from the token manager (cached, refreshed lazily)
//   2. sends it as `Authorization: Bearer <token>`
//   3. on 401/403: invalidates that token, logs in once, retries once —
//      unless the rejected token was issued moments ago, in which case a new
//      login would not help and would only spend a (rate-limited) login
//   4. maps failures to structured IntegrationErrors
// GET requests also retry transient failures (timeout, 5xx) up to twice.
// Writes are never retried on transient failures: the change may have applied.

export type LazuzRequest = {
  /** Stable operation name for logs and errors, e.g. 'listReservations'. */
  operation: string
  method: 'GET' | 'POST' | 'PUT'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
}

/** A token this fresh that is rejected indicates a permission problem, not expiry. */
const FRESH_TOKEN_MS = 60_000
const GET_RETRY_DELAYS_MS = [500, 1500]

type ClientDeps = {
  config: LazuzConfig
  tokens: LazuzTokenManager
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export class LazuzClient {
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly deps: ClientDeps) {
    this.now = deps.now ?? Date.now
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Safe token diagnostics — never the token itself. */
  tokenStatus() {
    return this.deps.tokens.status()
  }

  /** Obtains (or reuses) a token and reports its status — for the health check. */
  async checkAuth() {
    await this.deps.tokens.getToken()
    return this.tokenStatus()
  }

  /** Performs the request and returns the parsed JSON body (unvalidated). */
  async request(req: LazuzRequest): Promise<unknown> {
    const retries = req.method === 'GET' ? GET_RETRY_DELAYS_MS : []
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.requestWithAuthRetry(req)
      } catch (error) {
        const transient = isIntegrationError(error) && error.kind === 'transient'
        if (!transient || attempt >= retries.length) throw error
        await this.sleep(retries[attempt])
      }
    }
  }

  private async requestWithAuthRetry(req: LazuzRequest): Promise<unknown> {
    const token = await this.deps.tokens.getToken()
    const first = await this.send(req, token.token, 1)
    if (first.status !== 401 && first.status !== 403) return this.handle(req, first, 1)

    const tokenAgeMs = this.now() - token.obtainedAt
    if (tokenAgeMs < FRESH_TOKEN_MS) {
      // A token we just received was rejected: logging in again right away
      // won't fix it and would spend a (possibly rate-limited) login. Drop the
      // token so the next request starts clean, and report the error.
      this.deps.tokens.invalidate(token.token)
      return this.handle(req, first, 1)
    }

    const retryToken = await this.deps.tokens.forceRefresh(token.token)
    const second = await this.send(req, retryToken.token, 2, true)
    return this.handle(req, second, 2)
  }

  private async send(req: LazuzRequest, token: string, attempt: number, afterAuthRetry = false) {
    const url = new URL(`${this.deps.config.baseUrl}${req.path}`)
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const started = this.now()
    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: req.method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      },
      this.deps.config.requestTimeoutMs,
      req.operation
    )

    // Only the operation name and path — never the URL query, headers or body.
    logEvent('info', 'lazuz.request', {
      operation: req.operation,
      method: req.method,
      path: req.path,
      status: response.status,
      durationMs: this.now() - started,
      attempt,
      afterAuthRetry,
    })
    return response
  }

  private async handle(req: LazuzRequest, response: Response, attempts: number): Promise<unknown> {
    const details = { provider: 'lazuz', operation: req.operation, status: response.status, attempts }
    const write = req.method !== 'GET'

    if (response.ok) {
      if (response.status === 204) return null
      try {
        return await response.json()
      } catch {
        throw new IntegrationError('invalid_response', 'LAZUZ response is not JSON', details)
      }
    }

    let error: IntegrationError
    if (response.status === 401) {
      error = new IntegrationError('auth', 'LAZUZ rejected the token', details)
    } else if (response.status === 403) {
      error = new IntegrationError('forbidden', 'LAZUZ denied access', details)
    } else if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'))
      error = new IntegrationError('rate_limited', 'LAZUZ rate limit', {
        ...details,
        retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
      })
    } else if (response.status >= 500) {
      error = new IntegrationError('transient', 'LAZUZ server error', {
        ...details,
        mayHaveSucceeded: write ? true : undefined,
      })
    } else {
      error = new IntegrationError('bad_request', 'LAZUZ rejected the request', details)
    }

    logEvent('warn', 'lazuz.request_failed', {
      operation: req.operation,
      kind: error.kind,
      status: response.status,
      attempts,
      mayHaveSucceeded: error.details.mayHaveSucceeded,
    })
    throw error
  }
}

// One client (and token manager) per server process. Kept on globalThis so
// dev-server hot reloads don't discard the cached token and trigger logins.
const globalForLazuz = globalThis as unknown as { __lazuzClient?: LazuzClient }

export function getLazuzClient(): LazuzClient {
  if (!globalForLazuz.__lazuzClient) {
    const config = getLazuzConfig()
    const tokens = new LazuzTokenManager({
      login: () => loginToLazuz(config),
      refreshMarginMs: config.refreshMarginMs,
      loginCooldownMs: config.loginCooldownMs,
    })
    globalForLazuz.__lazuzClient = new LazuzClient({ config, tokens })
  }
  return globalForLazuz.__lazuzClient
}

/** Safe token diagnostics (no token value) for the owner health check. */
export function getLazuzTokenStatus() {
  return globalForLazuz.__lazuzClient?.tokenStatus() ?? null
}
