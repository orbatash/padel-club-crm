import type { Tables, TablesInsert } from '@/lib/database.types'
import {
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  PLAYER_LEVELS,
  type Customer,
  type CustomerInput,
  type CustomerListItem,
  type CustomerSource,
  type CustomerStatus,
  type PlayerLevel,
} from './types'

type CustomerRow = Tables<'customers'>

// Database constraints guarantee these values; the guards keep the types
// honest if a row ever slips through (e.g. written by another tool).
export function asStatus(value: string): CustomerStatus {
  return CUSTOMER_STATUSES.includes(value as CustomerStatus) ? (value as CustomerStatus) : 'new'
}
export function asSource(value: string | null): CustomerSource | null {
  return value && CUSTOMER_SOURCES.includes(value as CustomerSource) ? (value as CustomerSource) : null
}
export function asLevel(value: number | string | null): PlayerLevel | null {
  if (value == null) return null
  const n = Number(value)
  return PLAYER_LEVELS.includes(n as PlayerLevel) ? (n as PlayerLevel) : null
}

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    instagramUsername: row.instagram_username,
    status: asStatus(row.status),
    source: asSource(row.source),
    playerLevel: asLevel(row.player_level),
    interests: row.interests ?? [],
    tags: row.tags ?? [],
    notes: row.notes,
    lastConversationSummary: row.last_conversation_summary,
    whatsappOptIn: row.whatsapp_opt_in,
    marketingOptIn: row.marketing_opt_in,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const LIST_COLUMNS =
  'id, full_name, phone, email, status, source, player_level, tags, archived_at, created_at, updated_at' as const

type ListRow = Pick<
  CustomerRow,
  | 'id'
  | 'full_name'
  | 'phone'
  | 'email'
  | 'status'
  | 'source'
  | 'player_level'
  | 'tags'
  | 'archived_at'
  | 'created_at'
  | 'updated_at'
>

export function toListItem(row: ListRow): CustomerListItem {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    status: asStatus(row.status),
    source: asSource(row.source),
    playerLevel: asLevel(row.player_level),
    tags: row.tags ?? [],
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Only owner-editable columns. Audit fields are set by the database trigger. */
export function toRow(input: CustomerInput): TablesInsert<'customers'> {
  return {
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    instagram_username: input.instagramUsername,
    status: input.status,
    source: input.source,
    player_level: input.playerLevel,
    interests: input.interests,
    tags: input.tags,
    notes: input.notes,
    whatsapp_opt_in: input.whatsappOptIn,
    marketing_opt_in: input.marketingOptIn,
  }
}
