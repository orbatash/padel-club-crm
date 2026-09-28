import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { publicEnv } from '@/lib/env'
import { serverEnv } from '@/lib/env.server'

// Service-role client: BYPASSES Row Level Security.
// Only for trusted backend work (webhooks, sync jobs, cron) — never for
// requests made on behalf of a logged-in staff member.
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
