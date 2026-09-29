import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit/integration tests. Fully isolated: no network (fetch is stubbed per
// test), no real Supabase (PGlite runs the committed migrations in memory),
// no real credentials.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      'server-only': path.resolve(__dirname, 'tests/setup/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup/no-network.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test file runs in its own isolated module context; the fake fetch
    // and console spies are installed per file/test by the helpers.
  },
})
