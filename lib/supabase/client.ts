import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

// Browser client — uses only the public anon key; RLS applies.
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
}
