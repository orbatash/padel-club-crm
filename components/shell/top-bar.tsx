import * as I from '@/components/ui/icons'
import { Kbd } from '@/components/ui/text'
import type { Theme } from '@/lib/preferences'
import { StatusStrip } from './status-strip'
import s from './shell.module.css'

export function TopBar({
  title,
  theme,
  dockOpen,
  onSearch,
  onTheme,
  onDock,
}: {
  title: string
  theme: Theme
  dockOpen?: boolean
  onSearch: () => void
  onTheme: () => void
  onDock: () => void
}) {
  return (
    <header className={s.topbar}>
      <h1 className={s.pageTitle}>{title}</h1>

      <StatusStrip />

      <div className={s.topActions}>
        <button type="button" className={s.searchTrigger} onClick={onSearch}>
          <I.IconSearch size={15} />
          <span className={s.searchText}>חיפוש או פקודה</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onTheme}
          aria-label={theme === 'dark' ? 'מעבר לערכת יום' : 'מעבר לערכת לילה'}
        >
          {theme === 'dark' ? <I.IconSun /> : <I.IconMoon />}
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onDock}
          aria-label="עוזר AI (⌘J)"
          aria-pressed={dockOpen}
        >
          <I.IconDock />
        </button>
      </div>
    </header>
  )
}
