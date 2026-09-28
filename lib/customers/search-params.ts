import {
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  PLAYER_LEVELS,
  type CustomerListParams,
  type CustomerSort,
  type CustomerSource,
  type CustomerStatus,
  type PlayerLevel,
} from './types'

// The customer list's state lives in the URL (shareable, back/forward-safe,
// works in the installed PWA). Client-safe: used by the page and the toolbar.

export const PAGE_SIZE = 25

const SORTS: CustomerSort[] = ['created', 'updated', 'name', 'level']

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function parseListParams(raw: RawParams): CustomerListParams {
  const status = first(raw.status) as CustomerStatus | undefined
  const source = first(raw.source) as CustomerSource | undefined
  const sort = first(raw.sort) as CustomerSort | undefined
  const levelRaw = first(raw.level)
  const level =
    levelRaw === 'unknown'
      ? 'unknown'
      : PLAYER_LEVELS.includes(Number(levelRaw) as PlayerLevel) && levelRaw
        ? (Number(levelRaw) as PlayerLevel)
        : null
  const page = Math.max(1, Math.floor(Number(first(raw.page)) || 1))
  const resolvedSort = sort && SORTS.includes(sort) ? sort : 'created'
  const dirRaw = first(raw.dir)
  const defaultDir = resolvedSort === 'name' ? 'asc' : 'desc'

  return {
    q: (first(raw.q) ?? '').trim().slice(0, 100),
    status: status && CUSTOMER_STATUSES.includes(status) ? status : null,
    source: source && CUSTOMER_SOURCES.includes(source) ? source : null,
    level,
    archived: first(raw.view) === 'archived',
    sort: resolvedSort,
    dir: dirRaw === 'asc' || dirRaw === 'desc' ? dirRaw : defaultDir,
    page,
  }
}

/** Serialize, omitting defaults so URLs stay short. */
export function listParamsToQuery(params: Partial<CustomerListParams>) {
  const q = new URLSearchParams()
  if (params.q) q.set('q', params.q)
  if (params.status) q.set('status', params.status)
  if (params.source) q.set('source', params.source)
  if (params.level != null) q.set('level', String(params.level))
  if (params.archived) q.set('view', 'archived')
  if (params.sort && params.sort !== 'created') q.set('sort', params.sort)
  const defaultDir = params.sort === 'name' ? 'asc' : 'desc'
  if (params.dir && params.dir !== defaultDir) q.set('dir', params.dir)
  if (params.page && params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function hasActiveFilters(params: CustomerListParams) {
  return Boolean(params.q || params.status || params.source || params.level != null)
}
