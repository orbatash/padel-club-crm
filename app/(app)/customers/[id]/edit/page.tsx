import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOwner } from '@/lib/auth'
import { getCustomer } from '@/lib/customers/data'
import { displayName } from '@/lib/customers/labels'
import { IconForward } from '@/components/ui/icons'
import { CustomerForm } from '@/components/customers/customer-form'
import s from '@/components/customers/customers.module.css'

export const metadata: Metadata = { title: 'עריכת לקוח' }

export default async function EditCustomerPage({ params }: PageProps<'/customers/[id]/edit'>) {
  await requireOwner()
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  return (
    <>
      <div className={s.titleBlock}>
        <Link href={`/customers/${customer.id}`} className={s.backLink}>
          <IconForward size={13} />
          {displayName(customer.fullName)}
        </Link>
        <h2 className={s.title}>עריכת לקוח</h2>
      </div>
      <CustomerForm customer={customer} />
    </>
  )
}
