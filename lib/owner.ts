import 'server-only'

import { serverEnv } from '@/lib/env.server'

// Human access model: exactly one human user, the Owner, identified by
// OWNER_EMAIL. Additional humans can be added later by replacing this check
// with a lookup — every caller goes through isOwnerEmail()/requireOwner().
//
// AI agents are NOT human users. They never sign in through Supabase Auth and
// never pass this check; they act through server-side tools with their own
// explicit permissions.
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase() === serverEnv.ownerEmail
}
