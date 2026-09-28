import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isOwnerEmail } from '@/lib/owner'

export const DEFAULT_AUTHED_PATH = '/'

// Authoritative server-side check for human access. Call at the top of every
// protected layout, page, Server Action and Route Handler — proxy.ts alone is
// not enough. getUser() verifies the session with the Supabase Auth server.
//
// This is for the human Owner only. AI agents must never call it or reuse the
// Owner's session; they get their own permission layer.
export const requireOwner = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!isOwnerEmail(user.email)) {
    // Server Components can't clear cookies; proxy.ts signs this session out
    // on the next request.
    redirect('/login?error=unauthorized')
  }

  return { user, supabase }
})

// Only allow same-origin relative paths as post-login redirect targets.
export function safeRedirectPath(value: unknown, fallback = DEFAULT_AUTHED_PATH) {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback
  }
  return value
}
