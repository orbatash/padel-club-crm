import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import s from './ui.module.css'

export type Tone = 'neutral' | 'live' | 'warn' | 'risk' | 'info' | 'ai'

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${s.chip} ${s[`chip_${tone}`]}`}>{children}</span>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `ai` is reserved for actions that approve or trigger AI work (§1.4). */
  variant?: 'primary' | 'secondary' | 'ghost' | 'ai' | 'danger'
  size?: 'md' | 'sm'
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [s.btn, s[`btn_${variant}`], size === 'sm' && s.btn_sm, block && s.btn_block, className]
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...props} />
}

/** 12-column hairline grid. Children are <Panel span={…}>. */
export function PanelGrid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>
}

export function Panel({
  title,
  scope,
  meta,
  actions,
  span = 12,
  standalone,
  children,
}: {
  title: string
  scope?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  /** Columns out of 12 inside a PanelGrid. */
  span?: number
  /** A single panel outside a PanelGrid gets its own border. */
  standalone?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`${s.panel} ${standalone ? s.standalone : ''}`}
      style={{ '--span': span } as CSSProperties}
    >
      <header className={s.panelHead}>
        <h2 className={s.panelTitle}>{title}</h2>
        {scope && <span className={s.panelScope}>{scope}</span>}
        <span className={s.panelMeta}>{meta}</span>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** One line what, one line why, one action (§16). No illustrations. */
export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{icon}</span>
      <div>
        <p className={s.emptyTitle}>{title}</p>
        <p className={s.emptyText}>{text}</p>
        {action && <div className={s.emptyAction}>{action}</div>}
      </div>
    </div>
  )
}

export const ui = s
