import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'
import { isOwnerEmail } from '@/lib/owner'

const PUBLIC_PATHS = ['/login']
const DEFAULT_AUTHED_PATH = '/'

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Refreshes the Supabase session cookie, signs out any account that is not the
// Owner, and redirects unauthenticated users to /login.
// This is an optimistic check only — pages must still verify via requireOwner().
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let authHeaders: Record<string, string> = {}

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
        authHeaders = headers
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Do not run code between createServerClient and getClaims():
  // getClaims() validates the JWT and triggers the token refresh.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const { pathname, search } = request.nextUrl

  // Authenticated, but not the Owner: revoke the session and clear its cookies.
  if (claims?.sub && !isOwnerEmail(typeof claims.email === 'string' ? claims.email : null)) {
    await supabase.auth.signOut()
    if (pathname === '/login') return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?error=unauthorized'
    return redirectWithCookies(url, response, authHeaders)
  }

  const isAuthenticated = Boolean(claims?.sub)

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return redirectWithCookies(url, response, authHeaders)
  }

  if (isAuthenticated && isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = DEFAULT_AUTHED_PATH
    url.search = ''
    return redirectWithCookies(url, response, authHeaders)
  }

  return response
}

// Keep any refreshed auth cookies/headers when redirecting.
function redirectWithCookies(
  url: URL,
  source: NextResponse,
  authHeaders: Record<string, string>
) {
  const redirect = NextResponse.redirect(url)
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  Object.entries(authHeaders).forEach(([key, value]) => redirect.headers.set(key, value))
  return redirect
}
