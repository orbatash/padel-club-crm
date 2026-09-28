import Link from 'next/link'
import { EmptyState, Panel, ui } from '@/components/ui/primitives'
import { IconUsers } from '@/components/ui/icons'

export default function CustomerNotFound() {
  return (
    <Panel title="לקוח לא נמצא" standalone>
      <EmptyState
        icon={<IconUsers size={18} />}
        title="הלקוח הזה לא קיים"
        text="ייתכן שהקישור שגוי. לקוחות לא נמחקים מהמערכת, אז כדאי לחפש גם בארכיון."
        action={
          <Link href="/customers" className={`${ui.btn} ${ui.btn_secondary} ${ui.btn_sm}`}>
            לרשימת הלקוחות
          </Link>
        }
      />
    </Panel>
  )
}
