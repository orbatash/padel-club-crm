import 'server-only'

// Structured, redacted logging for integrations: one JSON object per line.
// Callers should only pass safe fields; redaction is a second line of defense
// for anything that slips through (tokens, credentials, personal data).

type Level = 'debug' | 'info' | 'warn' | 'error'

const SENSITIVE_KEY =
  /(token|password|passwd|secret|authorization|cookie|credential|phone|email|customer_name|^name$|^username$)/i
const BEARER = /bearer\s+[a-z0-9._~+/=-]+/gi
const JWT_LIKE = /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]'
  if (typeof value === 'string') {
    return value.replace(BEARER, 'Bearer [redacted]').replace(JWT_LIKE, '[redacted-jwt]')
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(fields) as object) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
