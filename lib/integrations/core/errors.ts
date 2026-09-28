// Integration errors. They carry only safe, structured fields — never a token,
// credentials, request bodies or raw responses — so they can be logged, shown
// in the UI, or (later) returned to an AI tool without leaking anything.

export type IntegrationErrorKind =
  | 'auth' //             credentials or token rejected
  | 'forbidden' //        authenticated but not allowed
  | 'rate_limited' //     provider asked us to slow down
  | 'login_cooldown' //   we are deliberately not logging in right now
  | 'transient' //        timeout, network, 5xx — may succeed later
  | 'invalid_response' // response didn't have the expected shape
  | 'not_configured' //   missing configuration
  | 'bad_request' //      our request was rejected (4xx other than auth)

export type IntegrationErrorDetails = {
  provider: string
  operation: string
  status?: number
  attempts?: number
  retryAfterSec?: number
  /** For writes: the provider may have applied the change despite the error. */
  mayHaveSucceeded?: boolean
  /** Safe diagnostics only (e.g. top-level key names), never values. */
  hint?: string
}

export class IntegrationError extends Error {
  readonly kind: IntegrationErrorKind
  readonly details: IntegrationErrorDetails

  constructor(kind: IntegrationErrorKind, message: string, details: IntegrationErrorDetails) {
    super(message)
    this.name = 'IntegrationError'
    this.kind = kind
    this.details = details
  }

  get retryable() {
    return this.kind === 'transient' || this.kind === 'rate_limited'
  }

  toSafeJSON() {
    return { kind: this.kind, message: this.message, ...this.details }
  }
}

export function isIntegrationError(error: unknown): error is IntegrationError {
  return error instanceof IntegrationError
}
