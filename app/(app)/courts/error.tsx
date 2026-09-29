'use client'

import { Button, EmptyState, Panel } from '@/components/ui/primitives'
import { IconX } from '@/components/ui/icons'

export default function CourtsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Panel title="מגרשים" standalone>
      <EmptyState
        icon={<IconX size={18} />}
        title="טעינת לוח המגרשים נכשלה"
        text="ייתכן שיש בעיית חיבור. הנתונים לא נפגעו."
        action={
          <Button variant="secondary" size="sm" onClick={() => retry()}>
            נסה שוב
          </Button>
        }
      />
    </Panel>
  )
}
