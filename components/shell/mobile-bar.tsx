import Link from 'next/link'
import { IconSearch, IconSignal } from '@/components/ui/icons'
import { isActive, navItems } from './nav'
import s from './shell.module.css'

// Bottom tab bar for phones and the installed PWA (< 760px). Sits above the
// home indicator via --safe-bottom.

export function MobileBar({
  pathname,
  onSearch,
  onDock,
}: {
  pathname: string
  onSearch: () => void
  onDock: () => void
}) {
  const items = navItems.filter((item) => item.mobile && item.href)

  return (
    <nav className={s.mobileBar} aria-label="ניווט">
      {items.map((item) => {
        const Icon = item.icon
        const active = isActive(item, pathname)
        return (
          <Link
            key={item.href}
            href={item.href!}
            className={`${s.mobileItem} ${active ? s.mobileItemActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={20} />
            {item.label}
          </Link>
        )
      })}
      <button type="button" className={s.mobileItem} onClick={onSearch}>
        <IconSearch size={20} />
        חיפוש
      </button>
      <button type="button" className={s.mobileItem} onClick={onDock}>
        <IconSignal size={20} className={s.aiGlyph} />
        עוזר
      </button>
    </nav>
  )
}
