'use client'

import Link from 'next/link'
import { useActionState, useEffect, useId, useRef } from 'react'
import { saveCustomer, type SaveCustomerState } from '@/app/(app)/customers/actions'
import { Button, Chip, ui } from '@/components/ui/primitives'
import { IconX } from '@/components/ui/icons'
import { Ltr, Num } from '@/components/ui/text'
import { SOURCE_LABELS, STATUS_LABELS, UNNAMED_CUSTOMER } from '@/lib/customers/labels'
import { formatPhone } from '@/lib/customers/phone'
import { CUSTOMER_SOURCES, CUSTOMER_STATUSES, type Customer } from '@/lib/customers/types'
import type { CustomerFormValues } from '@/lib/customers/validation'
import { LevelPicker, PhoneField, TagInput } from './form-fields'
import s from './customers.module.css'

function initialValues(customer?: Customer): CustomerFormValues {
  return {
    fullName: customer?.fullName ?? '',
    phone: customer?.phone ? (formatPhone(customer.phone) ?? customer.phone) : '',
    email: customer?.email ?? '',
    instagramUsername: customer?.instagramUsername ?? '',
    status: customer?.status ?? 'new',
    source: customer?.source ?? '',
    playerLevel: customer?.playerLevel != null ? String(customer.playerLevel) : '',
    interests: customer?.interests ?? [],
    tags: customer?.tags ?? [],
    notes: customer?.notes ?? '',
    whatsappOptIn: customer?.whatsappOptIn ?? false,
    marketingOptIn: customer?.marketingOptIn ?? false,
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span className={ui.fieldError}>
      <IconX size={12} />
      {message}
    </span>
  )
}

/**
 * Create / edit form. Uncontrolled inputs seeded from `values`; after each
 * server response the form re-mounts (keyed by `seq`) with the echoed values,
 * so nothing typed is lost on a validation error or duplicate warning.
 */
export function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action, pending] = useActionState<SaveCustomerState, FormData>(saveCustomer, {
    seq: 0,
    status: 'idle',
  })
  const alertRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const v = state.values ?? initialValues(customer)
  const e = state.errors ?? {}
  const editing = Boolean(customer)

  // Bring the duplicate warning / error summary into view after a response.
  useEffect(() => {
    if (state.status !== 'idle') alertRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [state.seq, state.status])

  const field = (name: keyof CustomerFormValues) => `${uid}-${name}`

  return (
    <form key={state.seq} action={action} className={s.form} noValidate>
      {customer && (
        <>
          <input type="hidden" name="id" value={customer.id} />
          <input type="hidden" name="expectedUpdatedAt" value={customer.updatedAt} />
        </>
      )}

      <div className={s.formPanel}>
        <section className={s.formSection}>
          <div className={s.formSectionHead}>
            <h3>זהות ופרטי קשר</h3>
            <p>לפחות אחד מהשדות. שם אפשר להשאיר ריק אם הוא עדיין לא ידוע.</p>
          </div>
          <div className={s.formFields}>
            <div className={`${ui.field} ${s.full}`}>
              <label htmlFor={field('fullName')} className={ui.fieldLabel}>
                שם מלא
              </label>
              <input
                id={field('fullName')}
                name="fullName"
                className={ui.input}
                defaultValue={v.fullName}
                autoComplete="off"
                maxLength={120}
                placeholder={UNNAMED_CUSTOMER}
                aria-invalid={e.fullName ? true : undefined}
              />
              <FieldError message={e.fullName} />
            </div>

            <PhoneField defaultValue={v.phone} error={e.phone} />

            <div className={ui.field}>
              <label htmlFor={field('email')} className={ui.fieldLabel}>
                אימייל
              </label>
              <input
                id={field('email')}
                name="email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="off"
                className={ui.input}
                defaultValue={v.email}
                placeholder="name@example.com"
                aria-invalid={e.email ? true : undefined}
              />
              <FieldError message={e.email} />
            </div>

            <div className={ui.field}>
              <label htmlFor={field('instagramUsername')} className={ui.fieldLabel}>
                Instagram
              </label>
              <div className={s.inputAffix} dir="ltr">
                <span className={s.atSign}>@</span>
                <input
                  id={field('instagramUsername')}
                  name="instagramUsername"
                  dir="ltr"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${ui.input} ${s.inputWithAt}`}
                  defaultValue={v.instagramUsername}
                  placeholder="username"
                  aria-invalid={e.instagramUsername ? true : undefined}
                />
              </div>
              <FieldError message={e.instagramUsername} />
            </div>

            {e.identity && (
              <div className={s.full}>
                <FieldError message={e.identity} />
              </div>
            )}
          </div>
        </section>

        <section className={s.formSection}>
          <div className={s.formSectionHead}>
            <h3>פרופיל</h3>
            <p>סטטוס במחזור החיים, מקור ההגעה ורמת משחק.</p>
          </div>
          <div className={s.formFields}>
            <fieldset className={`${ui.field} ${s.full}`} style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className={ui.fieldLabel} style={{ padding: 0, marginBottom: 4 }}>
                סטטוס
              </legend>
              <div className={ui.segmented}>
                {CUSTOMER_STATUSES.map((status) => (
                  <label key={status} className={ui.segment}>
                    <input type="radio" name="status" value={status} defaultChecked={v.status === status} />
                    <span>{STATUS_LABELS[status]}</span>
                  </label>
                ))}
              </div>
              <FieldError message={e.status} />
            </fieldset>

            <div className={ui.field}>
              <label htmlFor={field('source')} className={ui.fieldLabel}>
                מקור
              </label>
              <select id={field('source')} name="source" className={ui.select} defaultValue={v.source}>
                <option value="">לא ידוע</option>
                {CUSTOMER_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
              <FieldError message={e.source} />
            </div>

            <div className={s.full}>
              <LevelPicker defaultValue={v.playerLevel} error={e.playerLevel} />
            </div>
          </div>
        </section>

        <section className={s.formSection}>
          <div className={s.formSectionHead}>
            <h3>תחומי עניין ותגיות</h3>
            <p>לסינון, לפילוח ולהתאמת הצעות בהמשך.</p>
          </div>
          <div className={s.formFields}>
            <div className={s.full}>
              <TagInput
                name="interests"
                label="תחומי עניין"
                defaultValue={v.interests}
                placeholder="למשל: שיעורים, ליגה, טורנירים"
                error={e.interests}
              />
            </div>
            <div className={s.full}>
              <TagInput
                name="tags"
                label="תגיות"
                defaultValue={v.tags}
                placeholder="למשל: VIP, הורה לנוער"
                error={e.tags}
              />
            </div>
          </div>
        </section>

        <section className={s.formSection}>
          <div className={s.formSectionHead}>
            <h3>הערות</h3>
            <p>מידע פנימי. לא נשלח ללקוח.</p>
          </div>
          <div className={s.formFields}>
            <div className={`${ui.field} ${s.full}`}>
              <label htmlFor={field('notes')} className="sr-only">
                הערות
              </label>
              <textarea
                id={field('notes')}
                name="notes"
                className={ui.textarea}
                defaultValue={v.notes}
                maxLength={10000}
                rows={4}
                aria-invalid={e.notes ? true : undefined}
              />
              <FieldError message={e.notes} />
            </div>
          </div>
        </section>

        <section className={s.formSection}>
          <div className={s.formSectionHead}>
            <h3>הסכמות</h3>
            <p>סמן רק אם הלקוח הסכים במפורש.</p>
          </div>
          <div className={s.checks}>
            <label className={ui.check}>
              <input type="checkbox" name="whatsappOptIn" defaultChecked={v.whatsappOptIn} />
              מסכים לקבל הודעות WhatsApp
            </label>
            <label className={ui.check}>
              <input type="checkbox" name="marketingOptIn" defaultChecked={v.marketingOptIn} />
              מסכים לקבל דיוור שיווקי
            </label>
          </div>
        </section>
      </div>

      <div ref={alertRef}>
        {state.status === 'invalid' && (
          <div className={s.formAlert} role="alert">
            <p>יש שדות שצריך לתקן לפני השמירה.</p>
          </div>
        )}
        {state.status === 'conflict' && (
          <div className={s.formAlert} role="alert">
            <p>
              הלקוח עודכן בינתיים ממקום אחר, ולכן השינויים לא נשמרו כדי לא לדרוס אותם. פתח את הלקוח מחדש
              וערוך שוב.
            </p>
            {customer && (
              <Link href={`/customers/${customer.id}`} className={`${ui.btn} ${ui.btn_secondary} ${ui.btn_sm}`}>
                פתח את הגרסה העדכנית
              </Link>
            )}
          </div>
        )}
        {state.status === 'not_found' && (
          <div className={s.formAlert} role="alert">
            <p>הלקוח לא נמצא.</p>
          </div>
        )}
        {state.status === 'duplicates' && state.matches && (
          <DuplicateWarning state={state} editing={editing} pending={pending} />
        )}
      </div>

      <div className={s.formFooter}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'שומר…' : editing ? 'שמירת שינויים' : 'יצירת לקוח'}
        </Button>
        <Link
          href={customer ? `/customers/${customer.id}` : '/customers'}
          className={`${ui.btn} ${ui.btn_ghost}`}
        >
          ביטול
        </Link>
        <span className={s.formFooterNote}>טלפון נשמר בפורמט בינלאומי (E.164)</span>
      </div>
    </form>
  )
}

function DuplicateWarning({
  state,
  editing,
  pending,
}: {
  state: SaveCustomerState
  editing: boolean
  pending: boolean
}) {
  const matches = state.matches ?? []
  return (
    <div className={s.duplicate} role="alert">
      <div className={s.duplicateHead}>
        <strong>ייתכן שהלקוח כבר קיים</strong>
        <span>
          {matches.length === 1 ? 'נמצא לקוח' : `נמצאו ${matches.length} לקוחות`} עם אותו טלפון או אימייל.
          בני משפחה חולקים לפעמים פרטי קשר, אז זה לא בהכרח אותו אדם.
        </span>
      </div>
      <ul className={s.duplicateList}>
        {matches.map(({ customer, matchedOn }) => (
          <li key={customer.id} className={s.duplicateItem}>
            <span className={s.duplicateWho}>
              <span>{customer.fullName ?? UNNAMED_CUSTOMER}</span>
              <span>
                {customer.phone && <Num>{formatPhone(customer.phone)}</Num>}
                {customer.email && <Ltr>{customer.email}</Ltr>}
              </span>
            </span>
            {matchedOn.includes('phone') && <Chip tone="warn">אותו טלפון</Chip>}
            {matchedOn.includes('email') && <Chip tone="warn">אותו אימייל</Chip>}
            {customer.archivedAt && <Chip>בארכיון</Chip>}
            <Link href={`/customers/${customer.id}`} className={`${ui.btn} ${ui.btn_secondary} ${ui.btn_sm}`}>
              פתח לקוח קיים
            </Link>
          </li>
        ))}
      </ul>
      <div className={s.duplicateActions}>
        {/* The submit button carries the confirmed phone|email key; the server
            re-checks if the contact details changed since the warning. */}
        <Button
          type="submit"
          name="confirmDuplicateKey"
          value={state.duplicateKey}
          variant="secondary"
          size="sm"
          disabled={pending}
        >
          {editing ? 'שמור בכל זאת' : 'צור בכל זאת'}
        </Button>
      </div>
    </div>
  )
}
