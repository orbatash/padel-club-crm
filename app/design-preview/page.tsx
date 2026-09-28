import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { IBM_Plex_Mono, IBM_Plex_Sans_Hebrew } from 'next/font/google'
import { requireOwner } from '@/lib/auth'
import { DesignPreview } from './preview'
import { THEME_COOKIE } from './theme'

// Visual preview of the "Night Session" design system (DESIGN_SYSTEM.md).
// Sample data only — nothing here reads from Supabase.

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
  title: 'Design Preview | Padel Club CRM',
  robots: { index: false, follow: false },
}

export default async function DesignPreviewPage() {
  await requireOwner()
  const theme = (await cookies()).get(THEME_COOKIE)?.value === 'light' ? 'light' : 'dark'

  return (
    <DesignPreview
      fontClassName={`${plexHebrew.variable} ${plexMono.variable}`}
      initialTheme={theme}
    />
  )
}
