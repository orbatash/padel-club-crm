// Phone normalization to E.164. Client-safe (also used for the live preview in
// the form); the server always re-normalizes before writing.
//
// Rules:
// - Israeli numbers are the default: a leading trunk "0" becomes +972
//   (050-742-1183 → +972507421183, 03-555-1234 → +97235551234).
// - "972…" / "00972…" / "+972…" are recognised as Israeli; a trunk "0" after
//   the country code (+972 050…) is dropped.
// - Other international numbers must start with "+" or "00".
// - Result must match E.164 (+ then 8–15 digits), same as customers_phone_e164.

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string }

const E164 = /^\+[1-9][0-9]{7,14}$/

export function normalizePhone(raw: string): PhoneResult {
  const input = raw.trim()
  if (!input) return { ok: false, error: 'חסר מספר טלפון' }

  if (/[^\d\s\-+().]/.test(input)) {
    return { ok: false, error: 'מספר הטלפון מכיל תווים לא חוקיים' }
  }

  const hasPlus = input.startsWith('+')
  let digits = input.replace(/\D/g, '')

  if (!hasPlus && digits.startsWith('00')) digits = digits.slice(2)
  const international = hasPlus || input.replace(/\s/g, '').startsWith('00')

  let e164: string
  if (international) {
    if (digits.startsWith('9720')) digits = `972${digits.slice(4)}`
    e164 = `+${digits}`
  } else if (digits.startsWith('972') && digits.length >= 11) {
    // Typed without "+", e.g. 972501234567
    e164 = `+${digits.startsWith('9720') ? `972${digits.slice(4)}` : digits}`
  } else if (digits.startsWith('0')) {
    e164 = `+972${digits.slice(1)}`
  } else {
    return { ok: false, error: 'מספר מקומי צריך להתחיל ב-0, ומספר בינלאומי ב-+' }
  }

  if (e164.startsWith('+972')) {
    const national = e164.slice(4)
    // Mobile 5X + 7 digits (9 total); landlines 2/3/4/8/9 + 7 digits (8 total);
    // 7X VoIP + 7 digits (9 total).
    const valid =
      (/^5\d{8}$/.test(national) || /^7\d{8}$/.test(national) || /^[23489]\d{7}$/.test(national))
    if (!valid) return { ok: false, error: 'מספר ישראלי לא תקין' }
  }

  if (!E164.test(e164)) return { ok: false, error: 'מספר טלפון לא תקין' }
  return { ok: true, e164 }
}

/**
 * Human display. Israeli numbers in local format (+972501234567 → 050-123-4567),
 * everything else in E.164. Always render inside <Num> (LTR).
 */
export function formatPhone(e164: string | null): string | null {
  if (!e164) return null
  if (!e164.startsWith('+972')) return e164
  const local = `0${e164.slice(4)}`
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
  if (local.length === 9) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`
  return local
}

/**
 * Turn a free-text search into the digit sequence stored in E.164, so that
 * "050-742" finds +97250742…. Returns null when the query isn't phone-like.
 */
export function phoneSearchDigits(query: string): string | null {
  const digits = query.replace(/\D/g, '')
  if (digits.length < 3 || /[^\d\s\-+().]/.test(query.trim())) return null
  if (digits.startsWith('0') && !digits.startsWith('00')) return `972${digits.slice(1)}`
  return digits.startsWith('00') ? digits.slice(2) : digits
}
