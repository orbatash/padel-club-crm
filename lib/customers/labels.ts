import type { CustomerSource, CustomerStatus, PlayerLevel } from './types'

// Hebrew labels and display helpers. Client-safe.

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  new: 'חדש',
  active: 'פעיל',
  inactive: 'לא פעיל',
}

export const STATUS_TONES: Record<CustomerStatus, 'info' | 'live' | 'neutral'> = {
  new: 'info',
  active: 'live',
  inactive: 'neutral',
}

export const SOURCE_LABELS: Record<CustomerSource, string> = {
  walk_in: 'הגיע למועדון',
  phone: 'טלפון',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  website: 'אתר',
  google: 'Google',
  referral: 'הפניה',
  lazuz: 'LAZUZ',
  shopify: 'Shopify',
  event: 'אירוע',
  campaign: 'קמפיין',
  other: 'אחר',
}

export const UNNAMED_CUSTOMER = 'לקוח ללא שם'

export function displayName(fullName: string | null) {
  return fullName ?? UNNAMED_CUSTOMER
}

/** 2.5 → "2.5", 4 → "4.0" */
export function formatPlayerLevel(level: PlayerLevel | number) {
  return level.toFixed(1)
}

const TIME_ZONE = 'Asia/Jerusalem'

const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(iso: string) {
  const map = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return map as Record<'day' | 'month' | 'year' | 'hour' | 'minute', string>
}

/** "27.09.26" (club time zone) */
export function formatDate(iso: string) {
  const p = parts(iso)
  return `${p.day}.${p.month}.${p.year}`
}

/** "27.09.26 · 18:42" (club time zone) */
export function formatDateTime(iso: string) {
  const p = parts(iso)
  return `${p.day}.${p.month}.${p.year} · ${p.hour}:${p.minute}`
}
