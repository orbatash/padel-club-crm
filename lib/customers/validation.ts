import { normalizePhone } from './phone'
import {
  CUSTOMER_SOURCES,
  CUSTOMER_STATUSES,
  PLAYER_LEVELS,
  type CustomerInput,
  type CustomerSource,
  type CustomerStatus,
  type PlayerLevel,
} from './types'

// Parses and normalizes the create/edit form. Mirrors the database CHECK
// constraints so users see Hebrew field errors instead of database errors.
// Client-safe; the Server Action is the authority.

export type CustomerField = keyof CustomerInput | 'identity'
export type FieldErrors = Partial<Record<CustomerField, string>>

/** Raw form values echoed back so the form can be re-rendered as typed. */
export type CustomerFormValues = {
  fullName: string
  phone: string
  email: string
  instagramUsername: string
  status: string
  source: string
  playerLevel: string
  interests: string[]
  tags: string[]
  notes: string
  whatsappOptIn: boolean
  marketingOptIn: boolean
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const INSTAGRAM = /^[a-z0-9._]{1,30}$/
const MAX_LIST_ITEMS = 30
const MAX_LIST_ITEM_LENGTH = 40

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

export function readCustomerForm(formData: FormData): CustomerFormValues {
  return {
    fullName: text(formData, 'fullName'),
    phone: text(formData, 'phone'),
    email: text(formData, 'email'),
    instagramUsername: text(formData, 'instagramUsername'),
    status: text(formData, 'status'),
    source: text(formData, 'source'),
    playerLevel: text(formData, 'playerLevel'),
    interests: formData.getAll('interests').filter((v): v is string => typeof v === 'string'),
    tags: formData.getAll('tags').filter((v): v is string => typeof v === 'string'),
    notes: text(formData, 'notes'),
    whatsappOptIn: formData.get('whatsappOptIn') === 'on',
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  }
}

/** "@Noa.Levi", "instagram.com/noa.levi/" → "noa.levi" */
export function normalizeInstagram(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
}

function normalizeList(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const item = value.trim().replace(/\s+/g, ' ')
    if (!item || seen.has(item.toLowerCase())) continue
    seen.add(item.toLowerCase())
    result.push(item)
  }
  return result
}

export function validateCustomer(
  values: CustomerFormValues
): { ok: true; data: CustomerInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {}

  const fullName = values.fullName.trim().replace(/\s+/g, ' ') || null
  if (fullName && fullName.length > 120) errors.fullName = 'עד 120 תווים'

  let phone: string | null = null
  if (values.phone.trim()) {
    const result = normalizePhone(values.phone)
    if (result.ok) phone = result.e164
    else errors.phone = result.error
  }

  const email = values.email.trim().toLowerCase() || null
  if (email && !EMAIL.test(email)) errors.email = 'כתובת אימייל לא תקינה'

  const instagramUsername = normalizeInstagram(values.instagramUsername) || null
  if (instagramUsername && !INSTAGRAM.test(instagramUsername)) {
    errors.instagramUsername = 'שם משתמש: אותיות באנגלית, ספרות, נקודה וקו תחתון, עד 30 תווים'
  }

  const status = (values.status || 'new') as CustomerStatus
  if (!CUSTOMER_STATUSES.includes(status)) errors.status = 'סטטוס לא תקין'

  const source = (values.source || null) as CustomerSource | null
  if (source && !CUSTOMER_SOURCES.includes(source)) errors.source = 'מקור לא תקין'

  let playerLevel: PlayerLevel | null = null
  if (values.playerLevel) {
    const level = Number(values.playerLevel)
    if (PLAYER_LEVELS.includes(level as PlayerLevel)) playerLevel = level as PlayerLevel
    else errors.playerLevel = 'רמה בין 1.0 ל-5.0 בקפיצות של 0.5'
  }

  const interests = normalizeList(values.interests)
  const tags = normalizeList(values.tags)
  for (const [key, list] of [
    ['interests', interests],
    ['tags', tags],
  ] as const) {
    if (list.length > MAX_LIST_ITEMS) errors[key] = `עד ${MAX_LIST_ITEMS} פריטים`
    else if (list.some((item) => item.length > MAX_LIST_ITEM_LENGTH)) {
      errors[key] = `כל פריט עד ${MAX_LIST_ITEM_LENGTH} תווים`
    }
  }

  const notes = values.notes.trim() || null
  if (notes && notes.length > 10000) errors.notes = 'עד 10,000 תווים'

  // A customer needs at least one way to identify them.
  if (!fullName && !phone && !email && !instagramUsername && !errors.phone && !errors.email) {
    errors.identity = 'יש למלא לפחות אחד מהשדות: שם, טלפון, אימייל או Instagram'
  }

  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    data: {
      fullName,
      phone,
      email,
      instagramUsername,
      status,
      source,
      playerLevel,
      interests,
      tags,
      notes,
      whatsappOptIn: values.whatsappOptIn,
      marketingOptIn: values.marketingOptIn,
    },
  }
}
