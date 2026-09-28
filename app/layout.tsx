import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { IBM_Plex_Mono, IBM_Plex_Sans_Hebrew } from 'next/font/google'
import { THEME_COLORS, THEME_COOKIE, parseTheme } from '@/lib/preferences'
import './globals.css'

// Hebrew UI + its own Latin glyphs; Plex Mono for numbers (DESIGN_SYSTEM.md §2).
const plexHebrew = IBM_Plex_Sans_Hebrew({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-hebrew',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Padel Club CRM',
    template: '%s | Padel Club CRM',
  },
  applicationName: 'Padel Club CRM',
  // Private system — keep it out of search engines.
  robots: { index: false, follow: false },
  // Stop iOS from auto-linking numbers; phones and prices are styled explicitly.
  formatDetection: { telephone: false, email: false, address: false },
}

// Per-request so the browser/OS chrome matches the Owner's chosen theme.
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return {
    width: 'device-width',
    initialScale: 1,
    // Lets the shell draw under notches / home indicator; safe areas are
    // handled with env(safe-area-inset-*) in globals.css.
    viewportFit: 'cover',
    themeColor: THEME_COLORS[theme],
    colorScheme: theme,
  }
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html
      lang="he"
      dir="rtl"
      data-theme={theme}
      className={`${plexHebrew.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
