// UI preferences stored in cookies so the server renders the right state on
// first paint (no theme flash, no dock jump) — important for an installed PWA.
// Shared by server components (read) and client components (write).

export type Theme = 'dark' | 'light'

export const THEME_COOKIE = 'theme'
export const DOCK_COOKIE = 'dock'

/** Browser/OS chrome color per theme (<meta name="theme-color">). Matches --canvas. */
export const THEME_COLORS: Record<Theme, string> = {
  dark: '#0a0c0b',
  light: '#f3f3ef',
}

export function parseTheme(value: string | undefined): Theme {
  return value === 'light' ? 'light' : 'dark'
}

/** null = automatic: open on wide screens, closed on narrow ones. */
export function parseDock(value: string | undefined): boolean | null {
  if (value === 'open') return true
  if (value === 'closed') return false
  return null
}

export function preferenceCookie(name: string, value: string) {
  return `${name}=${value}; path=/; max-age=31536000; samesite=lax`
}
