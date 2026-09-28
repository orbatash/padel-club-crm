import { cookies } from 'next/headers'
import { requireOwner } from '@/lib/auth'
import { DOCK_COOKIE, THEME_COOKIE, parseDock, parseTheme } from '@/lib/preferences'
import { AppShell } from '@/components/shell/app-shell'

// Every CRM screen lives in this route group and renders inside the shell.
// Note: layouts don't re-run on every client navigation, so each page must
// still call requireOwner() itself (it is cached per request).
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { user } = await requireOwner()
  const cookieStore = await cookies()

  return (
    <AppShell
      ownerEmail={user.email ?? ''}
      initialTheme={parseTheme(cookieStore.get(THEME_COOKIE)?.value)}
      initialDock={parseDock(cookieStore.get(DOCK_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  )
}
