'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'
import { Button, ui } from '@/components/ui/primitives'

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, formAction, pending] = useActionState(login, undefined)
  const message = state?.error ?? notice
  // Only a failed attempt marks the fields invalid; a notice is informational.
  const invalid = state?.error ? true : undefined

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {next && <input type="hidden" name="next" value={next} />}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>אימייל</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          dir="ltr"
          className={ui.input}
          aria-invalid={invalid}
        />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>סיסמה</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className={ui.input}
          aria-invalid={invalid}
        />
      </label>

      {message && (
        <p role="alert" className={ui.fieldError}>
          {message}
        </p>
      )}

      <Button type="submit" variant="primary" block disabled={pending} className="mt-1">
        {pending ? 'מתחבר…' : 'התחבר'}
      </Button>
    </form>
  )
}
