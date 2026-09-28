import 'server-only'

import { requiredEnv } from './env'

// Server-only configuration. Importing this module from client code fails the build.
// Getters validate lazily, so a route only fails on the variables it actually uses.
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return requiredEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
  },
  /** The single human account allowed into the CRM. */
  get ownerEmail() {
    return requiredEnv('OWNER_EMAIL', process.env.OWNER_EMAIL).trim().toLowerCase()
  },
}
