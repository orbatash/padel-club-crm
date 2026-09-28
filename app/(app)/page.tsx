import type { Metadata } from 'next'
import { requireOwner } from '@/lib/auth'
import { EmptyState, Panel, PanelGrid } from '@/components/ui/primitives'
import { IconBag, IconChat, IconCourt, IconSignal, IconUsers } from '@/components/ui/icons'
import s from './today.module.css'

export const metadata: Metadata = { title: 'היום' }

// "Today" control center. The widget slots follow DESIGN_SYSTEM.md §15; each
// shows a first-run empty state until its data source is connected.
export default async function TodayPage() {
  await requireOwner()

  return (
    <>
      <div className={s.briefing}>
        <IconSignal size={14} className={s.briefingGlyph} />
        <p>
          <strong>המערכת מוכנה.</strong> חבר את מקורות הנתונים של המועדון, והמסך הזה יתחיל להראות מה דורש
          את תשומת הלב שלך, איפה יש הזדמנויות, ומה הסוכנים מציעים לעשות.
        </p>
      </div>

      <PanelGrid>
        <Panel title="ממתינים לך" span={5}>
          <EmptyState
            icon={<IconChat size={18} />}
            title="אין עדיין תיבת הודעות"
            text="שיחות WhatsApp ו-Instagram, תשלומים שנכשלו והצעות AI יופיעו כאן לפי דחיפות."
          />
        </Panel>
        <Panel title="מגרשים" scope="היום" span={7}>
          <EmptyState
            icon={<IconCourt size={18} />}
            title="LAZUZ לא מחובר"
            text="אחרי החיבור יוצגו כאן תפוסה חיה וחלונות פנויים שאפשר למלא."
          />
        </Panel>
        <Panel title="בסיכון נטישה" span={6}>
          <EmptyState
            icon={<IconUsers size={18} />}
            title="אין מספיק היסטוריה"
            text="זיהוי נטישה מתחיל אחרי שהזמנות מ-LAZUZ יתחילו להיאסף."
          />
        </Panel>
        <Panel title="חנות" scope="Shopify" span={6}>
          <EmptyState
            icon={<IconBag size={18} />}
            title="Shopify לא מחובר"
            text="הזמנות, תשלומים ומלאי יופיעו כאן אחרי החיבור."
          />
        </Panel>
      </PanelGrid>
    </>
  )
}
