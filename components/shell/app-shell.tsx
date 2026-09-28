'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import * as I from '@/components/ui/icons'
import { DOCK_COOKIE, THEME_COLORS, THEME_COOKIE, preferenceCookie, type Theme } from '@/lib/preferences'
import { navItems, pageTitle } from './nav'
import { Rail } from './rail'
import { TopBar } from './top-bar'
import { AiDock } from './ai-dock'
import { MobileBar } from './mobile-bar'
import { CommandPalette, type Command } from './command-palette'
import s from './shell.module.css'

const WIDE_QUERY = '(min-width: 1280px)'

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'))
}

export function AppShell({
  children,
  ownerEmail,
  initialTheme,
  initialDock,
}: {
  children: ReactNode
  ownerEmail: string
  initialTheme: Theme
  /** null = automatic (open on wide screens, closed on narrow ones). */
  initialDock: boolean | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const title = pageTitle(pathname)

  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [dockPref, setDockPref] = useState<boolean | null>(initialDock)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [, startTransition] = useTransition()
  const goPending = useRef(0)

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.cookie = preferenceCookie(THEME_COOKIE, next)
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', THEME_COLORS[next]))
    setTheme(next)
  }, [theme])

  const setDock = useCallback((open: boolean) => {
    document.cookie = preferenceCookie(DOCK_COOKIE, open ? 'open' : 'closed')
    setDockPref(open)
  }, [])

  const toggleDock = useCallback(() => {
    // Resolve "automatic" against the current screen width at click time.
    const effective = dockPref ?? window.matchMedia(WIDE_QUERY).matches
    setDock(!effective)
  }, [dockPref, setDock])

  const signOut = useCallback(() => {
    startTransition(async () => {
      await logout()
    })
  }, [])

  const commands = useMemo<Command[]>(
    () => [
      ...navItems
        .filter((item) => item.href)
        .map((item) => ({
          id: `nav:${item.href}`,
          group: 'ניווט',
          label: item.label,
          icon: item.icon,
          shortcut: item.goKey ? `G ${item.goKey.toUpperCase()}` : undefined,
          run: () => router.push(item.href!),
        })),
      {
        id: 'customers:new',
        group: 'פעולות',
        label: 'לקוח חדש',
        icon: I.IconUsers,
        keywords: 'הוספת לקוח יצירה new customer',
        run: () => router.push('/customers/new'),
      },
      {
        id: 'ui:theme',
        group: 'תצוגה',
        label: theme === 'dark' ? 'מעבר לערכת יום' : 'מעבר לערכת לילה',
        icon: theme === 'dark' ? I.IconSun : I.IconMoon,
        run: toggleTheme,
      },
      {
        id: 'ui:dock',
        group: 'תצוגה',
        label: 'פתח או סגור את העוזר',
        icon: I.IconDock,
        shortcut: '⌘J',
        run: toggleDock,
      },
      {
        id: 'account:logout',
        group: 'חשבון',
        label: 'התנתקות',
        icon: I.IconLogout,
        run: signOut,
      },
    ],
    [router, theme, toggleTheme, toggleDock, signOut]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && key === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (mod && key === 'j') {
        e.preventDefault()
        toggleDock()
        return
      }
      if (mod || e.altKey || isTyping(e.target)) return

      if (key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      // "G then <key>" navigation, e.g. G T → Today.
      if (key === 'g') {
        goPending.current = Date.now()
        return
      }
      if (Date.now() - goPending.current < 900) {
        goPending.current = 0
        const target = navItems.find((item) => item.href && item.goKey === key)
        if (target?.href) {
          e.preventDefault()
          router.push(target.href)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, toggleDock])

  const dockState = dockPref === null ? 'auto' : dockPref ? 'open' : 'closed'

  return (
    <div className={s.shell} data-dock={dockState}>
      <a href="#main" className={s.skipLink}>
        דלג לתוכן
      </a>

      <Rail pathname={pathname} ownerEmail={ownerEmail} />

      <TopBar
        title={title}
        theme={theme}
        dockOpen={dockPref ?? undefined}
        onSearch={() => setPaletteOpen(true)}
        onTheme={toggleTheme}
        onDock={toggleDock}
      />

      <main id="main" className={s.main} tabIndex={-1}>
        <div className={s.mainInner}>{children}</div>
      </main>

      <AiDock contextLabel={title} onToggle={toggleDock} />

      <MobileBar pathname={pathname} onSearch={() => setPaletteOpen(true)} onDock={toggleDock} />

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
          onAskAi={() => setDock(true)}
        />
      )}
    </div>
  )
}
