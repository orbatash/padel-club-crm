import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOwner } from '@/lib/auth'
import { getCustomer } from '@/lib/customers/data'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  displayName,
  formatDateTime,
  formatPlayerLevel,
} from '@/lib/customers/labels'
import { formatPhone } from '@/lib/customers/phone'
import { PLAYER_LEVELS, type PlayerLevel } from '@/lib/customers/types'
import { Button, Chip, EmptyState, Panel, PanelGrid, ui } from '@/components/ui/primitives'
import {
  IconBag,
  IconCalendarPlus,
  IconChat,
  IconCourt,
  IconForward,
  IconSignal,
  IconToday,
} from '@/components/ui/icons'
import { Ltr, Num } from '@/components/ui/text'
import { ArchiveControl } from '@/components/customers/archive-control'
import { restoreCustomer } from '../actions'
import s from '@/components/customers/customers.module.css'

export async function generateMetadata({ params }: PageProps<'/customers/[id]'>): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomer(id)
  return { title: customer ? displayName(customer.fullName) : 'לקוח' }
}

function LevelScale({ level }: { level: PlayerLevel }) {
  const index = PLAYER_LEVELS.indexOf(level)
  return (
    <span className={s.scale}>
      <Num>{formatPlayerLevel(level)}</Num>
      <span className={s.scaleTrack} aria-hidden="true">
        {PLAYER_LEVELS.map((step, i) => (
          <span key={step} className={`${s.scaleStep} ${i <= index ? s.scaleStepOn : ''}`} />
        ))}
      </span>
    </span>
  )
}

function Empty({ children = 'לא הוזן' }: { children?: string }) {
  return <span className={s.empty}>{children}</span>
}

export default async function CustomerPage({ params }: PageProps<'/customers/[id]'>) {
  await requireOwner()
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  const name = displayName(customer.fullName)
  const phone = formatPhone(customer.phone)

  return (
    <>
      <div className={s.detailHead}>
        <div className={s.titleBlock}>
          <Link href="/customers" className={s.backLink}>
            <IconForward size={13} />
            לקוחות
          </Link>
          <h2 className={`${s.title} ${customer.fullName ? '' : s.titleUnnamed}`}>{name}</h2>
          <div className={s.titleMeta}>
            <Chip tone={STATUS_TONES[customer.status]}>{STATUS_LABELS[customer.status]}</Chip>
            {customer.archivedAt && <Chip tone="warn">בארכיון</Chip>}
            <span>
              נוצר <Num>{formatDateTime(customer.createdAt)}</Num>
            </span>
          </div>
        </div>
        <div className={s.headActions}>
          <Link href={`/customers/${customer.id}/edit`} className={`${ui.btn} ${ui.btn_secondary}`}>
            עריכה
          </Link>
          {!customer.archivedAt && <ArchiveControl id={customer.id} name={name} />}
        </div>
      </div>

      {customer.archivedAt && (
        <div className={s.archivedBanner} role="status">
          <p>
            הלקוח בארכיון מאז <Num>{formatDateTime(customer.archivedAt)}</Num>. הוא מוסתר מהרשימה, והמידע שלו
            נשמר במלואו.
          </p>
          <form action={restoreCustomer}>
            <input type="hidden" name="id" value={customer.id} />
            <Button type="submit" variant="secondary" size="sm">
              שחזור מהארכיון
            </Button>
          </form>
        </div>
      )}

      <PanelGrid>
        <Panel title="פרטי קשר" span={6}>
          <dl className={s.dl}>
            <dt>טלפון</dt>
            <dd>
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className={s.valueLink}>
                  <Num>{phone}</Num>
                </a>
              ) : (
                <Empty />
              )}
            </dd>
            <dt>אימייל</dt>
            <dd>
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className={s.valueLink}>
                  <Ltr>{customer.email}</Ltr>
                </a>
              ) : (
                <Empty />
              )}
            </dd>
            <dt>Instagram</dt>
            <dd>
              {customer.instagramUsername ? (
                <a
                  href={`https://instagram.com/${customer.instagramUsername}`}
                  className={s.valueLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Ltr>{`@${customer.instagramUsername}`}</Ltr>
                </a>
              ) : (
                <Empty />
              )}
            </dd>
            <dt>הסכמות</dt>
            <dd className={s.chips}>
              <Chip tone={customer.whatsappOptIn ? 'live' : 'neutral'}>
                WhatsApp {customer.whatsappOptIn ? '✓' : '✕'}
              </Chip>
              <Chip tone={customer.marketingOptIn ? 'live' : 'neutral'}>
                דיוור {customer.marketingOptIn ? '✓' : '✕'}
              </Chip>
            </dd>
          </dl>
        </Panel>

        <Panel title="פרופיל" span={6}>
          <dl className={s.dl}>
            <dt>סטטוס</dt>
            <dd>{STATUS_LABELS[customer.status]}</dd>
            <dt>מקור</dt>
            <dd>{customer.source ? SOURCE_LABELS[customer.source] : <Empty>לא ידוע</Empty>}</dd>
            <dt>רמת משחק</dt>
            <dd>{customer.playerLevel != null ? <LevelScale level={customer.playerLevel} /> : <Empty>לא ידועה</Empty>}</dd>
            <dt>תחומי עניין</dt>
            <dd className={s.chips}>
              {customer.interests.length ? customer.interests.map((i) => <Chip key={i}>{i}</Chip>) : <Empty />}
            </dd>
            <dt>תגיות</dt>
            <dd className={s.chips}>
              {customer.tags.length ? customer.tags.map((t) => <Chip key={t}>{t}</Chip>) : <Empty />}
            </dd>
          </dl>
        </Panel>

        <Panel title="הערות" span={6}>
          {customer.notes ? (
            <p className={s.notes}>{customer.notes}</p>
          ) : (
            <EmptyState
              icon={<IconChat size={18} />}
              title="אין הערות"
              text="הערות פנימיות על הלקוח יופיעו כאן."
            />
          )}
        </Panel>

        <Panel title="סיכום שיחה אחרונה" span={6}>
          {customer.lastConversationSummary ? (
            <p className={s.notes}>{customer.lastConversationSummary}</p>
          ) : (
            <EmptyState
              icon={<IconSignal size={18} />}
              title="אין סיכום עדיין"
              text="אחרי חיבור WhatsApp ו-Instagram, סיכום השיחה האחרונה עם הלקוח יופיע כאן."
            />
          )}
        </Panel>
      </PanelGrid>

      <h3 className={s.sectionTitle}>
        בקרוב <Chip>לא מחובר</Chip>
      </h3>
      <PanelGrid>
        <Panel title="שיחות" scope="WhatsApp · Instagram" span={4}>
          <EmptyState icon={<IconChat size={18} />} title="ערוצי שיחה לא מחוברים" text="כל השיחות עם הלקוח, מכל הערוצים, במקום אחד." />
        </Panel>
        <Panel title="הזמנות מגרשים" span={4}>
          <EmptyState icon={<IconCalendarPlus size={18} />} title="אין נתוני הזמנות" text="הזמנות עבר ועתיד, ביטולים ותדירות משחק." />
        </Panel>
        <Panel title="הזמנות בחנות" scope="Shopify" span={4}>
          <EmptyState icon={<IconBag size={18} />} title="Shopify לא מחובר" text="רכישות, תשלומים ומוצרים שהלקוח קנה." />
        </Panel>
        <Panel title="פעילות LAZUZ" span={4}>
          <EmptyState icon={<IconCourt size={18} />} title="LAZUZ לא מחובר" text="משחקים, דירוג ופעילות מהאפליקציה." />
        </Panel>
        <Panel title="ציר זמן" span={4}>
          <EmptyState icon={<IconToday size={18} />} title="אין אירועים עדיין" text="כל האינטראקציות עם הלקוח לפי סדר הזמן." />
        </Panel>
        <Panel title="תובנות AI" span={4}>
          <EmptyState icon={<IconSignal size={18} />} title="סוכני AI לא פעילים" text="סיכון נטישה, הצעות והמלצות מותאמות ללקוח." />
        </Panel>
      </PanelGrid>

      <div className={s.metaFoot}>
        <span>
          נוצר <Num>{formatDateTime(customer.createdAt)}</Num>
        </span>
        <span>
          עודכן <Num>{formatDateTime(customer.updatedAt)}</Num>
        </span>
        <span>
          מזהה <Num>{customer.id}</Num>
        </span>
      </div>
    </>
  )
}

