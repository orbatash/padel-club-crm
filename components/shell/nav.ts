import * as I from '@/components/ui/icons'

// Single source of navigation for the rail, the mobile bar and the command
// palette. Items without `href` are planned areas, shown disabled until built.

export type NavItem = {
  label: string
  icon: (p: { size?: number; className?: string }) => React.JSX.Element
  href?: string
  /** Two-key "go to" shortcut, e.g. G then T. */
  goKey?: string
  mobile?: boolean
  /** Shorter label for the phone tab bar. */
  mobileLabel?: string
}

export type NavGroup = { label: string; items: NavItem[] }

export const navGroups: NavGroup[] = [
  {
    label: 'תפעול',
    items: [
      { label: 'היום', icon: I.IconToday, href: '/', goKey: 't', mobile: true },
      { label: 'מגרשים והזמנות', icon: I.IconCourt, href: '/courts', goKey: 'c', mobile: true, mobileLabel: 'מגרשים' },
      { label: 'תיבת הודעות', icon: I.IconInbox },
      { label: 'לקוחות', icon: I.IconUsers, href: '/customers', goKey: 'u', mobile: true },
    ],
  },
  {
    label: 'צמיחה',
    items: [
      { label: 'לידים', icon: I.IconTarget },
      { label: 'קמפיינים', icon: I.IconMegaphone },
      { label: 'תוכן', icon: I.IconPen },
      { label: 'חנות', icon: I.IconBag },
    ],
  },
  {
    label: 'תובנות',
    items: [
      { label: 'תובנות', icon: I.IconInsights },
      { label: 'סוכני AI', icon: I.IconAgents },
      { label: 'דוחות', icon: I.IconReports },
    ],
  },
]

export const navItems = navGroups.flatMap((g) => g.items)

export function isActive(item: NavItem, pathname: string) {
  if (!item.href) return false
  return item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export function pageTitle(pathname: string) {
  return navItems.find((item) => isActive(item, pathname))?.label ?? 'Padel Club CRM'
}
