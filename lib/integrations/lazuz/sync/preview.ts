import type { CustomerCreation } from './plan'

// Dry-run preview of the CRM customers auto-create WOULD create. Returned in
// the dry-run API response only (never logged, never persisted), so it carries
// no full PII: phone masked to country code + last 4 digits, email reduced to
// its domain, LAZUZ client_id reduced to a boolean.

export const PREVIEW_LIMIT = 25

export type CustomerPreviewItem = {
  full_name: string | null
  /** e.g. +972*****1234 — fixed-width mask, so the length isn't revealed either. */
  phoneMasked: string
  /** e.g. gmail.com; null when there is no email. */
  emailDomain: string | null
  hasClientId: boolean
  /** Bookings in this dry run that would link to this customer. */
  reservations: number
}

export type CustomerPreview = {
  total: number
  shown: number
  items: CustomerPreviewItem[]
  counts: {
    candidatesWithName: number
    candidatesWithoutName: number
    candidatesWithEmail: number
    candidatesWithoutEmail: number
    candidatesWithClientId: number
    candidatesWithoutClientId: number
    candidatesWithMultipleReservations: number
  }
}

/** '+972501234567' → '+972*****4567'. Anything unexpected → '***'. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (!e164.startsWith('+') || digits.length < 8) return '***'
  const country = e164.startsWith('+972') ? '+972' : '+'
  return `${country}*****${digits.slice(-4)}`
}

/** 'Dana@Gmail.com' → 'gmail.com'. Never returns the local part. */
export function emailDomain(email: string | null): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  const domain = at >= 0 ? email.slice(at + 1).trim().toLowerCase() : ''
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null
}

export function buildCustomerPreview(
  creations: CustomerCreation[],
  reservationsByPhone: Map<string, number>,
  limit = PREVIEW_LIMIT
): CustomerPreview {
  const all = creations.map(
    (c): CustomerPreviewItem => ({
      full_name: c.full_name,
      phoneMasked: maskPhone(c.phone),
      emailDomain: emailDomain(c.email),
      hasClientId: c.clientExternalId !== null,
      reservations: reservationsByPhone.get(c.phone) ?? 0,
    })
  )
  const withName = all.filter((c) => c.full_name).length
  const withEmail = creations.filter((c) => c.email).length
  const withClientId = all.filter((c) => c.hasClientId).length
  // Busiest candidates first; stable for ties (feed order).
  const items = [...all].sort((a, b) => b.reservations - a.reservations).slice(0, Math.max(0, limit))
  return {
    total: all.length,
    shown: items.length,
    items,
    counts: {
      candidatesWithName: withName,
      candidatesWithoutName: all.length - withName,
      candidatesWithEmail: withEmail,
      candidatesWithoutEmail: all.length - withEmail,
      candidatesWithClientId: withClientId,
      candidatesWithoutClientId: all.length - withClientId,
      candidatesWithMultipleReservations: all.filter((c) => c.reservations > 1).length,
    },
  }
}
