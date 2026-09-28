import type { Metadata } from 'next'
import Link from 'next/link'
import { requireOwner } from '@/lib/auth'
import { IconForward } from '@/components/ui/icons'
import { CustomerForm } from '@/components/customers/customer-form'
import s from '@/components/customers/customers.module.css'

export const metadata: Metadata = { title: 'לקוח חדש' }

export default async function NewCustomerPage() {
  await requireOwner()

  return (
    <>
      <div className={s.titleBlock}>
        <Link href="/customers" className={s.backLink}>
          <IconForward size={13} />
          לקוחות
        </Link>
        <h2 className={s.title}>לקוח חדש</h2>
      </div>
      <CustomerForm />
    </>
  )
}
