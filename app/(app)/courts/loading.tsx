import type { CSSProperties } from 'react'
import s from '@/components/courts/courts.module.css'

// Board-shaped skeleton (8 courts, 06:00–24:00) so the layout doesn't jump.
const COURTS = 8
const SHAPES = [
  [60, 90],
  [240, 120],
  [480, 90],
  [720, 120],
]

export default function CourtsLoading() {
  return (
    <div className={s.page} aria-busy="true" aria-label="טוען לוח מגרשים">
      <div className={s.toolbar}>
        <span className={s.skel} style={{ width: 220, height: 32 }} />
        <span className={s.skel} style={{ width: 260, height: 14, marginInlineStart: 'auto' }} />
      </div>
      <div className={s.board} style={{ '--courts': COURTS, '--range-start': 360, '--range-end': 1440 } as CSSProperties}>
        <div className={s.boardGrid}>
          <div className={s.corner} />
          {Array.from({ length: COURTS }, (_, i) => (
            <div key={i} className={s.courtHead}>
              <span className={s.skel} style={{ width: 56, height: 10 }} />
            </div>
          ))}
          <div className={s.axis} />
          {Array.from({ length: COURTS }, (_, i) => (
            <div key={i} className={s.column}>
              {SHAPES.map(([top, h], j) => (
                <span
                  key={j}
                  className={s.skel}
                  style={{ position: 'absolute', insetInline: 4, top: `calc(${top + ((i * 37) % 90)} * var(--px))`, height: `calc(${h} * var(--px))` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
