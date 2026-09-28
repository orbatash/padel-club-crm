'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth'
import { isOwnerEmail } from '@/lib/owner'

const INVALID_CREDENTIALS = 'אימייל או סיסמה שגויים'

export type LoginState = { error?: string } | undefined

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return { error: 'יש להזין אימייל וסיסמה' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  // Generic message in both cases — never reveal whether an account exists
  // or that it exists but is not the Owner.
  if (error) {
    return { error: INVALID_CREDENTIALS }
  }
  if (!isOwnerEmail(data.user?.email)) {
    await supabase.auth.signOut()
    return { error: INVALID_CREDENTIALS }
  }

  redirect(safeRedirectPath(formData.get('next')))
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
