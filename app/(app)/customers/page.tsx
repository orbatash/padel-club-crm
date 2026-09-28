import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireOwner } from '@/lib/auth'
import { parseListParams, listParamsToQuery } from '@/lib/customers/search-params'
import { CustomerListView } from '@/components/customers/customer-list-view'
import { CustomerResults, CustomerResultsSkeleton } from '@/components/customers/customer-results'

export const metadata: Metadata = { title: 'לקוחות' }

export default async function CustomersPage({ searchParams }: PageProps<'/customers'>) {
  await requireOwner()
  const params = parseListParams(await searchParams)

  return (
    <CustomerListView params={params}>
      {/* Keyed by the query so a new search/filter shows the skeleton. */}
      <Suspense key={listParamsToQuery(params)} fallback={<CustomerResultsSkeleton />}>
        <CustomerResults params={params} />
      </Suspense>
    </CustomerListView>
  )
}
