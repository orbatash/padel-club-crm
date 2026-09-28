import 'server-only'

import { cache } from 'react'
import { requireOwner } from '@/lib/auth'
import { LIST_COLUMNS, asStatus, toCustomer, toListItem, toRow } from './mappers'
import { phoneSearchDigits } from './phone'
import { PAGE_SIZE } from './search-params'
import type {
  Customer,
  CustomerInput,
  CustomerListParams,
  CustomerListResult,
  DuplicateMatch,
} from './types'

// The only module that talks to the `customers` table. Every function checks
// the Owner session itself and uses the RLS-bound client — never the service
// role. UI components and Server Actions call these functions only.

const SORT_COLUMNS = {
  created: 'created_at',
  updated: 'updated_at',
  name: 'full_name',
  level: 'player_level',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CustomerDataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'CustomerDataError'
  }
}

/** PostgREST filter values are quoted; strip characters that could break out. */
function filterValue(value: string) {
  return value.replace(/["\\,()*%]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function listCustomers(
  params: CustomerListParams
): Promise<CustomerListResult & { outOfRange: boolean }> {
  const { supabase } = await requireOwner()

  let query = supabase.from('customers').select(LIST_COLUMNS, { count: 'exact' })

  query = params.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  if (params.status) query = query.eq('status', params.status)
  if (params.source) query = query.eq('source', params.source)
  if (params.level === 'unknown') query = query.is('player_level', null)
  else if (params.level != null) query = query.eq('player_level', params.level)

  const term = filterValue(params.q)
  if (term) {
    const handle = term.replace(/^@/, '')
    const conditions = [
      `full_name.ilike."*${term}*"`,
      `email.ilike."*${term}*"`,
      `instagram_username.ilike."*${handle}*"`,
    ]
    const digits = phoneSearchDigits(params.q)
    if (digits) conditions.push(`phone.like."*${digits}*"`)
    query = query.or(conditions.join(','))
  }

  const ascending = params.dir === 'asc'
  query = query
    .order(SORT_COLUMNS[params.sort], { ascending, nullsFirst: false })
    .order('id', { ascending: true }) // stable pagination

  const from = (params.page - 1) * PAGE_SIZE
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1)

  if (error) {
    // Requested page is past the end (e.g. after filters changed).
    if (error.code === 'PGRST103') {
      return { items: [], total: 0, page: params.page, pageSize: PAGE_SIZE, pageCount: 0, outOfRange: true }
    }
    throw new CustomerDataError('טעינת הלקוחות נכשלה', error)
  }

  const items = (data ?? []).map(toListItem)
  const total = count ?? items.length

  return {
    items,
    total,
    page: params.page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    outOfRange: false,
  }
}

/** Cached per request, so metadata and page share one query. */
export const getCustomer = cache(async (id: string): Promise<Customer | null> => {
  if (!UUID.test(id)) return null
  const { supabase } = await requireOwner()

  const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
  if (error) throw new CustomerDataError('טעינת הלקוח נכשלה', error)
  return data ? toCustomer(data) : null
})

/**
 * Possible duplicates: any customer (including archived) with the same
 * normalized phone or email. Phone/email are intentionally not unique in the
 * database — families share contact details — so this only informs the Owner.
 */
export async function findDuplicates(
  { phone, email }: { phone: string | null; email: string | null },
  excludeId?: string
): Promise<DuplicateMatch[]> {
  if (!phone && !email) return []
  const { supabase } = await requireOwner()

  const conditions: string[] = []
  if (phone) conditions.push(`phone.eq."${filterValue(phone)}"`)
  if (email) conditions.push(`email.eq."${filterValue(email)}"`)

  let query = supabase
    .from('customers')
    .select('id, full_name, phone, email, status, archived_at')
    .or(conditions.join(','))
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: false })
    .limit(5)
  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query
  if (error) throw new CustomerDataError('בדיקת כפילויות נכשלה', error)

  return (data ?? []).map((row) => ({
    customer: {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      status: asStatus(row.status),
      archivedAt: row.archived_at,
    },
    matchedOn: [
      ...(phone && row.phone === phone ? (['phone'] as const) : []),
      ...(email && row.email === email ? (['email'] as const) : []),
    ],
  }))
}

export async function createCustomer(input: CustomerInput): Promise<string> {
  const { supabase } = await requireOwner()
  const { data, error } = await supabase.from('customers').insert(toRow(input)).select('id').single()
  if (error) throw new CustomerDataError('יצירת הלקוח נכשלה', error)
  return data.id
}

export type UpdateResult = { ok: true } | { ok: false; reason: 'conflict' | 'not_found' }

/**
 * Optimistic concurrency: the update only applies if the row hasn't changed
 * since the form was opened (same updated_at), so edits are never silently
 * overwritten.
 */
export async function updateCustomer(
  id: string,
  input: CustomerInput,
  expectedUpdatedAt: string
): Promise<UpdateResult> {
  if (!UUID.test(id)) return { ok: false, reason: 'not_found' }
  const { supabase } = await requireOwner()

  const { data, error } = await supabase
    .from('customers')
    .update(toRow(input))
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select('id')
    .maybeSingle()
  if (error) throw new CustomerDataError('עדכון הלקוח נכשל', error)
  if (data) return { ok: true }

  const exists = await getCustomer(id)
  return { ok: false, reason: exists ? 'conflict' : 'not_found' }
}

/** Archive (never delete). Reversible with restoreCustomer. */
export async function setCustomerArchived(id: string, archived: boolean): Promise<void> {
  if (!UUID.test(id)) throw new CustomerDataError('לקוח לא נמצא')
  const { supabase } = await requireOwner()
  const { error } = await supabase
    .from('customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new CustomerDataError(archived ? 'העברה לארכיון נכשלה' : 'שחזור נכשל', error)
}
