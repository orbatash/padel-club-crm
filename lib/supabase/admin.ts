import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'
import type { Database } from '@/lib/database.types'

// Service-role client: BYPASSES Row Level Security.
// Only for trusted backend work (webhooks, sync jobs, cron) — never for
// requests made on behalf of the logged-in Owner.
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
