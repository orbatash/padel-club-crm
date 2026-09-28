'use client'

import { Button, EmptyState, Panel } from '@/components/ui/primitives'
import { IconX } from '@/components/ui/icons'

// Unexpected failures in the Customers module (network, database). Expected
// cases — validation, duplicates, conflicts — are handled inline by the form.
export default function CustomersError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Panel title="לקוחות" standalone>
      <EmptyState
        icon={<IconX size={18} />}
        title="משהו השתבש בטעינת הנתונים"
        text="ייתכן שיש בעיית חיבור. הנתונים שלך לא נפגעו."
        action={
          <Button variant="secondary" size="sm" onClick={() => retry()}>
            נסה שוב
          </Button>
        }
      />
    </Panel>
  )
}
