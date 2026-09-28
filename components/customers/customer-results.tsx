import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Chip, EmptyState, ui } from '@/components/ui/primitives'
import { IconForward, IconSearch, IconUsers } from '@/components/ui/icons'
import { Ltr, Num } from '@/components/ui/text'
import { listCustomers } from '@/lib/customers/data'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  UNNAMED_CUSTOMER,
  formatDate,
  formatPlayerLevel,
} from '@/lib/customers/labels'
import { formatPhone } from '@/lib/customers/phone'
import { hasActiveFilters, listParamsToQuery } from '@/lib/customers/search-params'
import type { CustomerListParams, CustomerSort } from '@/lib/customers/types'
import s from './customers.module.css'

/** Server component: fetches one page of customers and renders table + mobile list. */
export async function CustomerResults({ params }: { params: CustomerListParams }) {
  const result = await listCustomers(params)

  if (result.outOfRange) redirect(`/customers${listParamsToQuery({ ...params, page: 1 })}`)

  if (result.items.length === 0) {
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          icon={<IconSearch size={18} />}
          title="לא נמצאו לקוחות"
          text="אין לקוחות שמתאימים לחיפוש או לסינון. נסה מילה אחרת או הסר חלק מהמסננים."
          action={
            <Link
              href={`/customers${listParamsToQuery({ archived: params.archived })}`}
              className={`${ui.btn} ${ui.btn_secondary} ${ui.btn_sm}`}
              replace
            >
              ניקוי מסננים
            </Link>
          }
        />
      )
    }
    if (params.archived) {
      return (
        <EmptyState
          icon={<IconUsers size={18} />}
          title="הארכיון ריק"
          text="לקוחות שיועברו לארכיון יופיעו כאן. שום לקוח לא נמחק מהמערכת."
        />
      )
    }
    return (
      <EmptyState
        icon={<IconUsers size={18} />}
        title="עדיין אין לקוחות"
        text="הוסף את הלקוח הראשון. בהמשך לקוחות יתווספו גם אוטומטית מהזמנות, מהחנות ומשיחות."
        action={
          <Link href="/customers/new" className={`${ui.btn} ${ui.btn_primary} ${ui.btn_sm}`}>
            לקוח חדש
          </Link>
        }
      />
    )
  }

  const sortHref = (sort: CustomerSort) => {
    const dir = params.sort === sort ? (params.dir === 'asc' ? 'desc' : 'asc') : sort === 'name' ? 'asc' : 'desc'
    return `/customers${listParamsToQuery({ ...params, sort, dir, page: 1 })}`
  }
  const sortHeader = (sort: CustomerSort, label: string) => {
    const active = params.sort === sort
    return (
      <Link
        href={sortHref(sort)}
        className={`${s.sortLink} ${active ? s.sortLinkActive : ''}`}
        replace
        scroll={false}
        aria-label={`מיון לפי ${label}`}
      >
        {label}
        {active && <span className={s.sortArrow}>{params.dir === 'asc' ? '↑' : '↓'}</span>}
      </Link>
    )
  }

  return (
    <>
      <div className={`${ui.tableWrap} ${s.desktopTable}`}>
        <table className={s.table}>
          <thead>
            <tr>
              <th aria-sort={params.sort === 'name' ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {sortHeader('name', 'שם')}
              </th>
              <th>טלפון</th>
              <th>אימייל</th>
              <th>סטטוס</th>
              <th>מקור</th>
              <th className={s.alignEnd}>{sortHeader('level', 'רמה')}</th>
              <th className={s.alignEnd}>{sortHeader('updated', 'עודכן')}</th>
              <th className={s.alignEnd}>{sortHeader('created', 'נוצר')}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/customers/${c.id}`} className={s.rowLink}>
                    {c.fullName ?? <span className={s.unnamed}>{UNNAMED_CUSTOMER}</span>}
                  </Link>
                </td>
                <td>{c.phone ? <Num>{formatPhone(c.phone)}</Num> : <span className={s.muted}>—</span>}</td>
                <td>
                  {c.email ? (
                    <span className={s.cellEmail}>
                      <Ltr>{c.email}</Ltr>
                    </span>
                  ) : (
                    <span className={s.muted}>—</span>
                  )}
                </td>
                <td>
                  <Chip tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</Chip>
                </td>
                <td>{c.source ? SOURCE_LABELS[c.source] : <span className={s.muted}>—</span>}</td>
                <td className={s.alignEnd}>
                  {c.playerLevel != null ? <Num>{formatPlayerLevel(c.playerLevel)}</Num> : <span className={s.muted}>—</span>}
                </td>
                <td className={`${s.alignEnd} ${s.muted}`}>
                  <Num>{formatDate(c.updatedAt)}</Num>
                </td>
                <td className={`${s.alignEnd} ${s.muted}`}>
                  <Num>{formatDate(c.createdAt)}</Num>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.mobileList}>
        {result.items.map((c) => (
          <Link key={c.id} href={`/customers/${c.id}`} className={s.mobileRow}>
            <span className={s.mobileTop}>
              <span className={`${s.mobileName} ${c.fullName ? '' : s.unnamed}`}>
                {c.fullName ?? UNNAMED_CUSTOMER}
              </span>
              <Chip tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</Chip>
            </span>
            <span className={`${s.levelBadge} ${c.playerLevel == null ? s.levelBadgeEmpty : ''}`}>
              {c.playerLevel != null ? <Num>{formatPlayerLevel(c.playerLevel)}</Num> : '—'}
            </span>
            <span className={s.mobileSub}>
              {c.phone ? <Num>{formatPhone(c.phone)}</Num> : c.email ? <Ltr>{c.email}</Ltr> : 'אין פרטי קשר'}
              {c.source && <span>· {SOURCE_LABELS[c.source]}</span>}
            </span>
          </Link>
        ))}
      </div>

      <Pagination params={params} page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} />
    </>
  )
}

function Pagination({
  params,
  page,
  pageCount,
  total,
  pageSize,
}: {
  params: CustomerListParams
  page: number
  pageCount: number
  total: number
  pageSize: number
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const href = (p: number) => `/customers${listParamsToQuery({ ...params, page: p })}`

  return (
    <nav className={s.pagination} aria-label="עמודים">
      <span>
        <Num>{`${from}–${to}`}</Num> מתוך <Num>{total}</Num>
      </span>
      {pageCount > 1 && (
        <div className={s.pageLinks}>
          <Link
            href={href(page - 1)}
            className={`${s.pageLink} ${page <= 1 ? s.pageLinkDisabled : ''}`}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            scroll={false}
          >
            <IconForward size={13} />
            הקודם
          </Link>
          <span className={s.pageStatus}>
            <Num>{page}</Num> / <Num>{pageCount}</Num>
          </span>
          <Link
            href={href(page + 1)}
            className={`${s.pageLink} ${page >= pageCount ? s.pageLinkDisabled : ''}`}
            aria-disabled={page >= pageCount}
            tabIndex={page >= pageCount ? -1 : undefined}
            scroll={false}
          >
            הבא
            <IconForward size={13} className="mirror" />
          </Link>
        </div>
      )}
    </nav>
  )
}

export function CustomerResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען לקוחות">
      {[62, 48, 70, 55, 66, 44].map((w, i) => (
        <div key={i} className={s.skelRow}>
          <span className={s.skel} style={{ width: `${w * 2}px` }} />
          <span className={s.skel} style={{ width: 96 }} />
          <span className={s.skel} style={{ width: 140 }} />
          <span className={s.skel} style={{ width: 44, marginInlineStart: 'auto' }} />
        </div>
      ))}
    </div>
  )
}

