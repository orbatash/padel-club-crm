// Domain types for the Customers module. UI and actions use these, never raw
// database rows. Mapping lives in lib/customers/mappers.ts.

export const CUSTOMER_STATUSES = ['new', 'active', 'inactive'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export const CUSTOMER_SOURCES = [
  'walk_in',
  'phone',
  'whatsapp',
  'instagram',
  'facebook',
  'website',
  'google',
  'referral',
  'lazuz',
  'shopify',
  'event',
  'campaign',
  'other',
] as const
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number]

/** Club rating: 1.0–5.0 in 0.5 steps (matches customers_player_level_check). */
export const PLAYER_LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const
export type PlayerLevel = (typeof PLAYER_LEVELS)[number]

export type Customer = {
  id: string
  fullName: string | null
  /** E.164, e.g. +972501234567 */
  phone: string | null
  email: string | null
  /** Without "@", lowercase */
  instagramUsername: string | null
  status: CustomerStatus
  source: CustomerSource | null
  playerLevel: PlayerLevel | null
  interests: string[]
  tags: string[]
  notes: string | null
  lastConversationSummary: string | null
  whatsappOptIn: boolean
  marketingOptIn: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CustomerListItem = Pick<
  Customer,
  | 'id'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'status'
  | 'source'
  | 'playerLevel'
  | 'tags'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
>

/** Validated, normalized values ready to be written. */
export type CustomerInput = {
  fullName: string | null
  phone: string | null
  email: string | null
  instagramUsername: string | null
  status: CustomerStatus
  source: CustomerSource | null
  playerLevel: PlayerLevel | null
  interests: string[]
  tags: string[]
  notes: string | null
  whatsappOptIn: boolean
  marketingOptIn: boolean
}

export type DuplicateMatch = {
  customer: Pick<Customer, 'id' | 'fullName' | 'phone' | 'email' | 'status' | 'archivedAt'>
  matchedOn: ('phone' | 'email')[]
}

export type CustomerSort = 'created' | 'updated' | 'name' | 'level'
export type SortDirection = 'asc' | 'desc'

export type CustomerListParams = {
  q: string
  status: CustomerStatus | null
  source: CustomerSource | null
  /** A level, 'unknown' for customers without one, or null for all. */
  level: PlayerLevel | 'unknown' | null
  archived: boolean
  sort: CustomerSort
  dir: SortDirection
  page: number
}

export type CustomerListResult = {
  items: CustomerListItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}
