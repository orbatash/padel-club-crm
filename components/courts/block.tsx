import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Num } from '@/components/ui/text'
import { formatMinutes } from '@/lib/courts/day'
import { OCCUPANCY_LABELS, STATUS_LABELS, type ScheduleBlock } from '@/lib/courts/schedule'
import s from './courts.module.css'

// Booking block shared by the desktop board (server) and the mobile timeline
// (client), so both use the same visual language. No server-only imports.

const priceFormat = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 })
export const formatPrice = (price: number) => `${priceFormat.format(price)} ₪`

export function timeRange(block: ScheduleBlock) {
  const start = block.continuesBefore ? `‹${formatMinutes(0)}` : formatMinutes(block.startMin)
  const end = block.continuesAfter ? `${formatMinutes(24 * 60)}›` : formatMinutes(block.endMin)
  return `${start}–${end}`
}

export function BlockTags({ block }: { block: ScheduleBlock }) {
  const tags: ReactNode[] = []
  if (block.match === 'unmatched') tags.push(<span key="m" className={`${s.tag} ${s.tag_warn}`}>לא מזוהה</span>)
  if (block.match === 'ambiguous') tags.push(<span key="m" className={`${s.tag} ${s.tag_warn}`}>כמה התאמות</span>)
  const status = block.status ? STATUS_LABELS[block.status] : null
  if (status && block.status !== 'confirmed') {
    tags.push(<span key="s" className={`${s.tag} ${s[`tag_${status.tone}`]}`}>{status.label}</span>)
  }
  if (block.isRecurring) tags.push(<span key="r" className={`${s.tag} ${s.tag_neutral}`}>קבוע</span>)
  return tags.length ? <span className={s.blockTags}>{tags}</span> : null
}

function blockTitle(block: ScheduleBlock) {
  const parts = [OCCUPANCY_LABELS[block.occupancyType], block.label, timeRange(block)]
  if (block.status) parts.push(STATUS_LABELS[block.status]?.label ?? block.status)
  if (block.price) parts.push(formatPrice(block.price))
  return parts.join(' · ')
}

export function BlockShell({ block, className, style, children }: { block: ScheduleBlock; className: string; style?: CSSProperties; children: ReactNode }) {
  return block.customerId ? (
    <Link href={`/customers/${block.customerId}`} className={className} style={style} title={blockTitle(block)}>
      {children}
    </Link>
  ) : (
    <div className={className} style={style} title={blockTitle(block)}>
      {children}
    </div>
  )
}

/** A block absolutely positioned on a time column (uses the column's --px scale). */
export function TimelineBlock({ block, rangeStart }: { block: ScheduleBlock; rangeStart: number }) {
  const duration = block.endMin - block.startMin
  const size = duration < 40 ? s.tiny : duration < 75 ? s.compact : ''
  const laned = block.laneCount > 1
  const style: CSSProperties = {
    top: `calc(${block.startMin - rangeStart} * var(--px))`,
    height: `calc(${duration} * var(--px) - 2px)`,
    insetInlineStart: `calc(${block.lane} * (100% / ${block.laneCount}))`,
    width: `calc(100% / ${block.laneCount} - 4px)`,
  }
  const unmatched = block.match === 'unmatched' || block.match === 'ambiguous'
  const classes = [s.block, s[`type_${block.occupancyType}`], unmatched ? s.unmatched : '', size, laned ? s.laned : '']
  return (
    <BlockShell block={block} className={classes.join(' ')} style={style}>
      <span className={s.blockTime}>
        <Num>{laned ? timeRange(block).split('–')[0] : timeRange(block)}</Num>
        {block.price ? (
          <span className={s.blockPrice}>
            <Num>{formatPrice(block.price)}</Num>
          </span>
        ) : null}
      </span>
      <span className={s.blockLabel}>{block.label}</span>
      <BlockTags block={block} />
    </BlockShell>
  )
}
