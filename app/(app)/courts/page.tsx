import type { Metadata } from 'next'
import { requireOwner } from '@/lib/auth'
import { getCourtsDay } from '@/lib/courts/data'
import { clubToday, resolveDay } from '@/lib/courts/day'
import { formatDateTime } from '@/lib/customers/labels'
import { EmptyState, Panel } from '@/components/ui/primitives'
import { IconCourt } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import { CourtSchedule, OccupancyLegend } from '@/components/courts/court-schedule'
import { DayNav } from '@/components/courts/day-nav'
import s from '@/components/courts/courts.module.css'

export const metadata: Metadata = { title: 'מגרשים והזמנות' }

// Read-only court schedule from synced LAZUZ data. No writes of any kind.
export default async function CourtsPage({ searchParams }: PageProps<'/courts'>) {
  await requireOwner()
  const now = new Date()
  const today = clubToday(now)
  const date = resolveDay((await searchParams).date, now)
  const { schedule, coverage } = await getCourtsDay(date)

  if (!coverage.hasSyncedData || schedule.courts.length === 0) {
    return (
      <div className={s.page}>
        <div className={s.toolbar}>
          <DayNav date={date} today={today} />
        </div>
        <Panel title="מגרשים" standalone>
          <EmptyState
            icon={<IconCourt size={18} />}
            title="עדיין לא סונכרנו נתונים מ-LAZUZ"
            text="אחרי סנכרון ראשון מ-LAZUZ, לוח המגרשים וההזמנות יופיע כאן."
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.toolbar}>
        <DayNav date={date} today={today} />
        <OccupancyLegend totals={schedule.totals} />
      </div>

      {!coverage.dayCovered ? (
        <p className={`${s.notice} ${s.noticeWarn}`} role="status">
          היום הזה עדיין לא סונכרן מ-LAZUZ, ולכן ייתכן שחסרות הזמנות.
          {coverage.lastSyncAt && (
            <>
              {' '}
              סנכרון אחרון: <Num>{formatDateTime(coverage.lastSyncAt)}</Num>
            </>
          )}
        </p>
      ) : schedule.isEmpty ? (
        <p className={`${s.notice} ${s.noticeInfo}`} role="status">
          אין הזמנות ביום זה. כל המגרשים פנויים.
        </p>
      ) : null}

      <CourtSchedule schedule={schedule} nowIso={now.toISOString()} isToday={date === today} />

      {coverage.dayCovered && coverage.lastSyncAt && (
        <p className={s.summary} style={{ marginInlineStart: 0 }}>
          נתונים מ-LAZUZ · סנכרון אחרון <Num>{formatDateTime(coverage.lastSyncAt)}</Num>
        </p>
      )}
    </div>
  )
}
