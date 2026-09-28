'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { ui } from '@/components/ui/primitives'
import { IconCheck, IconX } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import { formatPlayerLevel } from '@/lib/customers/labels'
import { normalizePhone } from '@/lib/customers/phone'
import { PLAYER_LEVELS } from '@/lib/customers/types'
import s from './customers.module.css'

/** Phone input (LTR) with a live preview of the E.164 value that will be saved. */
export function PhoneField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [value, setValue] = useState(defaultValue)
  const [touched, setTouched] = useState(false)
  const id = useId()
  const result = value.trim() ? normalizePhone(value) : null
  const showLocalError = touched && result && !result.ok && !error

  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.fieldLabel}>
        טלפון
      </label>
      <input
        id={id}
        name="phone"
        type="tel"
        dir="ltr"
        inputMode="tel"
        autoComplete="tel"
        placeholder="050-123-4567"
        className={ui.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={error || showLocalError ? true : undefined}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`}>
        {error ? (
          <span className={ui.fieldError}>
            <IconX size={12} />
            {error}
          </span>
        ) : result?.ok ? (
          <span className={`${s.phonePreview} ${s.phonePreviewOk}`}>
            <IconCheck size={12} />
            יישמר כ-<Num>{result.e164}</Num>
          </span>
        ) : showLocalError && !result.ok ? (
          <span className={ui.fieldError}>
            <IconX size={12} />
            {result.error}
          </span>
        ) : (
          <span className={ui.fieldHint}>מספר ישראלי או בינלאומי עם +</span>
        )}
      </span>
    </div>
  )
}

/** 1.0–5.0 in 0.5 steps, plus "unknown". Native radios; always LTR like any numeric scale. */
export function LevelPicker({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const name = 'playerLevel'
  return (
    <fieldset className={ui.field} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend className={ui.fieldLabel} style={{ padding: 0, marginBottom: 4 }}>
        רמת משחק
      </legend>
      <div className={s.levelPicker} role="radiogroup" aria-label="רמת משחק">
        <label className={`${ui.segment} ${s.levelUnknown}`}>
          <input type="radio" name={name} value="" defaultChecked={defaultValue === ''} />
          <span dir="rtl">לא ידוע</span>
        </label>
        {PLAYER_LEVELS.map((level) => (
          <label key={level} className={ui.segment}>
            <input
              type="radio"
              name={name}
              value={String(level)}
              defaultChecked={defaultValue !== '' && Number(defaultValue) === level}
            />
            <span className="num">{formatPlayerLevel(level)}</span>
          </label>
        ))}
      </div>
      {error ? (
        <span className={ui.fieldError}>{error}</span>
      ) : (
        <span className={ui.fieldHint}>דירוג המועדון, 1.0 עד 5.0</span>
      )}
    </fieldset>
  )
}

/** Chips input: Enter or comma adds, Backspace on empty removes the last chip. */
export function TagInput({
  name,
  label,
  defaultValue,
  placeholder,
  error,
}: {
  name: string
  label: string
  defaultValue: string[]
  placeholder: string
  error?: string
}) {
  const [items, setItems] = useState(defaultValue)
  const [draft, setDraft] = useState('')
  const id = useId()

  const add = (raw: string) => {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value) return
    if (!items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setItems([...items, value])
    }
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && items.length) {
      setItems(items.slice(0, -1))
    }
  }

  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.fieldLabel}>
        {label}
      </label>
      <div className={s.tagInput} aria-invalid={error ? true : undefined}>
        {items.map((item) => (
          <span key={item} className={s.tagChip}>
            {item}
            <input type="hidden" name={name} value={item} />
            <button
              type="button"
              onClick={() => setItems(items.filter((i) => i !== item))}
              aria-label={`הסרת ${item}`}
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
        {/* An unconfirmed draft is still submitted; the server trims and de-duplicates. */}
        {draft.trim() && <input type="hidden" name={name} value={draft} />}
        <input
          id={id}
          className={s.tagField}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={items.length ? '' : placeholder}
          enterKeyHint="done"
        />
      </div>
      {error ? (
        <span className={ui.fieldError}>{error}</span>
      ) : (
        <span className={ui.fieldHint}>Enter או פסיק להוספה</span>
      )}
    </div>
  )
}
