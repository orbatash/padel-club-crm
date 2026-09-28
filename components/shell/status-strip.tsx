import { useSyncExternalStore } from 'react'
import { IconOffline, IconSignal } from '@/components/ui/icons'
import { Num } from '@/components/ui/text'
import s from './shell.module.css'

// Live operational status (DESIGN_SYSTEM.md §9). Only real signals are shown:
// device connectivity now; integrations and agents report "not connected"
// until they exist. Club telemetry (courts, queue) plugs in here later.

const INTEGRATIONS = ['LAZUZ', 'WhatsApp', 'Instagram', 'Shopify']

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function StatusStrip() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )

  return (
    <div className={s.statusStrip} role="status" aria-label="מצב חי">
      {online ? (
        <span className={s.statusItem}>
          <span className={s.liveDot} />
          מקוון
        </span>
      ) : (
        <span className={`${s.statusItem} ${s.statusRisk}`}>
          <IconOffline size={13} />
          אין חיבור
        </span>
      )}
      <span className={s.statusItem} title={INTEGRATIONS.join(' · ')}>
        <span className={s.idleDot} />
        חיבורים <Num>{`0/${INTEGRATIONS.length}`}</Num>
      </span>
      <span className={`${s.statusItem} ${s.statusOptional}`}>
        <IconSignal size={12} />
        <span className={s.statusMuted}>סוכני AI לא פעילים</span>
      </span>
    </div>
  )
}
