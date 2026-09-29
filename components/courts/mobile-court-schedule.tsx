'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { IconForward } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import { formatMinutes } from '@/lib/courts/day'
import {
  FALLBACK_LABELS,
  OCCUPANCY_LABELS,
  STATUS_LABELS,
  courtAgenda,
  courtStatus,
  type AgendaItem,
  type DaySchedule,
  type ScheduleBlock,
} from '@/lib/courts/schedule'
import { BlockShell, formatPrice, timeRange } from './block'
import s from './courts.module.css'

// Phone layout (< 760px), operations first: ONE court at a time. A sticky
// court selector, the court name with one "next / free" line, then the day as
// a vertical list — bookings (time range dominant) and meaningful free
// windows (≥ 30 min) between them. Only the already-loaded schedule is used;
// no extra requests. Desktop keeps the time-grid board.

const SWIPE_MIN_PX = 50

type FreeItem = Extract<AgendaItem, { kind: 'free' }>

export function MobileCourtSchedule({ schedule, nowMin }: { schedule: DaySchedule; nowMin: number | null }) {
  const { courts, rangeStartMin: start, rangeEndMin: end } = schedule
  const [selectedId, setSelectedId] = useState(courts[0]?.id ?? '')
  const tabsRef = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const index = Math.max(0, courts.findIndex((c) => c.id === selectedId))
  const court = courts[index]

  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index])

  if (!court) return null

  const select = (i: number) => {
    const next = courts[Math.min(courts.length - 1, Math.max(0, i))]
    if (next) setSelectedId(next.id)
  }

  // RTL: the next court sits to the left, so a finger moving right reveals it.
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    const t = touch.current
    touch.current = null
    if (!t) return
    const dx = e.changedTouches[0].clientX - t.x
    const dy = e.changedTouches[0].clientY - t.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    select(index + (dx > 0 ? 1 : -1))
  }

  const agenda = courtAgenda(court, start, end, nowMin)
  // Today: a thin "now" line before the first upcoming item — unless now falls
  // inside an item, which is then marked as current instead.
  const hasCurrent = agenda.some((i) => i.timing === 'current')
  const nowLineAt = nowMin === null || hasCurrent ? -1 : agenda.findIndex((i) => i.timing === 'upcoming')
  const nowLineAtEnd = nowMin !== null && !hasCurrent && nowLineAt === -1 && nowMin >= start && nowMin <= end

  return (
    <div className={s.mobile}>
      <div className={s.mSwitcher} role="tablist" aria-label="בחירת מגרש" ref={tabsRef}>
        {courts.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            id={`court-tab-${c.id}`}
            aria-selected={i === index}
            aria-controls="court-day"
            tabIndex={i === index ? 0 : -1}
            className={`${s.mTab} ${i === index ? s.mTabActive : ''}`}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              // RTL tablist: ArrowLeft moves to the next court.
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                const to = index + (e.key === 'ArrowLeft' ? 1 : -1)
                select(to)
                tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[Math.min(courts.length - 1, Math.max(0, to))]?.focus()
              }
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <section
        id="court-day"
        role="tabpanel"
        aria-labelledby={`court-tab-${court.id}`}
        className={s.mDay}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <header className={s.mHead}>
          <h2 className={s.mCourtName}>{court.name}</h2>
          {court.blocks.length > 0 && <CourtSummary court={court} start={start} end={end} nowMin={nowMin} />}
        </header>

        {court.blocks.length === 0 ? (
          <div className={s.mEmpty}>
            <strong>פנוי כל היום</strong>
            <span>
              <Num>{`${formatMinutes(start)}–${formatMinutes(end)}`}</Num>
            </span>
          </div>
        ) : (
          <ol className={s.mList}>
            {agenda.map((item, i) => (
              <Fragment key={item.kind === 'booking' ? item.block.id : `free-${item.startMin}`}>
                {i === nowLineAt && <NowLine nowMin={nowMin!} />}
                <li>{item.kind === 'booking' ? <BookingRow block={item.block} timing={item.timing} /> : <FreeRow item={item} />}</li>
              </Fragment>
            ))}
            {nowLineAtEnd && <NowLine nowMin={nowMin!} />}
          </ol>
        )}
      </section>
    </div>
  )
}

/** One compact line: what's next and when the court is free. */
function CourtSummary({ court, start, end, nowMin }: { court: DaySchedule['courts'][number]; start: number; end: number; nowMin: number | null }) {
  const { nextBooking, nextFree } = courtStatus(court, start, end, nowMin)
  const today = nowMin !== null
  const parts: ReactNode[] = []
  if (nextBooking) {
    parts.push(
      <span key="b">
        {today ? 'הבא' : 'ראשון'} <Num>{formatMinutes(nextBooking.startMin)}</Num>
      </span>
    )
  }
  if (nextFree) {
    const freeNow = today && nextFree.startMin <= nowMin
    parts.push(
      <span key="f">
        {freeNow ? 'פנוי עכשיו עד ' : 'פנוי '}
        <Num>{freeNow ? formatMinutes(nextFree.endMin) : `${formatMinutes(nextFree.startMin)}–${formatMinutes(nextFree.endMin)}`}</Num>
      </span>
    )
  }
  if (!parts.length) return null
  return (
    <p className={s.mSummary}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true" className={s.mDot} />}
          {p}
        </Fragment>
      ))}
    </p>
  )
}

function NowLine({ nowMin }: { nowMin: number }) {
  return (
    <li className={s.mNow} aria-label={`עכשיו ${formatMinutes(nowMin)}`}>
      <span>
        <Num>{formatMinutes(nowMin)}</Num>
      </span>
    </li>
  )
}

function BookingRow({ block, timing }: { block: ScheduleBlock; timing: AgendaItem['timing'] }) {
  const tags: ReactNode[] = []
  // Booking type — skipped when the name already says it (e.g. a block titled "חסום").
  if (block.label !== OCCUPANCY_LABELS[block.occupancyType] && block.label !== FALLBACK_LABELS[block.occupancyType]) {
    tags.push(<span key="t" className={s.mType}>{OCCUPANCY_LABELS[block.occupancyType]}</span>)
  }
  const status = block.status ? STATUS_LABELS[block.status] : null
  if (status && block.status !== 'confirmed') {
    tags.push(<span key="s" className={`${s.tag} ${s[`tag_${status.tone}`]}`}>{status.label}</span>)
  }
  if (block.isRecurring) tags.push(<span key="r" className={`${s.tag} ${s.tag_neutral}`}>קבוע</span>)
  if (block.match === 'unmatched') tags.push(<span key="m" className={`${s.tag} ${s.mMatch}`}>לא מזוהה</span>)
  if (block.match === 'ambiguous') tags.push(<span key="m" className={`${s.tag} ${s.mMatch}`}>כמה התאמות</span>)

  const classes = [s.mRow, s[`mRow_${block.occupancyType}`], timing === 'current' ? s.mCurrent : '', timing === 'past' ? s.mPast : '']

  return (
    <BlockShell block={block} className={classes.join(' ')}>
      <span className={s.mTime}>
        <Num>{timeRange(block)}</Num>
        {timing === 'current' && <span className={s.mNowTag}>עכשיו</span>}
      </span>
      <span className={s.mName}>
        <span className={s.mNameText}>{block.label}</span>
        {block.customerId && <IconForward size={14} className={`mirror ${s.mGo}`} aria-hidden="true" />}
      </span>
      {tags.length > 0 && <span className={s.mTags}>{tags}</span>}
      {block.price ? (
        <span className={s.mPrice}>
          <Num>{formatPrice(block.price)}</Num>
        </span>
      ) : null}
    </BlockShell>
  )
}

function FreeRow({ item }: { item: FreeItem }) {
  return (
    <div className={`${s.mFree} ${item.timing === 'current' ? s.mCurrent : ''} ${item.timing === 'past' ? s.mPast : ''}`}>
      <span className={s.mFreeLabel}>{item.timing === 'current' ? 'פנוי עכשיו' : 'פנוי'}</span>
      <span className={s.mFreeTime}>
        <Num>{`${formatMinutes(item.startMin)}–${formatMinutes(item.endMin)}`}</Num>
      </span>
    </div>
  )
}
