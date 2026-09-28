import 'server-only'

import { IntegrationError } from '@/lib/integrations/core/errors'

/** fetch with a hard timeout; network failures become 'transient' IntegrationErrors. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  operation: string
): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new IntegrationError('transient', timedOut ? 'LAZUZ request timed out' : 'LAZUZ network error', {
      provider: 'lazuz',
      operation,
    })
  }
}
