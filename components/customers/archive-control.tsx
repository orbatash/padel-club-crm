'use client'

import { useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { archiveCustomer } from '@/app/(app)/customers/actions'
import { Button } from '@/components/ui/primitives'
import s from './archive-control.module.css'

function ConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? 'מעביר…' : 'העבר לארכיון'}
    </Button>
  )
}

/** Archive with an explicit confirmation step (native <dialog>, focus-trapped). */
export function ArchiveControl({ id, name }: { id: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <Button variant="ghost" onClick={() => dialogRef.current?.showModal()}>
        העברה לארכיון
      </Button>
      <dialog
        ref={dialogRef}
        className={s.dialog}
        aria-labelledby={`archive-title-${id}`}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <form action={archiveCustomer} className={s.body}>
          <input type="hidden" name="id" value={id} />
          <h2 id={`archive-title-${id}`} className={s.title}>
            להעביר את {name} לארכיון?
          </h2>
          <p className={s.text}>
            הלקוח יוסתר מרשימת הלקוחות. שום מידע לא נמחק, ואפשר לשחזר אותו בכל רגע מתוך הארכיון.
          </p>
          <div className={s.actions}>
            <ConfirmButton />
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              ביטול
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
