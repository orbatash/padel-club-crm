'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { IconForward } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import { describeDay, nextDay, previousDay } from '@/lib/courts/day'
import s from './courts.module.css'

/** Previous / next day, a date picker and "today". The day lives in the URL (?date=). */
export function DayNav({ date, today }: { date: string; today: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { weekday, short } = describeDay(date)
  const href = (d: string) => (d === today ? '/courts' : `/courts?date=${d}`)

  return (
    <div className={`${s.dayNav} ${pending ? s.pending : ''}`}>
      {/* RTL: "previous" points to the right (inline-start) */}
      <Link href={href(previousDay(date))} className={s.navBtn} aria-label="היום הקודם" scroll={false}>
        <IconForward size={15} />
      </Link>
      <div className={s.dayLabel} aria-live="polite">
        <strong>{date === today ? 'היום' : weekday}</strong>
        <span>
          {date === today ? `${weekday} · ` : ''}
          <Num>{short}</Num>
        </span>
      </div>
      <Link href={href(nextDay(date))} className={s.navBtn} aria-label="היום הבא" scroll={false}>
        <IconForward size={15} className="mirror" />
      </Link>
      <input
        type="date"
        className={s.dateInput}
        value={date}
        dir="ltr"
        aria-label="בחירת תאריך"
        onChange={(e) => {
          const value = e.target.value
          if (!value) return
          startTransition(() => router.push(href(value), { scroll: false }))
        }}
      />
      <Link href="/courts" className={`${s.todayLink} ${date === today ? s.todayLinkActive : ''}`} scroll={false}>
        היום
      </Link>
    </div>
  )
}
