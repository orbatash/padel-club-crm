// SAMPLE DATA ONLY — the design preview never reads from Supabase.
// "Now" is frozen at Sunday 27.09.26 18:42 so the preview is deterministic.

export const NOW = { label: '18:42', hour: 18 + 42 / 60 }

// Court grid: 16:00–23:00 in 30-minute slots (14 slots). Bookings are 90 min.
export const GRID_START_HOUR = 16
export const SLOT_COUNT = 14

export type Booking = { start: number; len: number; label: string }
export type Court = { name: string; kind: string; bookings: Booking[] }

export const courts: Court[] = [
  {
    name: 'מגרש 1',
    kind: 'פנורמי',
    bookings: [
      { start: 0, len: 3, label: 'ליגת נשים' },
      { start: 3, len: 3, label: 'כהן ×4' },
      { start: 6, len: 3, label: 'ברק ×4' },
      { start: 9, len: 3, label: 'שיעור · רון' },
    ],
  },
  {
    name: 'מגרש 2',
    kind: 'פנורמי',
    bookings: [
      { start: 1, len: 3, label: 'אזולאי ×4' },
      { start: 4, len: 3, label: 'שיעור · מאיה' },
      { start: 8, len: 3, label: 'לוי ×4' },
    ],
  },
  {
    name: 'מגרש 3',
    kind: 'מקורה',
    bookings: [
      { start: 2, len: 3, label: 'פרידמן ×4' },
      { start: 5, len: 3, label: 'גולן ×2' },
    ],
  },
  {
    name: 'מגרש 4',
    kind: 'מקורה',
    bookings: [
      { start: 0, len: 3, label: 'אקדמיית נוער' },
      { start: 6, len: 3, label: 'שחר ×4' },
      { start: 9, len: 3, label: 'דוד ×4' },
    ],
  },
  {
    name: 'מגרש 5',
    kind: 'חוץ',
    bookings: [{ start: 4, len: 3, label: 'טורניר אמריקנו' }],
  },
  {
    name: 'מגרש 6',
    kind: 'חוץ',
    bookings: [
      { start: 0, len: 3, label: 'מזרחי ×4' },
      { start: 3, len: 3, label: 'שיעור · רון' },
      { start: 6, len: 3, label: 'ליגת ערב' },
      { start: 9, len: 3, label: 'ליגת ערב' },
    ],
  },
]

export type QueueItem = {
  id: string
  source: 'whatsapp' | 'instagram' | 'store'
  name: string
  preview: string
  waitMin: number
  chip?: { label: string; tone: 'risk' | 'warn' | 'ai' | 'info' }
}

export const queue: QueueItem[] = [
  {
    id: 'q1',
    source: 'whatsapp',
    name: 'נועה לוי',
    preview: 'היי, יש מגרש פנוי מחר ב-19:00 לארבעה? ומה המחיר?',
    waitMin: 14,
    chip: { label: 'טיוטת AI מוכנה', tone: 'ai' },
  },
  {
    id: 'q2',
    source: 'store',
    name: 'תשלום נכשל',
    preview: 'Shopify · הזמנה #SH-4821 · מחבט קרבון Pro 04',
    waitMin: 22,
    chip: { label: 'דחוף', tone: 'risk' },
  },
  {
    id: 'q3',
    source: 'instagram',
    name: 'דניאל אברהם',
    preview: 'מחפש שיעור פרטי למתחילים, יש משהו השבוע בבוקר?',
    waitMin: 6,
    chip: { label: 'ליד חם', tone: 'warn' },
  },
]

export type Message = { from: 'customer' | 'club'; text: string; time: string }

export const conversation: Message[] = [
  { from: 'customer', text: 'היי, יש מגרש פנוי מחר ב-19:00 לארבעה?', time: '18:28' },
  { from: 'customer', text: 'ומה המחיר? אם אפשר מגרש פנורמי', time: '18:28' },
]

export const replyDraft =
  'היי נועה! מחר (יום ב׳ 28.09) ב-19:00 מגרש 1 הפנורמי פנוי. 90 דקות לרביעייה: 280 ₪ (70 ₪ לשחקן). לשריין לך?'

export type AtRisk = {
  id: string
  name: string
  phone: string
  email: string
  lastVisit: string
  daysAgo: number
  freqNow: number
  freqBefore: number
  annualValue: number
  risk: 'high' | 'medium' | 'watch'
  why: string
}

export const atRisk: AtRisk[] = [
  {
    id: 'C-10482',
    name: 'יוסי כהן',
    phone: '052-318-7746',
    email: 'yossi.cohen@example.com',
    lastVisit: '03.08.26',
    daysAgo: 55,
    freqNow: 0,
    freqBefore: 8.4,
    annualValue: 3860,
    risk: 'high',
    why: 'שיחק פעמיים בשבוע במשך שנתיים. אין הזמנה מאז 03.08.',
  },
  {
    id: 'C-10917',
    name: 'מיכל ברק',
    phone: '054-902-1135',
    email: 'michal.barak@example.com',
    lastVisit: '29.08.26',
    daysAgo: 29,
    freqNow: 1,
    freqBefore: 5.6,
    annualValue: 2140,
    risk: 'high',
    why: 'ירידה חדה אחרי שהשותפה הקבועה עזבה את הליגה.',
  },
  {
    id: 'C-11203',
    name: 'עומר פרידמן',
    phone: '050-667-2201',
    email: 'omer.f@example.com',
    lastVisit: '10.09.26',
    daysAgo: 17,
    freqNow: 2,
    freqBefore: 6.2,
    annualValue: 1980,
    risk: 'medium',
    why: 'עבר ממשבצות 17:00 לסופי שבוע בלבד.',
  },
  {
    id: 'C-11588',
    name: 'שירן אזולאי',
    phone: '053-441-9082',
    email: 'shiran.az@example.com',
    lastVisit: '14.09.26',
    daysAgo: 13,
    freqNow: 2,
    freqBefore: 4.1,
    annualValue: 1450,
    risk: 'medium',
    why: 'ביטלה שתי הזמנות ברצף בשבועיים האחרונים.',
  },
  {
    id: 'C-11702',
    name: 'רותם גבאי',
    phone: '058-220-6473',
    email: 'rotem.gabay@example.com',
    lastVisit: '19.09.26',
    daysAgo: 8,
    freqNow: 3,
    freqBefore: 4.4,
    annualValue: 1210,
    risk: 'watch',
    why: 'מנוי חודשי מסתיים בעוד 4 ימים, ללא חידוש.',
  },
  {
    id: 'C-11954',
    name: 'איתי נחום',
    phone: '052-775-3310',
    email: 'itai.nachum@example.com',
    lastVisit: '21.09.26',
    daysAgo: 6,
    freqNow: 3,
    freqBefore: 3.8,
    annualValue: 940,
    risk: 'watch',
    why: 'לא פתח את 3 ההודעות האחרונות.',
  },
]

// Weekly court revenue, oldest → newest (8 weeks).
export const weeklyRevenue = [20100, 21400, 20800, 21900, 20600, 21200, 20950, 18420]

export const revenueBands = [
  { label: '16:00–18:00', delta: -0.31, share: 0.24 },
  { label: '18:00–21:00', delta: 0.04, share: 0.58 },
  { label: '21:00–23:00', delta: -0.02, share: 0.18 },
]

export type Agent = { name: string; status: string; state: 'active' | 'idle' | 'scheduled' }

export const agents: Agent[] = [
  { name: 'קבלה', status: 'עונה ל-2 שיחות', state: 'active' },
  { name: 'שימור', status: 'מנתח נטישה', state: 'active' },
  { name: 'מכירות', status: 'ממתין', state: 'idle' },
  { name: 'שיווק', status: 'ממתין', state: 'idle' },
  { name: 'תוכן', status: 'פוסט ב-20:00', state: 'scheduled' },
  { name: 'אנליסט', status: 'דוח שבועי מחר', state: 'scheduled' },
]
