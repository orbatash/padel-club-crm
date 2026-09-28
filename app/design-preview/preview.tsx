'use client'

import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import s from './preview.module.css'
import * as I from './icons'
import { THEME_COOKIE, type Theme } from './theme'
import {
  NOW,
  GRID_START_HOUR,
  SLOT_COUNT,
  courts,
  queue,
  conversation,
  replyDraft,
  atRisk,
  weeklyRevenue,
  revenueBands,
  agents,
  type QueueItem,
} from './data'

/* ───────────────────────── Theme ───────────────────────── */

// The theme lives in a cookie so the server renders the right theme on the
// first paint — no flash, no transition from dark to light on load.
function persistTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
}

/* ───────────────────────── Formatting ───────────────────────── */

const intNf = new Intl.NumberFormat('he-IL')
const pctNf = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 0 })
const deltaNf = new Intl.NumberFormat('he-IL', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const decNf = new Intl.NumberFormat('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const ils = (n: number) => `${intNf.format(n)} ₪`
const slotTime = (slot: number) => {
  const minutes = GRID_START_HOUR * 60 + slot * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`
}

/** Any number, price, phone, date, email or ID inside Hebrew text. */
function Num({ children, plain }: { children: ReactNode; plain?: boolean }) {
  return (
    <bdi dir="ltr" className={plain ? s.ltr : s.num}>
      {children}
    </bdi>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>
}

type Tone = 'risk' | 'warn' | 'live' | 'info' | 'ai' | 'neutral'

function Chip({ tone = 'neutral', children, why }: { tone?: Tone; children: ReactNode; why?: string }) {
  return (
    <span className={`${s.chip} ${s[`chip_${tone}`]}`} data-why={why} tabIndex={why ? 0 : undefined}>
      {children}
    </span>
  )
}

function Panel({
  title,
  scope,
  meta,
  actions,
  span,
  className,
  children,
}: {
  title: string
  scope?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  span: 4 | 5 | 6 | 7 | 8 | 12
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`${s.panel} ${s[`span${span}`]} ${className ?? ''}`}>
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

/* ───────────────────────── Page ───────────────────────── */

export function DesignPreview({
  fontClassName,
  initialTheme,
}: {
  fontClassName: string
  initialTheme: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    persistTheme(next)
    setTheme(next)
  }
  // null = automatic (open on wide screens, closed on narrow ones)
  const [dockPref, setDockPref] = useState<boolean | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const toggleDock = () => {
    const effective = dockPref ?? window.matchMedia('(min-width: 1280px)').matches
    setDockPref(!effective)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea')
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setDockPref((p) => !(p ?? window.matchMedia('(min-width: 1280px)').matches))
      } else if (e.key === '/' && !typing) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dockClass = dockPref === null ? s.dockAuto : dockPref ? s.dockOpen : s.dockClosed

  return (
    <div className={`${s.root} ${fontClassName} ${dockClass}`} data-theme={theme}>
      <Rail />
      <TopBar
        theme={theme}
        onTheme={toggleTheme}
        onSearch={() => setPaletteOpen(true)}
        onDock={toggleDock}
      />

      <main className={s.main}>
        <div className={s.mainInner}>
          <Briefing />

          <div className={s.grid}>
            <NeedsYou />
            <LiveCourts />
            <RevenueInsight />
            <AtRiskTable />
            <LoadingPanel />
            <EmptyPanel />
          </div>

          <DesignTokens theme={theme} />
        </div>
      </main>

      <Dock onToggle={toggleDock} />

      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} onAskAi={() => setDockPref(true)} />}
    </div>
  )
}

/* ───────────────────────── Rail ───────────────────────── */

type RailItem = {
  icon: typeof I.IconToday
  tip: string
  keys: string
  active?: boolean
  mobile?: boolean
  badge?: number
}

const railGroups: { label: string; items: RailItem[] }[] = [
  {
    label: 'תפעול',
    items: [
      { icon: I.IconToday, tip: 'היום', keys: 'G T', active: true, mobile: true },
      { icon: I.IconCourt, tip: 'מגרשים והזמנות', keys: 'G C' },
      { icon: I.IconInbox, tip: 'תיבת הודעות', keys: 'G M', badge: 3, mobile: true },
      { icon: I.IconUsers, tip: 'לקוחות', keys: 'G U' },
    ],
  },
  {
    label: 'צמיחה',
    items: [
      { icon: I.IconTarget, tip: 'לידים', keys: 'G L', mobile: true },
      { icon: I.IconMegaphone, tip: 'קמפיינים', keys: 'G P' },
      { icon: I.IconPen, tip: 'תוכן', keys: 'G W' },
      { icon: I.IconBag, tip: 'חנות', keys: 'G S' },
    ],
  },
  {
    label: 'תובנות',
    items: [
      { icon: I.IconInsights, tip: 'תובנות', keys: 'G I', mobile: true },
      { icon: I.IconAgents, tip: 'סוכני AI', keys: 'G A' },
      { icon: I.IconReports, tip: 'דוחות', keys: 'G R' },
    ],
  },
]

function Rail() {
  return (
    <nav className={s.rail} aria-label="ניווט ראשי">
      <div className={s.brand} aria-label="Padel Club OS">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <circle cx="16" cy="16" r="11" fill="var(--optic)" />
          <path
            d="M7.6 9.2c4.6 1.6 6.9 4.1 6.9 6.8s-2.3 5.2-6.9 6.8M24.4 9.2c-4.6 1.6-6.9 4.1-6.9 6.8s2.3 5.2 6.9 6.8"
            fill="none"
            stroke="var(--on-optic)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {railGroups.map((group) => (
        <div key={group.label} className={s.railGroup}>
          <span className={s.railLabel}>{group.label}</span>
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.tip}
                type="button"
                className={`${s.railBtn} ${item.active ? s.railBtnActive : ''} ${item.mobile ? s.railMobile : ''}`}
                aria-label={item.tip}
                aria-current={item.active ? 'page' : undefined}
              >
                <Icon size={18} />
                {item.badge && <span className={s.railBadge}>{item.badge}</span>}
                <span className={s.tip} role="tooltip">
                  {item.tip}
                  <Kbd>{item.keys}</Kbd>
                </span>
              </button>
            )
          })}
        </div>
      ))}

      <div className={s.railFoot}>
        <span className={s.avatar} title="בעלים">ב</span>
      </div>
    </nav>
  )
}

/* ───────────────────────── Top bar ───────────────────────── */

function TopBar({
  theme,
  onTheme,
  onSearch,
  onDock,
}: {
  theme: Theme
  onTheme: () => void
  onSearch: () => void
  onDock: () => void
}) {
  return (
    <header className={s.topbar}>
      <div className={s.titleBlock}>
        <h1 className={s.pageTitle}>היום</h1>
        <span className={s.titleContext}>
          יום א׳ · <Num>27.09.26</Num>
        </span>
      </div>

      <div className={s.statusStrip} role="status" aria-label="מצב חי">
        <button type="button" className={s.statusItem}>
          <span className={s.liveDot} />
          <Num>5/6</Num> מגרשים במשחק
        </button>
        <button type="button" className={`${s.statusItem} ${s.statusWarn}`}>
          <Num>3</Num> ממתינים לך
          <span className={s.statusSub}>
            הוותיק <Num>22</Num> ד׳
          </span>
        </button>
        <button type="button" className={`${s.statusItem} ${s.statusAi} ${s.statusOptional}`}>
          <I.IconSignal size={12} />
          <Num>2</Num> הצעות AI
        </button>
        <button type="button" className={`${s.statusItem} ${s.statusOptional}`}>
          חנות <Num>{ils(1860)}</Num>
          <span className={s.statusSub}>
            <Num>4</Num> הזמנות
          </span>
        </button>
      </div>

      <div className={s.topActions}>
        <button type="button" className={s.searchTrigger} onClick={onSearch}>
          <I.IconSearch size={15} />
          <span className={s.searchText}>חיפוש או פקודה</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button type="button" className={s.iconBtn} aria-label="התראות">
          <I.IconBell />
          <span className={s.bellDot} />
        </button>
        <button
          type="button"
          className={s.iconBtn}
          onClick={onTheme}
          aria-label={theme === 'dark' ? 'מעבר לערכת יום' : 'מעבר לערכת לילה'}
        >
          {theme === 'dark' ? <I.IconSun /> : <I.IconMoon />}
        </button>
        <button type="button" className={`${s.iconBtn} ${s.dockToggle}`} onClick={onDock} aria-label="עוזר AI (⌘J)">
          <I.IconDock />
        </button>
      </div>
    </header>
  )
}

/* ───────────────────────── Briefing ───────────────────────── */

function Briefing() {
  return (
    <div className={s.briefing}>
      <I.IconSignal size={14} className={s.briefingGlyph} />
      <p>
        <strong>ערב עמוס, עם חור אחד.</strong> <Num>5</Num> מתוך <Num>6</Num> מגרשים במשחק, אבל אחרי{' '}
        <Num>20:00</Num> יש <strong>שלושה מגרשים ריקים</strong> ו-<Num>11</Num> שחקנים קבועים שעוד לא הזמינו.{' '}
        <Num>2</Num> החלטות מחכות לך.
      </p>
      <span className={s.previewTag}>תצוגה מקדימה · נתוני דוגמה</span>
    </div>
  )
}

/* ───────────────────────── Needs you ───────────────────────── */

const sourceIcon: Record<QueueItem['source'], typeof I.IconChat> = {
  whatsapp: I.IconChat,
  instagram: I.IconCamera,
  store: I.IconBag,
}
const sourceName: Record<QueueItem['source'], string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  store: 'Shopify',
}

function NeedsYou() {
  const [active, setActive] = useState('q1')

  return (
    <Panel
      title="ממתינים לך"
      scope={<Num>3</Num>}
      meta={<>מיון לפי דחיפות</>}
      span={5}
      className={s.needsYou}
    >
      <ul className={s.queue}>
        {queue.map((item) => {
          const Icon = sourceIcon[item.source]
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`${s.queueItem} ${active === item.id ? s.queueItemActive : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className={s.sourceIcon} title={sourceName[item.source]}>
                  <Icon size={14} />
                </span>
                <span className={s.queueMain}>
                  <span className={s.queueTop}>
                    <span className={s.queueName}>{item.name}</span>
                    {item.chip && <Chip tone={item.chip.tone}>{item.chip.label}</Chip>}
                  </span>
                  <span className={s.queuePreview}>{item.preview}</span>
                </span>
                <span className={`${s.wait} ${item.waitMin >= 20 ? s.waitRisk : item.waitMin >= 10 ? s.waitWarn : ''}`}>
                  <Num>{item.waitMin}</Num> ד׳
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className={s.thread}>
        <div className={s.threadHead}>
          <span className={s.threadName}>נועה לוי</span>
          <Num plain>
            <span className={s.threadPhone}>050-742-1183</span>
          </Num>
          <Num plain>
            <span className={s.threadEmail}>noa.levi@example.com</span>
          </Num>
          <Chip tone="neutral">
            <Num>14</Num> ביקורים
          </Chip>
          <span className={s.threadMeta}>
            <I.IconChat size={12} /> WhatsApp
          </span>
        </div>

        <div className={s.messages}>
          {conversation.map((m, i) => (
            <div key={i} className={`${s.bubble} ${m.from === 'customer' ? s.bubbleIn : s.bubbleOut}`}>
              {m.text}
              <span className={s.bubbleTime}>
                <Num>{m.time}</Num>
              </span>
            </div>
          ))}
        </div>

        <Proposal
          agent="סוכן קבלה"
          when="לפני דקה"
          confidence={3}
          body={replyDraft}
          quote
          basis={
            <>
              זמינות LAZUZ · מחירון ערב · <Num>14</Num> ביקורים קודמים
            </>
          }
          approveLabel="אשר ושלח"
          doneLabel={
            <>
              נשלח לנועה לוי · <Num>18:43</Num> · אושר על ידך
            </>
          }
        />
      </div>
    </Panel>
  )
}

/* ───────────────────────── Proposal ───────────────────────── */

type ProposalState = 'pending' | 'editing' | 'approved' | 'rejected'

function Proposal({
  agent,
  when,
  confidence,
  body,
  basis,
  approveLabel,
  doneLabel,
  impact,
  quote,
}: {
  agent: string
  when: string
  confidence: 1 | 2 | 3
  body: string
  basis: ReactNode
  approveLabel: string
  doneLabel: ReactNode
  impact?: ReactNode
  quote?: boolean
}) {
  const [state, setState] = useState<ProposalState>('pending')
  const [text, setText] = useState(body)
  const confidenceLabel = ['', 'אמינות נמוכה', 'אמינות בינונית', 'אמינות גבוהה'][confidence]

  return (
    <div className={`${s.proposal} ${state === 'rejected' ? s.proposalRejected : ''} ${state === 'approved' ? s.proposalApproved : ''}`}>
      <div className={s.proposalHead}>
        <I.IconSignal size={13} className={s.aiGlyph} />
        <span className={s.proposalAgent}>{agent}</span>
        <span className={s.proposalWhen}>· {when}</span>
        <span className={s.confidence} title={confidenceLabel}>
          <span className={s.confBars} aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <i key={n} className={n <= confidence ? s.confOn : ''} />
            ))}
          </span>
          {confidenceLabel}
        </span>
      </div>

      {state === 'editing' ? (
        <textarea
          className={s.proposalEdit}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
        />
      ) : (
        <p className={`${s.proposalBody} ${quote ? s.proposalQuote : ''}`}>{text}</p>
      )}

      {state !== 'editing' && (
        <div className={s.proposalBasis}>
          <span>מבוסס על: {basis}</span>
          {impact && <span className={s.proposalImpact}>{impact}</span>}
        </div>
      )}

      <div className={s.proposalActions}>
        {state === 'pending' && (
          <>
            <button type="button" className={`${s.btn} ${s.btnAi}`} onClick={() => setState('approved')}>
              <I.IconCheck size={14} />
              {approveLabel}
            </button>
            <button type="button" className={`${s.btn} ${s.btnSecondary}`} onClick={() => setState('editing')}>
              <I.IconPen size={14} />
              ערוך
            </button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setState('rejected')}>
              <I.IconX size={14} />
              דחה
            </button>
            <button type="button" className={s.linkBtn}>
              תצוגה מקדימה
              <I.IconForward size={13} className={s.mirror} />
            </button>
          </>
        )}
        {state === 'editing' && (
          <>
            <button type="button" className={`${s.btn} ${s.btnAi}`} onClick={() => setState('approved')}>
              <I.IconCheck size={14} />
              שמור ו{approveLabel}
            </button>
            <button
              type="button"
              className={`${s.btn} ${s.btnGhost}`}
              onClick={() => {
                setText(body)
                setState('pending')
              }}
            >
              ביטול
            </button>
          </>
        )}
        {state === 'approved' && (
          <>
            <span className={s.outcome}>
              <I.IconCheck size={14} className={s.outcomeOk} />
              {doneLabel}
            </span>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setState('pending')}>
              בטל
            </button>
          </>
        )}
        {state === 'rejected' && (
          <>
            <span className={s.outcome}>נדחה · הסוכן ילמד מההחלטה</span>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setState('pending')}>
              בטל
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── Live courts ───────────────────────── */

type Cell =
  | { kind: 'booking'; start: number; len: number; label: string; phase: 'past' | 'live' | 'next' }
  | { kind: 'gap'; start: number; len: number; opportunity: boolean }

function courtCells(bookings: { start: number; len: number; label: string }[]): Cell[] {
  const nowSlot = (NOW.hour - GRID_START_HOUR) * 2
  const taken = new Array(SLOT_COUNT).fill(false)
  bookings.forEach((b) => {
    for (let i = b.start; i < b.start + b.len; i++) taken[i] = true
  })

  const cells: Cell[] = bookings.map((b) => ({
    kind: 'booking',
    ...b,
    phase: b.start + b.len <= nowSlot ? 'past' : b.start <= nowSlot ? 'live' : 'next',
  }))

  // Free runs that start after "now" and fit a 90-minute game are opportunities.
  let i = Math.ceil(nowSlot)
  while (i < SLOT_COUNT) {
    if (taken[i]) {
      i++
      continue
    }
    let j = i
    while (j < SLOT_COUNT && !taken[j]) j++
    cells.push({ kind: 'gap', start: i, len: j - i, opportunity: j - i >= 3 })
    i = j
  }
  return cells
}

function LiveCourts() {
  const nowPct = ((NOW.hour - GRID_START_HOUR) / (SLOT_COUNT / 2)) * 100
  const booked = courts.reduce((sum, c) => sum + c.bookings.reduce((a, b) => a + b.len, 0), 0)
  const occupancy = booked / (courts.length * SLOT_COUNT)

  return (
    <Panel
      title="מגרשים"
      scope={
        <>
          היום · <Num>16:00–23:00</Num>
        </>
      }
      meta={
        <>
          עודכן <Num>18:42</Num>
        </>
      }
      span={7}
      actions={
        <div className={s.headStats}>
          <Chip tone="live">
            <Num>5/6</Num> במשחק
          </Chip>
          <Chip>
            תפוסה <Num>{pctNf.format(occupancy)}</Num>
          </Chip>
        </div>
      }
    >
      <div className={s.courtsScroll} dir="ltr">
        <div className={s.courts} style={{ gridTemplateRows: `20px repeat(${courts.length}, 34px)` }}>
          {Array.from({ length: SLOT_COUNT / 2 }, (_, h) => (
            <span key={h} className={s.hour} style={{ gridColumn: `${h * 2 + 2} / span 2`, gridRow: 1 }}>
              {slotTime(h * 2)}
            </span>
          ))}

          {courts.map((court, r) => (
            <div key={court.name} className={s.courtRow} style={{ gridRow: r + 2 }}>
              <span className={s.courtLabel} dir="rtl" style={{ gridRow: r + 2 }}>
                <span>{court.name}</span>
                <span className={s.courtKind}>{court.kind}</span>
              </span>
              <span className={s.track} style={{ gridRow: r + 2 }} />
              {courtCells(court.bookings).map((cell) =>
                cell.kind === 'booking' ? (
                  <span
                    key={`b${cell.start}`}
                    className={`${s.booking} ${s[`booking_${cell.phase}`]}`}
                    style={{ gridColumn: `${cell.start + 2} / span ${cell.len}`, gridRow: r + 2 }}
                    dir="rtl"
                    title={`${slotTime(cell.start)}–${slotTime(cell.start + cell.len)}`}
                  >
                    {cell.label}
                  </span>
                ) : cell.opportunity ? (
                  <span
                    key={`g${cell.start}`}
                    className={s.gap}
                    style={{ gridColumn: `${cell.start + 2} / span ${cell.len}`, gridRow: r + 2 }}
                    dir="rtl"
                  >
                    פנוי <Num>{`${slotTime(cell.start)}–${slotTime(cell.start + cell.len)}`}</Num>
                  </span>
                ) : null
              )}
            </div>
          ))}

          <div className={s.nowLayer} style={{ gridRow: `1 / span ${courts.length + 1}` }}>
            <span className={s.nowLine} style={{ left: `${nowPct}%` }}>
              <span className={s.nowTag}>{NOW.label}</span>
            </span>
          </div>
        </div>
      </div>

      <div className={s.legend}>
        <span>
          <i className={`${s.legendSwatch} ${s.legendLive}`} /> במשחק
        </span>
        <span>
          <i className={s.legendSwatch} /> מוזמן
        </span>
        <span>
          <i className={`${s.legendSwatch} ${s.legendGap}`} /> חלון הזדמנות <Num>90+</Num> דק׳
        </span>
      </div>

      <div className={s.panelProposal}>
        <Proposal
          agent="סוכן שימור"
          when="לפני 3 דק׳"
          confidence={2}
          body="לשלוח ל-11 שחקנים קבועים שמשחקים בדרך כלל ביום א׳ בערב ולא הזמינו השבוע הצעה למגרשים 2, 3 ו-5 בין 20:00 ל-23:00, עם 15% הנחה להזמנה עד 19:30."
          basis={
            <>
              <Num>8</Num> שבועות הזמנות · LAZUZ
            </>
          }
          impact={
            <>
              צפי <Num>{ils(840)}</Num>–<Num>{ils(1260)}</Num>
            </>
          }
          approveLabel="אשר ושלח ל-11"
          doneLabel={
            <>
              נשלח ל-<Num>11</Num> שחקנים · <Num>18:43</Num>
            </>
          }
        />
      </div>
    </Panel>
  )
}

/* ───────────────────────── Insight ───────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  const w = 240
  const h = 48
  const min = Math.min(...values) * 0.97
  const max = Math.max(...values) * 1.01
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (w - 8) + 4,
    h - 4 - ((v - min) / (max - min)) * (h - 8),
  ])
  const avg = values.slice(-5, -1).reduce((a, b) => a + b, 0) / 4
  const avgY = h - 4 - ((avg - min) / (max - min)) * (h - 8)
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]

  return (
    <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={w} y1={avgY} y2={avgY} className={s.sparkAvg} />
      <polyline points={pts.slice(0, -1).map((p) => p.join(',')).join(' ')} className={s.sparkLine} />
      <line x1={prev[0]} y1={prev[1]} x2={last[0]} y2={last[1]} className={s.sparkHot} />
      <circle cx={last[0]} cy={last[1]} r="3" className={s.sparkDot} />
    </svg>
  )
}

function RevenueInsight() {
  const current = weeklyRevenue[weeklyRevenue.length - 1]
  const avg = weeklyRevenue.slice(-5, -1).reduce((a, b) => a + b, 0) / 4
  const delta = current / avg - 1

  return (
    <Panel
      title="הכנסות מגרשים"
      scope={
        <>
          <Num>7</Num> ימים
        </>
      }
      meta={
        <>
          עודכן לפני <Num>4</Num> דק׳
        </>
      }
      span={4}
    >
      <div className={s.insight}>
        <div className={s.metricRow}>
          <span className={s.metric}>
            <Num>{ils(current)}</Num>
          </span>
          <Chip tone="risk">
            <I.IconTrendDown size={12} />
            <Num>{deltaNf.format(delta)}</Num>
          </Chip>
        </div>
        <span className={s.metricSub}>
          מול ממוצע <Num>4</Num> שבועות · <Num>{ils(Math.round(avg))}</Num>
        </span>

        <Sparkline values={weeklyRevenue} />

        <p className={s.insightText}>
          הירידה <strong>כולה</strong> בשעות <Num>16:00–18:00</Num> בימי חול. <Num>6</Num> שחקנים קבועים עברו למשבצות
          ערב, והשעות שהתפנו לא נמכרו.
        </p>

        <div className={s.bands}>
          {revenueBands.map((b) => (
            <div key={b.label} className={s.band}>
              <Num>{b.label}</Num>
              <span className={s.bandTrack} dir="ltr">
                <span
                  className={`${s.bandFill} ${b.delta < -0.1 ? s.bandHot : ''}`}
                  style={{ width: `${b.share * 100}%` }}
                />
              </span>
              <span className={b.delta < -0.1 ? s.bandDeltaHot : s.bandDelta}>
                <Num>{deltaNf.format(b.delta)}</Num>
              </span>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className={s.suggestion}>
        <I.IconSignal size={13} className={s.aiGlyph} />
        <span className={s.suggestionText}>
          <span>
            מבצע &quot;שעת זהב&quot; לימי חול <Num>16:00–18:00</Num>
          </span>
          <span className={s.suggestionMeta}>
            צפי +<Num>{ils(2300)}</Num> בחודש
          </span>
        </span>
        <I.IconForward size={14} className={s.mirror} />
      </button>
    </Panel>
  )
}

/* ───────────────────────── At-risk table ───────────────────────── */

const riskChip = {
  high: { tone: 'risk' as const, label: 'סיכון גבוה' },
  medium: { tone: 'warn' as const, label: 'סיכון בינוני' },
  watch: { tone: 'info' as const, label: 'במעקב' },
}

function AtRiskTable() {
  const [selected, setSelected] = useState('C-10482')
  const total = atRisk.reduce((a, c) => a + c.annualValue, 0)

  return (
    <Panel
      title="בסיכון נטישה"
      scope={
        <>
          <Num>6</Num> מתוך <Num>312</Num> פעילים
        </>
      }
      meta={
        <>
          שווי שנתי בסיכון <Num>{ils(total)}</Num>
        </>
      }
      span={8}
      actions={
        <button type="button" className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}>
          הכל
          <I.IconForward size={13} className={s.mirror} />
        </button>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>לקוח</th>
              <th>טלפון</th>
              <th className={s.colEmail}>אימייל</th>
              <th className={s.alignEnd}>ביקור אחרון</th>
              <th className={s.alignEnd}>משחקים/חודש</th>
              <th className={s.alignEnd}>שווי שנתי</th>
              <th>אות</th>
              <th aria-label="פעולות" />
            </tr>
          </thead>
          <tbody>
            {atRisk.map((c) => (
              <tr
                key={c.id}
                className={selected === c.id ? s.rowSelected : undefined}
                onClick={() => setSelected(c.id)}
                tabIndex={0}
              >
                <td>
                  {selected === c.id && <span className={s.selBar} />}
                  <span className={s.cellName}>{c.name}</span>
                  <span className={s.cellId}>
                    <Num>#{c.id}</Num>
                  </span>
                </td>
                <td>
                  <Num>{c.phone}</Num>
                </td>
                <td className={s.colEmail}>
                  <Num plain>
                    <span className={s.cellEmail}>{c.email}</span>
                  </Num>
                </td>
                <td className={s.alignEnd}>
                  <Num>{c.lastVisit}</Num>
                  <span className={s.cellSub}>
                    {' '}
                    · <Num>{c.daysAgo}</Num> י׳
                  </span>
                </td>
                <td className={s.alignEnd}>
                  <Num>{decNf.format(c.freqNow)}</Num>
                  <span className={s.cellSub}>
                    {' '}
                    היה <Num>{decNf.format(c.freqBefore)}</Num>
                  </span>
                </td>
                <td className={s.alignEnd}>
                  <Num>{ils(c.annualValue)}</Num>
                </td>
                <td>
                  <Chip tone={riskChip[c.risk].tone} why={c.why}>
                    {riskChip[c.risk].label}
                  </Chip>
                </td>
                <td className={s.rowActionsCell}>
                  <span className={s.rowActions}>
                    <button type="button" className={s.rowBtn} aria-label="שלח הודעה">
                      <I.IconChat size={14} />
                    </button>
                    <button type="button" className={s.rowBtn} aria-label="הזמן מגרש">
                      <I.IconCalendarPlus size={14} />
                    </button>
                    <button type="button" className={s.rowBtn} aria-label="עוד פעולות">
                      <I.IconMore size={14} />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className={s.suggestion}>
        <I.IconSignal size={13} className={s.aiGlyph} />
        <span className={s.suggestionText}>
          <span>
            <Num>6</Num> הודעות חזרה אישיות מוכנות לאישור
          </span>
          <span className={s.suggestionMeta}>סוכן שימור · כל הודעה מותאמת להיסטוריה של הלקוח</span>
        </span>
        <I.IconForward size={14} className={s.mirror} />
      </button>
    </Panel>
  )
}

/* ───────────────────────── Loading & empty ───────────────────────── */

function LoadingPanel() {
  return (
    <Panel
      title="חנות"
      scope="Shopify"
      meta={
        <span className={s.syncing}>
          <span className={s.syncDot} />
          מסתנכרן…
        </span>
      }
      span={6}
    >
      <div className={s.skelList} aria-busy="true" aria-label="טוען פעילות חנות">
        {[72, 58, 80, 64].map((w, i) => (
          <div key={i} className={s.skelRow}>
            <span className={`${s.skel} ${s.skelIcon}`} />
            <span className={s.skelLines}>
              <span className={s.skel} style={{ width: `${w}%` }} />
              <span className={`${s.skel} ${s.skelThin}`} style={{ width: `${w - 24}%` }} />
            </span>
            <span className={`${s.skel} ${s.skelAmount}`} />
          </div>
        ))}
      </div>
    </Panel>
  )
}

function EmptyPanel() {
  return (
    <Panel title="Instagram" scope="הודעות ישירות" meta={<>עודכן עכשיו</>} span={6}>
      <div className={s.empty}>
        <span className={s.emptyIcon}>
          <I.IconCamera size={18} />
        </span>
        <div>
          <p className={s.emptyTitle}>אין הודעות ממתינות</p>
          <p className={s.emptyText}>
            סוכן הקבלה ענה ל-<Num>9</Num> פניות היום · זמן תגובה ממוצע <Num>1:40</Num> דק׳
          </p>
          <button type="button" className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}>
            היסטוריית שיחות
          </button>
        </div>
      </div>
    </Panel>
  )
}

/* ───────────────────────── AI dock ───────────────────────── */

const briefItems = [
  {
    text: (
      <>
        נועה לוי מחכה <Num>14</Num> דק׳ לתשובה על מגרש למחר ב-<Num>19:00</Num>. הטיוטה מוכנה.
      </>
    ),
  },
  {
    text: (
      <>
        תשלום נכשל בהזמנה <Num>#SH-4821</Num> (<Num>{ils(890)}</Num>). כדאי לשלוח קישור תשלום חדש.
      </>
    ),
  },
  {
    text: (
      <>
        <Num>3</Num> מגרשים ריקים הערב אחרי <Num>20:00</Num>. יש <Num>11</Num> קבועים שעוד לא הזמינו.
      </>
    ),
  },
]

function Dock({ onToggle }: { onToggle: () => void }) {
  // Lines of the answer appear one by one to show the streaming pattern.
  const [revealed, setRevealed] = useState(0)
  const total = briefItems.length + 2

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.setInterval(
      () => setRevealed((r) => (r >= total ? r : r + 1)),
      reduced ? 1 : 450
    )
    return () => window.clearInterval(id)
  }, [total])

  const streaming = revealed < total

  return (
    <aside className={s.dock} aria-label="עוזר AI">
      <button type="button" className={s.dockCollapsed} onClick={onToggle} aria-label="פתח עוזר AI">
        <I.IconSignal size={16} className={s.aiGlyph} />
        {agents.map((a) => (
          <span key={a.name} className={`${s.agentDot} ${s[`agent_${a.state}`]}`} title={a.name} />
        ))}
      </button>

      <div className={s.dockBody}>
        <header className={s.dockHead}>
          <I.IconSignal size={14} className={s.aiGlyph} />
          <span className={s.dockTitle}>עוזר</span>
          <span className={s.dockSub}>
            <Num>2</Num> סוכנים פעילים
          </span>
          <Kbd>⌘J</Kbd>
          <button type="button" className={s.iconBtn} onClick={onToggle} aria-label="סגור עוזר">
            <I.IconX size={15} />
          </button>
        </header>

        <div className={s.agents}>
          {agents.map((a) => (
            <div key={a.name} className={s.agent}>
              <span className={`${s.agentDot} ${s[`agent_${a.state}`]}`} />
              <span className={s.agentName}>{a.name}</span>
              <span className={s.agentStatus}>{a.status}</span>
            </div>
          ))}
        </div>

        <div className={s.dockThread}>
          <div className={s.ownerMsg}>מה הכי דחוף עכשיו?</div>

          <div className={s.aiMsg}>
            <div className={s.aiMsgHead}>
              <span>מערכת</span>
              <span className={s.aiMsgTime}>
                <Num>18:42</Num>
              </span>
            </div>
            {revealed >= 1 && <p className={s.aiLine}>שלושה דברים, לפי סדר:</p>}
            <ol className={s.aiList}>
              {briefItems.map(
                (item, i) =>
                  revealed >= i + 2 && (
                    <li key={i} className={s.aiLine}>
                      <button type="button" className={s.aiItem}>
                        <span className={s.aiIndex}>
                          <Num>{i + 1}</Num>
                        </span>
                        <span>{item.text}</span>
                        <I.IconForward size={13} className={`${s.mirror} ${s.aiItemGo}`} />
                      </button>
                    </li>
                  )
              )}
            </ol>
            {revealed >= total && (
              <p className={`${s.aiSources} ${s.aiLine}`}>מקורות: LAZUZ · WhatsApp · Shopify</p>
            )}
            {streaming && <span className={s.caret} aria-hidden="true" />}
          </div>

          {!streaming && (
            <div className={s.followUps}>
              <button type="button" className={s.followUp}>
                נסח הודעה ליוסי כהן
              </button>
              <button type="button" className={s.followUp}>
                למה ההכנסות ירדו?
              </button>
              <button type="button" className={s.followUp}>
                מי עוד לא שילם החודש?
              </button>
            </div>
          )}
        </div>

        <div className={s.composer}>
          <div className={s.composerBox}>
            <span className={s.contextChip}>
              הקשר: היום
              <I.IconX size={11} />
            </span>
            <textarea className={s.composerInput} rows={2} placeholder="שאל, בקש, או הקצה משימה לסוכן…" />
            <div className={s.composerFoot}>
              <span className={s.composerHint}>
                <Kbd>⏎</Kbd> שליחה
              </span>
              <button type="button" className={`${s.btn} ${s.btnAi} ${s.btnIcon}`} aria-label="שלח">
                <I.IconSend size={14} className={s.mirror} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ───────────────────────── Command palette ───────────────────────── */

type PaletteItem = {
  group: string
  label: string
  meta?: ReactNode
  keys?: string
  icon: typeof I.IconSearch
  ai?: boolean
}

const paletteItems: PaletteItem[] = [
  { group: 'פעולות', label: 'שלח הצעה לחלונות הפנויים הערב', icon: I.IconSignal, ai: true, meta: 'סוכן שימור' },
  { group: 'פעולות', label: 'הזמן מגרש', icon: I.IconCalendarPlus, keys: 'B' },
  { group: 'פעולות', label: 'הודעת WhatsApp חדשה', icon: I.IconChat, keys: 'N' },
  { group: 'לקוחות', label: 'נועה לוי', icon: I.IconUsers, meta: <Num>050-742-1183</Num> },
  { group: 'לקוחות', label: 'יוסי כהן', icon: I.IconUsers, meta: <Num>#C-10482</Num> },
  { group: 'ניווט', label: 'תפעול', icon: I.IconToday, keys: 'G O' },
  { group: 'ניווט', label: 'צמיחה', icon: I.IconTarget, keys: 'G G' },
  { group: 'ניווט', label: 'תובנות', icon: I.IconInsights, keys: 'G I' },
]

function Palette({ onClose, onAskAi }: { onClose: () => void; onAskAi: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    const q = query.trim()
    const matched = q ? paletteItems.filter((i) => i.label.includes(q)) : paletteItems
    const ask: PaletteItem = {
      group: 'שאל את ה-AI',
      label: q ? `שאל: ${q}` : 'מה הכי דחוף עכשיו?',
      icon: I.IconSignal,
      ai: true,
      keys: '⌘⏎',
    }
    return [...matched, ask]
  }, [query])

  const choose = (item: PaletteItem) => {
    if (item.group === 'שאל את ה-AI') onAskAi()
    onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    }
  }

  let lastGroup = ''

  return (
    <div className={s.scrim} onMouseDown={onClose}>
      <div
        className={s.palette}
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש ופקודות"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className={s.paletteInputRow}>
          <I.IconSearch size={16} />
          <input
            className={s.paletteInput}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="חפש לקוח, הזמנה, פעולה… או שאל את ה-AI"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className={s.paletteList} role="listbox">
          {results.map((item, idx) => {
            const showGroup = item.group !== lastGroup
            lastGroup = item.group
            const Icon = item.icon
            return (
              <div key={`${item.group}-${item.label}`}>
                {showGroup && <div className={s.paletteGroup}>{item.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === active}
                  className={`${s.paletteItem} ${idx === active ? s.paletteItemActive : ''}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(item)}
                >
                  <Icon size={15} className={item.ai ? s.aiGlyph : undefined} />
                  <span className={s.paletteLabel}>{item.label}</span>
                  {item.meta && <span className={s.paletteMeta}>{item.meta}</span>}
                  {item.keys && <Kbd>{item.keys}</Kbd>}
                </button>
              </div>
            )
          })}
        </div>

        <div className={s.paletteFoot}>
          <span>
            <Kbd>↑↓</Kbd> ניווט
          </span>
          <span>
            <Kbd>⏎</Kbd> בחירה
          </span>
          <span>
            <Kbd>&gt;</Kbd> פעולות
          </span>
          <span>
            <Kbd>@</Kbd> לקוחות
          </span>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Design tokens ───────────────────────── */

const swatches: { token: string; dark: string; light: string }[] = [
  { token: '--canvas', dark: '#0A0C0B', light: '#F3F3EF' },
  { token: '--surface-1', dark: '#111413', light: '#FFFFFF' },
  { token: '--surface-2', dark: '#171B19', light: '#EDEDE8' },
  { token: '--surface-3', dark: '#1E2320', light: '#E4E4DE' },
  { token: '--line', dark: '#2C3330', light: '#D3D3CC' },
  { token: '--text-1', dark: '#ECEFEC', light: '#0E100F' },
  { token: '--text-2', dark: '#A3ABA6', light: '#4F5551' },
  { token: '--text-3', dark: '#6B736E', light: '#80867F' },
  { token: '--optic', dark: '#D7FF3F', light: '#D7FF3F' },
  { token: '--optic-ink', dark: '#D7FF3F', light: '#4A6700' },
  { token: '--live', dark: '#3DD68C', light: '#12844F' },
  { token: '--warn', dark: '#F5B544', light: '#A86400' },
  { token: '--risk', dark: '#FF5D5D', light: '#C42B2B' },
  { token: '--info', dark: '#5CC8E0', light: '#0F6F85' },
]

const typeScale = [
  { token: 'display', cls: s.tDisplay, sample: <Num>5/6</Num>, spec: '40/44 · 500 · mono' },
  { token: 'metric', cls: s.tMetric, sample: <Num>18,420 ₪</Num>, spec: '28/32 · 500 · mono' },
  { token: 'page', cls: s.tPage, sample: 'לקוחות בסיכון', spec: '20/28 · 600' },
  { token: 'title', cls: s.tTitle, sample: 'מגרשים פנויים הערב', spec: '16/24 · 600' },
  { token: 'read', cls: s.tRead, sample: 'הירידה כולה בשעות אחר הצהריים בימי חול.', spec: '14/22 · 400' },
  { token: 'body', cls: s.tBody, sample: 'יוסי כהן · שיחק פעמיים בשבוע במשך שנתיים', spec: '13/20 · 400' },
  { token: 'meta', cls: s.tMeta, sample: 'עודכן לפני 4 דק׳ · LAZUZ', spec: '12/16 · 400' },
]

const ltrSamples = [
  { label: 'טלפון', value: '050-742-1183', note: 'dir=ltr, מוצג מקומי, נשמר E.164' },
  { label: 'מחיר', value: ils(1240), note: 'מספר ואז ₪' },
  { label: 'אחוז', value: `${deltaNf.format(-0.12)} · ${pctNf.format(0.61)}`, note: 'הסימן נשאר מימין למספר' },
  { label: 'תאריך ושעה', value: '27.09.26 · 18:42', note: 'dd.mm.yy · 24 שעות' },
  { label: 'טווח שעות', value: '20:00–23:00', note: 'מקף en, ללא רווחים' },
  { label: 'אימייל', value: 'noa.levi@example.com', note: 'dir=ltr, ללא מונו' },
  { label: 'מזהה', value: '#BK-20931', note: 'מונו, מבודד' },
]

function DesignTokens({ theme }: { theme: Theme }) {
  return (
    <section className={s.tokens} aria-label="שפת העיצוב">
      <div className={s.tokensHead}>
        <h2 className={s.tokensTitle}>שפת העיצוב</h2>
        <span className={s.panelScope}>Night Session · v0.1</span>
        <span className={s.panelMeta}>{theme === 'dark' ? 'ערכת לילה' : 'ערכת יום'}</span>
      </div>

      <div className={s.grid}>
        <Panel title="צבע" scope="אסימונים סמנטיים" span={6}>
          <div className={s.swatches}>
            {swatches.map((sw) => (
              <div key={sw.token} className={s.swatch}>
                <span className={s.swatchChip} style={{ background: `var(${sw.token})` }} />
                <Num plain>
                  <span className={s.swatchToken}>{sw.token}</span>
                </Num>
                <Num>{theme === 'dark' ? sw.dark : sw.light}</Num>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="טיפוגרפיה" scope="IBM Plex Sans Hebrew · Plex Mono" span={6}>
          <div className={s.typeList}>
            {typeScale.map((t) => (
              <div key={t.token} className={s.typeRow}>
                <span className={t.cls}>{t.sample}</span>
                <span className={s.typeSpec}>
                  <Num plain>
                    {t.token} · {t.spec}
                  </Num>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="רכיבים" scope="כפתורים · שדות · תגיות" span={6}>
          <div className={s.components}>
            <div className={s.compRow}>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`}>
                שמור לקוח
              </button>
              <button type="button" className={`${s.btn} ${s.btnSecondary}`}>
                ייצוא
              </button>
              <button type="button" className={`${s.btn} ${s.btnGhost}`}>
                ביטול
              </button>
              <button type="button" className={`${s.btn} ${s.btnAi}`}>
                <I.IconCheck size={14} />
                אשר הצעה
              </button>
              <button type="button" className={`${s.btn} ${s.btnDanger}`}>
                מחק
              </button>
            </div>
            <div className={s.compRow}>
              <Chip tone="live">במשחק</Chip>
              <Chip tone="warn">ליד חם</Chip>
              <Chip tone="risk">סיכון גבוה</Chip>
              <Chip tone="info">במעקב</Chip>
              <Chip tone="ai">טיוטת AI</Chip>
              <Chip>
                <Num>14</Num> ביקורים
              </Chip>
              <Kbd>⌘K</Kbd>
            </div>
            <div className={s.fields}>
              <label className={s.field}>
                <span className={s.fieldLabel}>שם מלא</span>
                <input className={s.input} defaultValue="נועה לוי" />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>טלפון</span>
                <input className={`${s.input} ${s.inputFocus}`} defaultValue="050-742-1183" dir="ltr" />
                <span className={s.fieldHelp}>מצב פוקוס</span>
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>אימייל</span>
                <input className={`${s.input} ${s.inputError}`} defaultValue="noa.levi@" dir="ltr" aria-invalid="true" />
                <span className={s.fieldError}>
                  <I.IconX size={12} />
                  כתובת לא שלמה
                </span>
              </label>
            </div>
          </div>
        </Panel>

        <Panel title="כיווניות" scope="LTR בתוך RTL" span={6}>
          <table className={`${s.table} ${s.ltrTable}`}>
            <tbody>
              {ltrSamples.map((row) => (
                <tr key={row.label}>
                  <td className={s.ltrLabel}>{row.label}</td>
                  <td>
                    <Num plain={row.label === 'אימייל'}>{row.value}</Num>
                  </td>
                  <td className={s.cellSub}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  )
}
