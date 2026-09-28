import type { Metadata } from 'next'
import { BrandMark } from '@/components/ui/brand-mark'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'התחברות' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, error } = await searchParams

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
      <div className="w-full max-w-[360px] overflow-hidden rounded-2 border border-line bg-surface-1">
        <header className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <BrandMark size={32} />
          <div>
            <h1 className="text-title font-semibold text-fg-1">Padel Club CRM</h1>
            <p className="text-meta text-fg-3">כניסת בעלים</p>
          </div>
        </header>
        <div className="px-5 py-5">
          <LoginForm
            next={typeof next === 'string' ? next : undefined}
            notice={error === 'unauthorized' ? 'החשבון הזה אינו מורשה לגשת למערכת.' : undefined}
          />
        </div>
      </div>
    </main>
  )
}
