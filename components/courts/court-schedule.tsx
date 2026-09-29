import type { CSSProperties } from 'react'
import { Num } from '@/components/ui/text'
import { clubMinutesOf, formatMinutes } from '@/lib/courts/day'
import { OCCUPANCY_LABELS, type DaySchedule, type OccupancyType } from '@/lib/courts/schedule'
import { TimelineBlock } from './block'
import { MobileCourtSchedule } from './mobile-court-schedule'
import s from './courts.module.css'

// Read-only day schedule. Desktop: courts as columns on a vertical time grid.
// Phone (< 760px): one court at a time with a court switcher (client
// component). Both render from the same already-loaded schedule.

const SWATCH: Record<OccupancyType, CSSProperties> = {
  customer_booking: { background: 'var(--surface-3)', boxShadow: 'inset -2px 0 0 var(--text-1)' },
  internal_booking: { background: 'var(--surface-2)', boxShadow: 'inset -2px 0 0 var(--info)' },
  blocked: { background: 'repeating-linear-gradient(135deg, var(--line-strong) 0 2px, transparent 2px 4px)' },
  unknown: { border: '1px dashed var(--line-strong)' },
}

export function CourtSchedule({ schedule, nowIso, isToday }: { schedule: DaySchedule; nowIso: string; isToday: boolean }) {
  const { rangeStartMin: start, rangeEndMin: end } = schedule
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60)
  const nowMin = isToday ? clubMinutesOf(nowIso) : null
  const showNow = nowMin !== null && nowMin >= start && nowMin <= end

  return (
    <>
      <div
        className={s.board}
        style={{ '--courts': schedule.courts.length, '--range-start': start, '--range-end': end } as CSSProperties}
      >
        <div className={s.boardGrid} role="grid" aria-label="לוח מגרשים">
          <div className={s.corner} />
          {schedule.courts.map((court) => (
            <div key={court.id} className={s.courtHead} role="columnheader">
              <span className={s.courtName}>{court.name}</span>
              <span className={s.courtMeta}>
                {court.blocks.length ? (
                  <>
                    <Num>{court.blocks.length}</Num> הזמנות
                  </>
                ) : (
                  'פנוי'
                )}
              </span>
            </div>
          ))}

          <div className={s.axis} aria-hidden="true">
            {hours.map((h) => (
              <span
                key={h}
                className={`${s.hourLabel} ${h === start ? s.hourLabelFirst : ''}`}
                style={{ top: `calc(${h - start} * var(--px))` }}
              >
                {h < end ? formatMinutes(h) : ''}
              </span>
            ))}
            {showNow && (
              <span className={s.nowTag} style={{ top: `calc(${nowMin! - start} * var(--px) - 7px)` }}>
                {formatMinutes(nowMin!)}
              </span>
            )}
          </div>
          {schedule.courts.map((court) => (
            <div key={court.id} className={s.column} role="gridcell" aria-label={court.name}>
              {showNow && <div className={s.nowLine} style={{ top: `calc(${nowMin! - start} * var(--px))` }} />}
              {court.blocks.map((block) => (
                <TimelineBlock key={block.id} block={block} rangeStart={start} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <MobileCourtSchedule schedule={schedule} nowMin={nowMin} />
    </>
  )
}

export function OccupancyLegend({ totals }: { totals: DaySchedule['totals'] }) {
  const items: OccupancyType[] = ['customer_booking', 'internal_booking', 'blocked', 'unknown']
  return (
    <div className={s.summary} aria-label="סיכום היום">
      {items
        .filter((t) => t !== 'unknown' || totals.unknown > 0)
        .map((t) => (
          <span key={t}>
            <i className={s.swatch} style={SWATCH[t]} />
            {OCCUPANCY_LABELS[t]} <Num>{totals[t]}</Num>
          </span>
        ))}
    </div>
  )
}
