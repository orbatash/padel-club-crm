import Link from 'next/link'
import { logout } from '@/app/actions/auth'
import { BrandMark } from '@/components/ui/brand-mark'
import { Kbd, Ltr } from '@/components/ui/text'
import { IconLogout } from '@/components/ui/icons'
import { isActive, navGroups } from './nav'
import s from './shell.module.css'

export function Rail({ pathname, ownerEmail }: { pathname: string; ownerEmail: string }) {
  return (
    <nav className={s.rail} aria-label="ניווט ראשי">
      <Link href="/" className={s.brand} aria-label="Padel Club CRM — היום">
        <BrandMark />
      </Link>

      {navGroups.map((group) => (
        <div key={group.label} className={s.railGroup}>
          <span className={s.railLabel}>{group.label}</span>
          {group.items.map((item) => {
            const Icon = item.icon
            const active = isActive(item, pathname)

            if (!item.href) {
              return (
                <span
                  key={item.label}
                  className={`${s.railBtn} ${s.railBtnDisabled}`}
                  role="link"
                  aria-disabled="true"
                  aria-label={`${item.label} (בקרוב)`}
                  tabIndex={0}
                >
                  <Icon size={18} />
                  <span className={s.tip} role="tooltip">
                    {item.label}
                    <span className={s.tipMuted}>בקרוב</span>
                  </span>
                </span>
              )
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`${s.railBtn} ${active ? s.railBtnActive : ''}`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} />
                <span className={s.tip} role="tooltip">
                  {item.label}
                  {item.goKey && <Kbd>{`G ${item.goKey.toUpperCase()}`}</Kbd>}
                </span>
              </Link>
            )
          })}
        </div>
      ))}

      <div className={s.railFoot}>
        <span className={`${s.railBtn}`} tabIndex={0} aria-label={`מחובר כ-${ownerEmail}`}>
          <span className={s.avatar}>{ownerEmail.charAt(0) || '·'}</span>
          <span className={s.tip} role="tooltip">
            בעלים · <Ltr>{ownerEmail}</Ltr>
          </span>
        </span>
        {/* A plain form so sign-out works even before JS loads. */}
        <form action={logout}>
          <button type="submit" className={s.railBtn} aria-label="התנתקות">
            <IconLogout size={18} className="mirror" />
            <span className={s.tip} role="tooltip">
              התנתקות
            </span>
          </button>
        </form>
      </div>
    </nav>
  )
}
