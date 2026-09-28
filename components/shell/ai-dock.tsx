import { IconSend, IconSignal, IconX } from '@/components/ui/icons'
import { Kbd } from '@/components/ui/text'
import s from './shell.module.css'

// AI dock foundation (DESIGN_SYSTEM.md §13). The layout, context chip and
// composer are in place; the assistant itself is not connected yet.
// Agents will act through server-side tools with explicit permissions and
// never through the Owner's session — every action they propose will need
// the Owner's approval.

export function AiDock({ contextLabel, onToggle }: { contextLabel: string; onToggle: () => void }) {
  return (
    <aside className={s.dock} aria-label="עוזר AI">
      <button type="button" className={s.dockCollapsed} onClick={onToggle} aria-label="פתח עוזר AI">
        <IconSignal size={16} className={s.aiGlyph} />
      </button>

      <div className={s.dockBody}>
        <header className={s.dockHead}>
          <IconSignal size={14} className={s.aiGlyph} />
          <span className={s.dockTitle}>עוזר</span>
          <span className={s.dockSub}>לא מחובר</span>
          <Kbd>⌘J</Kbd>
          <button type="button" className={s.iconBtn} onClick={onToggle} aria-label="סגור עוזר">
            <IconX size={15} />
          </button>
        </header>

        <div className={s.dockThread}>
          <div className={s.aiNote}>
            <p className={s.aiNoteTitle}>העוזר עדיין לא מחובר</p>
            <p>
              כאן יעבדו סוכני ה-AI של המועדון: קבלה, מכירות, שימור, שיווק, תוכן ואנליסט. כל סוכן יפעל רק דרך
              כלים מוגדרים בצד השרת, עם הרשאות מפורשות.
            </p>
            <p>כל פעולה שסוכן ירצה לבצע תוצג כהצעה, ותתבצע רק אחרי אישור שלך.</p>
          </div>
        </div>

        <div className={s.composer}>
          <div className={s.composerBox}>
            <span className={s.contextChip}>הקשר: {contextLabel}</span>
            <textarea
              className={s.composerInput}
              rows={2}
              placeholder="העוזר יחובר בשלב הבא"
              disabled
              aria-label="הודעה לעוזר"
            />
            <div className={s.composerFoot}>
              <span className={s.composerHint}>
                <Kbd>⏎</Kbd> שליחה
              </span>
              <button type="button" className={s.sendBtn} aria-label="שלח" disabled>
                <IconSend size={14} className="mirror" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
