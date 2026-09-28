import { vi } from 'vitest'

// Safety net: tests must never reach the network (LAZUZ, Supabase, anything).
// Tests that need HTTP install the fake LAZUZ server (tests/helpers/fake-lazuz.ts),
// which replaces this stub.
vi.stubGlobal('fetch', async (input: unknown) => {
  throw new Error(`Network access is disabled in tests (attempted: ${String(input).split('?')[0]})`)
})
