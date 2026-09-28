import type { ReactNode } from 'react'
import s from './ui.module.css'

/** Numbers, prices, percentages, dates, times, phones and IDs inside Hebrew text. */
export function Num({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="num">
      {children}
    </bdi>
  )
}

/** Emails, URLs and other Latin strings that must read left-to-right. */
export function Ltr({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="ltr">
      {children}
    </bdi>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>
}
