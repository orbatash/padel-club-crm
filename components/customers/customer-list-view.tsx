'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, useTransition, type ReactNode } from 'react'
import { Button, ui } from '@/components/ui/primitives'
import { IconSearch, IconX } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import { SOURCE_LABELS, STATUS_LABELS, formatPlayerLevel } from '@/lib/customers/labels'
import { hasActiveFilters, listParamsToQuery } from '@/lib/customers/search-params'
import {
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  PLAYER_LEVELS,
  type CustomerListParams,
  type CustomerSort,
  type SortDirection,
} from '@/lib/customers/types'
import s from './customers.module.css'

const SORT_OPTIONS: { value: `${CustomerSort}:${SortDirection}`; label: string }[] = [
  { value: 'created:desc', label: 'נוצרו לאחרונה' },
  { value: 'created:asc', label: 'נוצרו ראשונים' },
  { value: 'updated:desc', label: 'עודכנו לאחרונה' },
  { value: 'name:asc', label: 'שם (א–ת)' },
  { value: 'name:desc', label: 'שם (ת–א)' },
  { value: 'level:desc', label: 'רמה (גבוהה ← נמוכה)' },
  { value: 'level:asc', label: 'רמה (נמוכה ← גבוהה)' },
]

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconFilter({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  )
}

/**
 * Toolbar + results frame for the customer list. All list state is in the URL;
 * this component only rewrites the query string and shows a pending state
 * while the server renders the new results.
 */
export function CustomerListView({
  params,
  children,
}: {
  params: CustomerListParams
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(params.q)
  const [sheetOpen, setSheetOpen] = useState(false)
  const lastSubmitted = useRef(params.q)

  const navigate = (next: Partial<CustomerListParams>) => {
    const merged: CustomerListParams = { ...params, page: 1, ...next }
    startTransition(() => {
      router.replace(`${pathname}${listParamsToQuery(merged)}`, { scroll: false })
    })
  }

  const submitSearch = useEffectEvent((q: string) => navigate({ q }))

  // Debounced search: update the URL 300ms after typing stops.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === lastSubmitted.current) return
    const timer = window.setTimeout(() => {
      lastSubmitted.current = trimmed
      submitSearch(trimmed)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const activeFilterCount = [params.status, params.source, params.level].filter((v) => v != null).length
  const sortValue = `${params.sort}:${params.dir}`

  const filterControls = (
    <>
      <select
        className={`${ui.select} ${params.status ? ui.selectActive : ''}`}
        value={params.status ?? ''}
        onChange={(e) => navigate({ status: (e.target.value || null) as CustomerListParams['status'] })}
        aria-label="סטטוס"
      >
        <option value="">כל הסטטוסים</option>
        {CUSTOMER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <select
        className={`${ui.select} ${params.source ? ui.selectActive : ''}`}
        value={params.source ?? ''}
        onChange={(e) => navigate({ source: (e.target.value || null) as CustomerListParams['source'] })}
        aria-label="מקור"
      >
        <option value="">כל המקורות</option>
        {CUSTOMER_SOURCES.map((source) => (
          <option key={source} value={source}>
            {SOURCE_LABELS[source]}
          </option>
        ))}
      </select>
      <select
        className={`${ui.select} ${params.level != null ? ui.selectActive : ''}`}
        value={params.level == null ? '' : String(params.level)}
        onChange={(e) => {
          const v = e.target.value
          navigate({
            level: v === '' ? null : v === 'unknown' ? 'unknown' : (Number(v) as CustomerListParams['level']),
          })
        }}
        aria-label="רמת משחק"
      >
        <option value="">כל הרמות</option>
        {PLAYER_LEVELS.map((level) => (
          <option key={level} value={String(level)}>
            {`רמה ${formatPlayerLevel(level)}`}
          </option>
        ))}
        <option value="unknown">רמה לא ידועה</option>
      </select>
      <select
        className={ui.select}
        value={sortValue}
        onChange={(e) => {
          const [sort, dir] = e.target.value.split(':') as [CustomerSort, SortDirection]
          navigate({ sort, dir })
        }}
        aria-label="מיון"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  )

  const tokens: { key: string; label: string; clear: Partial<CustomerListParams> }[] = []
  if (params.q) tokens.push({ key: 'q', label: `חיפוש: ${params.q}`, clear: { q: '' } })
  if (params.status) tokens.push({ key: 'status', label: STATUS_LABELS[params.status], clear: { status: null } })
  if (params.source) tokens.push({ key: 'source', label: SOURCE_LABELS[params.source], clear: { source: null } })
  if (params.level != null) {
    tokens.push({
      key: 'level',
      label: params.level === 'unknown' ? 'רמה לא ידועה' : `רמה ${formatPlayerLevel(params.level)}`,
      clear: { level: null },
    })
  }

  return (
    <div className={s.listPanel}>
      <div className={s.toolbar} role="search">
        <label className={s.search}>
          <span className="sr-only">חיפוש לקוחות</span>
          <IconSearch size={15} className={s.searchIcon} />
          <input
            type="search"
            className={`${ui.input} ${s.searchInput}`}
            placeholder="חיפוש לפי שם, טלפון או אימייל"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className={s.searchClear}
              onClick={() => setQuery('')}
              aria-label="ניקוי חיפוש"
            >
              <IconX size={13} />
            </button>
          )}
        </label>

        <div className={s.filters}>{filterControls}</div>

        <div className={s.toolbarEnd}>
          <Button
            variant="secondary"
            className={s.filterButton}
            onClick={() => setSheetOpen(true)}
            aria-label="סינון ומיון"
          >
            <IconFilter size={15} />
            {activeFilterCount > 0 && <Num>{activeFilterCount}</Num>}
          </Button>
          <Link
            href={`${pathname}${listParamsToQuery({ ...params, archived: !params.archived, page: 1 })}`}
            className={`${s.viewToggle} ${params.archived ? s.viewToggleOn : ''}`}
            aria-pressed={params.archived}
            replace
          >
            ארכיון
          </Link>
          <Link href="/customers/new" className={`${ui.btn} ${ui.btn_primary} ${s.toolbarNew}`}>
            <IconPlus size={15} />
            לקוח חדש
          </Link>
        </div>
      </div>

      {(tokens.length > 0 || params.archived) && (
        <div className={s.metaBar}>
          {params.archived && <span className={s.metaCount}>מציג לקוחות בארכיון</span>}
          {tokens.map((token) => (
            <span key={token.key} className={s.token}>
              {token.label}
              <button
                type="button"
                onClick={() => {
                  if (token.key === 'q') {
                    setQuery('')
                    lastSubmitted.current = ''
                  }
                  navigate(token.clear)
                }}
                aria-label={`הסרת ${token.label}`}
              >
                <IconX size={11} />
              </button>
            </span>
          ))}
          {hasActiveFilters(params) && (
            <button
              type="button"
              className={s.clearAll}
              onClick={() => {
                setQuery('')
                lastSubmitted.current = ''
                navigate({ q: '', status: null, source: null, level: null })
              }}
            >
              ניקוי הכל
            </button>
          )}
        </div>
      )}

      <div className={s.results} data-pending={pending} aria-busy={pending}>
        {children}
      </div>

      <Link href="/customers/new" className={s.fab} aria-label="לקוח חדש">
        <IconPlus size={22} />
      </Link>

      {sheetOpen && (
        <>
          <div className={s.sheetScrim} onClick={() => setSheetOpen(false)} />
          <div className={s.sheet} role="dialog" aria-modal="true" aria-label="סינון ומיון">
            <div className={s.sheetHead}>
              <h2 className={s.sheetTitle}>סינון ומיון</h2>
              <Button variant="ghost" size="sm" onClick={() => setSheetOpen(false)}>
                סגירה
              </Button>
            </div>
            {filterControls}
            <Button variant="primary" block onClick={() => setSheetOpen(false)}>
              הצג תוצאות
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
