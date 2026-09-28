# Padel Club OS — Design System

> Status: **v1 — approved and implemented in the global shell.**
> `/design-preview` stays as the visual reference (sample data) until every
> module matches it.

### Where it lives

| Piece | File |
|---|---|
| Tokens (Night/Day), Tailwind mapping, RTL/LTR utilities, safe areas | `app/globals.css` |
| Fonts, `lang="he" dir="rtl"`, theme cookie, `theme-color`, viewport | `app/layout.tsx` |
| Theme / dock preference cookies | `lib/preferences.ts` |
| Shell: rail, top bar, status strip, AI dock, mobile bar, command palette | `components/shell/` |
| Navigation (single source for rail, mobile bar, palette) | `components/shell/nav.ts` |
| Primitives: Button, Chip, Panel, PanelGrid, EmptyState, fields, table | `components/ui/primitives.tsx`, `ui.module.css` |
| `<Num>` / `<Ltr>` / `<Kbd>` | `components/ui/text.tsx` |
| Icons | `components/ui/icons.tsx` |

Tailwind's default palette is disabled; only token utilities exist
(`bg-surface-1`, `text-fg-2`, `border-line`, `text-optic-ink`, `text-body`,
`rounded-1`, `font-mono`, …).

### PWA readiness (installation not enabled yet)

- `viewport-fit=cover` plus `env(safe-area-inset-*)` on the shell, top bar,
  mobile bar and dock, so nothing hides under notches or the home indicator.
- `theme-color` and `color-scheme` follow the Owner's theme from a cookie,
  and are updated live when the theme is toggled.
- Theme and dock state are cookies read on the server, so a cold start paints
  the right state with no flash.
- Navigation never depends on browser chrome: a bottom tab bar on phones, all
  links in-app, and sign-out as a plain form that works before JS loads.
- Sessions are cookie-based (`@supabase/ssr`) and refreshed by `proxy.ts` on
  every request, which works the same in a standalone window.
- `100dvh`-safe fixed shell with internal scrolling and no page overscroll.
- Still to add when installation is enabled: `app/manifest.ts`, icons,
  Apple web-app metadata, a service worker with an offline screen, and
  excluding the manifest/worker paths from `proxy.ts`.

## 0. Direction: "Night Session"

The product is a **control center for a padel club**, not an admin panel. The
reference points are an F1 pit wall, a trading terminal and a flight deck — not
a SaaS template.

The visual idea comes from the club itself:

- **Floodlit court at night** → a near-black, slightly green-tinted canvas.
- **Glass walls** → hairline borders and flat, layered surfaces instead of floating cards.
- **The ball** → one optic-yellow accent (`Optic`), used sparingly. Optic is the
  **color of the system's intelligence**: AI output, AI proposals, keyboard
  focus, and at most one "look here first" element per screen.

Principles, in priority order:

1. **Signal over metric.** Never show a number without what it means and what
   to do about it. "Occupancy 72%" is not enough; "Tue 18:00–20:00 has 3 empty
   courts — 11 regulars usually book then → *Send offer*" is.
2. **Density with hierarchy.** Show a lot, but let hierarchy come from weight,
   color and position, not from boxes and whitespace.
3. **Keyboard first, mouse friendly.** Every action is reachable from the
   command palette.
4. **AI is present, not decorative.** It is a working surface (dock, proposals,
   inline signals), never a gradient or a mascot.
5. **Humans approve, agents propose.** Anything an AI agent wants to *do* is
   rendered as a proposal until approved (see §13).
6. **RTL-first.** Hebrew is the default, not a translation (see §18).
7. **Dark is the primary theme.** Light is a full, deliberate theme, not an inversion.

### Avoid list

- Rounded "card soup" grids of equal-sized tiles
- Purple/blue AI gradients, sparkles-as-decoration, glowing blobs
- Default Tailwind/shadcn look: `rounded-xl shadow-md p-6` on everything
- Wide generic left sidebars with 12 text links
- Vanity metric tiles (total customers, total revenue) with no interpretation
- Spinners for page loads
- ALL CAPS labels (meaningless in Hebrew; see §18)

---

## 1. Color system

All colors are CSS custom properties defined in `app/globals.css` and exposed to
Tailwind v4 through `@theme`. Components use **semantic tokens only**, never raw hex.

### 1.1 Dark — "Night" (default)

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#0A0C0B` | App background |
| `--surface-1` | `#111413` | Panels, table body |
| `--surface-2` | `#171B19` | Hover rows, inputs, nested regions |
| `--surface-3` | `#1E2320` | Active/selected, popovers |
| `--line-subtle` | `#202624` | Row separators, inner dividers |
| `--line` | `#2C3330` | Panel borders, input borders |
| `--line-strong` | `#3D4541` | Hover borders, emphasized dividers |
| `--text-1` | `#ECEFEC` | Primary text |
| `--text-2` | `#A3ABA6` | Secondary text, labels |
| `--text-3` | `#6B736E` | Tertiary, metadata, timestamps |
| `--text-disabled` | `#474E4A` | Disabled |
| `--optic` | `#D7FF3F` | AI accent: fills, focus ring, AI markers |
| `--optic-ink` | `#D7FF3F` | Accent used as text/lines |
| `--optic-soft` | `rgb(215 255 63 / 0.10)` | AI proposal backgrounds, highlighted cells |
| `--on-optic` | `#0A0C0B` | Text on Optic fills |

### 1.2 Light — "Day"

| Token | Value |
|---|---|
| `--canvas` | `#F3F3EF` (warm, never pure white) |
| `--surface-1` | `#FFFFFF` |
| `--surface-2` | `#EDEDE8` |
| `--surface-3` | `#E4E4DE` |
| `--line-subtle` | `#E6E6E0` |
| `--line` | `#D3D3CC` |
| `--line-strong` | `#B5B5AD` |
| `--text-1` | `#0E100F` |
| `--text-2` | `#4F5551` |
| `--text-3` | `#80867F` |
| `--optic` | `#D7FF3F` (fills only, always with `--on-optic` text) |
| `--optic-ink` | `#4A6700` (accent as text/lines — Optic on white fails contrast) |
| `--optic-soft` | `rgb(160 200 0 / 0.14)` |

### 1.3 Semantic status (both themes, tuned per theme)

| Token | Night | Day | Meaning |
|---|---|---|---|
| `--live` | `#3DD68C` | `#12844F` | In play / online / healthy |
| `--warn` | `#F5B544` | `#A86400` | Needs attention soon |
| `--risk` | `#FF5D5D` | `#C42B2B` | Urgent, churn risk, failures |
| `--info` | `#5CC8E0` | `#0F6F85` | Neutral informational, "glass" |

Each status also has a `-soft` variant (≈12% alpha) for chip backgrounds.

### 1.4 Rules

- **Optic is scarce.** If more than ~5% of a screen is Optic, something is wrong.
- **Primary buttons are not Optic.** They are inverted neutral (`--text-1` fill,
  `--canvas` text). Optic buttons exist only for AI actions ("Approve proposal",
  "Ask").
- Status colors only carry status. Never use `--risk` for decoration.
- Charts use neutral greys plus **one** highlighted series; categorical palettes
  are capped at 4 hues.
- All text meets WCAG AA (4.5:1 body, 3:1 large/UI).

---

## 2. Typography

Hebrew-first family with a matching Latin and a mono for data:

| Role | Font | Notes |
|---|---|---|
| UI (Hebrew + Latin) | **IBM Plex Sans Hebrew** | Technical, neutral; ships its own matching Latin glyphs |
| Data / numerals | **IBM Plex Mono** | Times, prices, IDs, counters |

Loaded via `next/font/google`, weights 400/500/600 (replaces Geist, which has no Hebrew glyphs).
All numbers in tables and metrics use `font-variant-numeric: tabular-nums`.

### Scale (dense by design)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-micro` | 11 / 16 | 500 | Chip text, keyboard hints |
| `text-meta` | 12 / 16 | 400 | Timestamps, table metadata |
| `text-body` | 13 / 20 | 400 | Tables, dense UI (default) |
| `text-read` | 14 / 22 | 400 | Messages, AI text, long reads |
| `text-label` | 13 / 20 | 500 | Panel titles, form labels |
| `text-title` | 16 / 24 | 600 | Section titles |
| `text-page` | 20 / 28 | 600 | Page title (one per page) |
| `text-metric` | 28 / 32 | 500, mono | Hero numbers inside widgets |
| `text-display` | 40 / 44 | 500, mono | Rare: live court counter, etc. |

- Letter-spacing: 0 for Hebrew. Never track Hebrew text.
- Hierarchy comes from weight and color (`--text-1/2/3`), not from size jumps.

---

## 3. Spacing

Base unit **4px**. Scale: `0.5`=2, `1`=4, `1.5`=6, `2`=8, `3`=12, `4`=16, `5`=20,
`6`=24, `8`=32, `12`=48.

| Context | Value |
|---|---|
| Inside a panel | 12 (compact) / 16 (default) |
| Between panels | 1px hairline gap **or** 8 — never 24+ |
| Table cell padding | 8 × 12 |
| Form field vertical gap | 12 |
| Page gutter | 16 desktop, 12 mobile |

The layout feels like one continuous instrument, not a page of scattered tiles.

---

## 4. Radius

| Token | Value | Use |
|---|---|---|
| `radius-0` | 0 | Table cells, panels inside a grid, rail |
| `radius-1` | 4 | Buttons, inputs, chips (rect), row focus |
| `radius-2` | 6 | Standalone panels, menus |
| `radius-3` | 10 | Overlays: command palette, dialogs, sheets |
| `radius-full` | 999 | Avatars, status dots, pill counters only |

Nothing above 10px. Grid panels sit flush with shared hairline borders and have
radius only on the outer corners of the group.

---

## 5. Elevation & shadows

- **Night:** elevation comes from surface lightness (`surface-1 → 3`), not shadows.
  Only overlays get a shadow: `0 16px 48px rgb(0 0 0 / 0.5)` plus a `--line` border.
- **Day:** panels have a border and no shadow. Overlays:
  `0 12px 32px rgb(20 24 22 / 0.12), 0 1px 2px rgb(20 24 22 / 0.06)`.
- No glows except the Optic focus ring and the live pulse.

## 6. Borders

- 1px everywhere. `--line-subtle` inside, `--line` around, `--line-strong` on hover.
- Hairlines are the main structural tool: a dashboard is a grid of cells
  divided by lines (a "glass wall"), not a set of cards floating on a background.
- Active item indicator is a **2px bar on the inline-start edge** in `--text-1`
  (navigation) or `--optic` (AI-related).

---

## 7. Icons

- **Lucide**, stroke **1.5**, sizes 14 / 16 / 20. Default 16 in UI, 14 in tables.
- Color inherits text color; icons are never multicolored.
- Custom glyphs for club concepts: court, ball, racket, agent. Same stroke and grid.
- Every icon-only button has a Hebrew `aria-label` and a tooltip with its shortcut.
- Directional icons mirror in RTL (see §18).

---

## 8. Motion

Motion communicates state, never decoration.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-instant` | 80ms | linear | Hover, press |
| `motion-fast` | 140ms | `cubic-bezier(0.2, 0, 0, 1)` | Menus, tooltips, row expand |
| `motion-base` | 200ms | same | Panels, dock, sheets |
| `motion-slow` | 320ms | same | Page-level transitions (rare) |

- No bounce or spring overshoot. Things arrive and stop.
- **Live data:** changed values flash `--optic-soft` for 600ms, then settle.
  Counters tick, they don't jump.
- **Live pulse:** a 6px `--live` dot with a 2s opacity pulse. At most one per region.
- **AI streaming:** text streams token by token with a thin Optic caret; no typing dots.
- `prefers-reduced-motion`: all transitions become ≤80ms opacity-only; pulses stop.

---

## 9. Layout & navigation

### Shell

```
RTL: inline-start = right, inline-end = left
┌──────────────────────────────────────────────────────────────┬────┐
│ status strip · ⌘K search · context · page title  (Top bar)   │    │
├──────────────────┬───────────────────────────────────────────┤ R  │
│                  │                                           │ a  │
│  AI dock         │   Main work area                          │ i  │
│  (collapsible)   │   (dense grid of panels/table/timeline)   │ l  │
│                  │                                           │    │
└──────────────────┴───────────────────────────────────────────┴────┘
 ↑ inline-end                                          inline-start ↑
```
(Diagram is drawn as seen on screen: the rail sits on the **right**, the AI dock on the **left**.)

- **Rail** (inline-start, 56px): icons only, grouped into the three areas with
  hairline separators. Tooltip + shortcut on hover. No wide text sidebar.
  - **Operations** (`G O`): Today, Courts & bookings, Inbox, Customers
  - **Growth** (`G G`): Leads, Campaigns, Content, Store
  - **Intelligence** (`G I`): Insights, Agents, Reports
- **Top bar** (44px): page title, local context (filters, date), the search
  trigger, and the **status strip**.
- **Status strip**: always-visible live telemetry in mono, e.g.
  `● 6/8 מגרשים פעילים · 3 שיחות ממתינות (הוותיקה 14 ד׳) · 4 הצעות AI`.
  Each item is clickable and opens its view.
- **AI dock** (inline-end, 380px): persistent and collapsible (`⌘J`). Collapsed
  state is a 44px strip showing agent activity.

### Responsive

| Width | Behavior |
|---|---|
| ≥1440 | Rail + main + open dock |
| 1024–1439 | Dock overlays as a sheet when opened |
| 640–1023 | Rail stays; status strip collapses to a single count chip |
| <640 | Rail becomes a bottom tab bar (Operations · Growth · Intelligence · Search · AI); dock is a full-screen sheet; tables become row lists |

---

## 10. Command palette

The main navigation tool. Opens with `⌘K` / `Ctrl+K` or `/`. Built on `cmdk`.

- 640px wide, `radius-3`, centered at 20% from the top, overlay shadow.
- Input at top: `חפש לקוח, הזמנה, פעולה… או שאל את ה-AI`.
- Result groups in this order: **Actions** (context-aware first), **Customers**,
  **Bookings**, **Conversations**, **Navigate**, **Ask AI**.
- Each row has an icon, label, secondary metadata in `--text-3`, and a shortcut
  hint (`Kbd`) on the inline-end side.
- **Natural-language fallthrough:** if nothing matches, the last row is
  "שאל את ה-AI: ‹query›" and it opens the dock with the query.
- Prefixes: `>` actions only, `@` customers, `#` bookings.
- Context-aware: on a customer page, the top actions are "Send WhatsApp",
  "Book a court", "Add note", "Summarize history".

---

## 11. Tables

Tables are where the owner works, so they get the most care.

- Row height **36px** (compact 32px, toggle per table). Sticky header, 32px,
  `text-meta` weight 500 in `--text-2`.
- `--line-subtle` row separators, no zebra striping, no vertical lines.
- Hover: `--surface-2`. Selected: `--surface-3` plus a 2px inline-start bar.
- Numbers, dates and prices in mono, tabular, **aligned to inline-end**.
- **Row actions** appear on hover/focus at the inline-end: up to 3 icon buttons
  plus a `⋯` menu. On touch they are always visible, collapsed into `⋯`.
- **Signal column:** AI signals shown as compact chips (`סיכון נטישה`, `ליד חם`).
  Hovering one shows *why* (e.g. "no booking in 34 days, previously weekly").
- **Bulk selection:** a floating action bar slides up from the bottom:
  `3 נבחרו · שלח הודעה · הוסף תגית · ייצא`.
- Keyboard: `J`/`K` move, `Enter` opens, `X` selects, `.` asks the AI about the row.
- Column header click sorts; filters live in the top bar as removable tokens.
- Empty and loading states follow §16 and §17.

---

## 12. Inputs & controls

| Element | Spec |
|---|---|
| Input / select | 32px high, `radius-1`, `--surface-2` fill, `--line` border; hover `--line-strong`; focus 2px `--focus` ring (1px offset) — `--optic` in Night, `--optic-ink` in Day, since yellow on white fails contrast |
| Label | Above the field, `text-label`, `--text-2`. No floating labels |
| Help / error | Below the field, `text-meta`; error in `--risk` with an icon, never color alone |
| Button: primary | Inverted neutral fill, 32px, `radius-1`, weight 500 |
| Button: secondary | Transparent, `--line` border |
| Button: ghost | No border; hover `--surface-2` |
| Button: AI | `--optic` fill, `--on-optic` text. Only for AI actions |
| Button: danger | `--risk` text; fill only in confirm dialogs |
| Kbd | 18px, mono 11, `--surface-3`, `radius-1` |
| Chip | 20px, `radius-1` (status) or `radius-full` (counters), soft fill + matching text |

- LTR-only fields (email, phone, URL, IBAN) render `dir="ltr"` with text aligned
  to the inline-start side of the RTL layout.
- Phone numbers are shown in local format (`050-123-4567`) and stored as E.164.

---

## 13. AI assistant patterns

The AI must look like an operator in the room, not a chatbot bolted on.

### Identity

- One visual signature: an **Optic 2px inline-start bar** plus a small agent
  glyph. No gradients, no sparkles, no robot avatars.
- Agents (Reception, Sales, Marketing, Retention, Content, Analyst) each have a
  monochrome glyph and a Hebrew name. The same glyph appears wherever that agent
  acted (timeline, proposals, audit log).
- Agents are **not users**. They never appear in user/account UI. They appear as
  actors with explicit, listed permissions (Intelligence → Agents).

### Surfaces

1. **Dock:** persistent conversation with the system. Knows the current page
   context and shows it as a removable context chip (`הקשר: יוסי כהן`).
2. **Inline signals:** chips and one-line insights inside tables and widgets.
3. **Proposals:** anything the AI wants to *do* (send a message, create an
   offer, change a booking) is a proposal:

```
┃ ◆ סוכן שימור · לפני 2 ד׳
┃ לשלוח ל-11 שחקנים קבועים הצעה ל-ג׳ 18:00–20:00 (3 מגרשים פנויים)
┃ מבוסס על: 8 שבועות של הזמנות · אמינות גבוהה
┃ [אשר ושלח]  [ערוך]  [דחה]              תצוגה מקדימה ›
```

- Always show **basis** (what data it used) and **confidence** (low / medium / high).
- The approve button is the AI button variant. Edit opens the draft inline.
- Approved or executed actions leave a timeline entry signed by the agent and
  approved by the owner.

### Writing style

Short, specific and in Hebrew. Lead with the recommendation, then the reason.
No "Great question!", no emoji.

---

## 14. Notifications

| Severity | Channel | Example |
|---|---|---|
| Urgent | Status strip item turns `--risk` + toast + (later) push | Payment webhook failing; unanswered VIP message > 30 min |
| Attention | "Needs you" queue + status strip count | New conversation, proposal awaiting approval |
| Info | Toast (auto-dismiss 4s) | "הודעה נשלחה" |
| Background | Activity log only | Sync completed |

- Toasts stack at the **bottom, inline-end** corner, at most 3, and each has an
  undo action where possible.
- AI proposals never come as toasts. They go to the queue.
- A notification center (bell in the top bar) groups items by *source*, not by time.

---

## 15. Dashboard widget patterns — "Today" control center

Every widget follows one anatomy:

```
┌ Title · scope · freshness (עודכן לפני 30 ש׳) ········· [actions] ┐
│ Signal: the one thing that matters, in a sentence or big number  │
│ Evidence: compact list / grid / sparkline                         │
│ ◆ Suggested action (AI) ········································· › │
└──────────────────────────────────────────────────────────────────┘
```

### Widget types

- **Queue:** items needing a human. Sorted by urgency, with inline actions.
- **Signal:** a number + delta + *interpretation* ("‎-18% vs usual Tuesday, mostly evening").
- **Court grid:** courts × hours heat grid. **Empty slots are highlighted**,
  not busy ones, because gaps are the opportunity.
- **Feed:** chronological events (bookings, orders) with source icons.
- **Proposal stack:** AI recommendations, each one a proposal (§13).

### Default "Today" layout (desktop, 12 columns, hairline grid)

| Row | Start (cols 1–7) | End (cols 8–12) |
|---|---|---|
| 1 | **Needs you:** conversations waiting + proposals to approve | **Live courts:** now/next 3h grid with gap highlights |
| 2 | **Hot leads** (4 cols) · **At risk** (3 cols) | **Store activity** (Shopify) |
| 3 | **Recent bookings** feed | **AI brief:** 3 prioritized recommendations |

No "total customers" tile. Totals live in reports.

---

## 16. Empty states

- One line saying what would be here, one line saying why it's empty, and one
  action. No illustrations.
- Prefer **positive empties** that report what the system did:
  `אין שיחות ממתינות · סוכן הקבלה טיפל ב-14 שיחות היום`.
- First-run empties explain the connection needed: `חבר את LAZUZ כדי לראות הזמנות →`.

## 17. Loading states

- **Skeletons** that match the final layout (row heights, column widths), in
  `--surface-2` with a slow shimmer (off under reduced motion).
- No full-page spinners. Use streaming (React Suspense) so the shell and the
  status strip render first.
- Inline spinners (12px) only inside buttons during an action.
- Optimistic updates for owner actions (mark read, approve), with rollback and a toast on failure.
- AI responses stream (§8); long agent tasks show step progress ("מחפש הזמנות… ✓").

---

## 18. RTL rules

- `<html lang="he" dir="rtl">` is the base. Components are written direction-agnostic.
- **Logical properties only:** `ms-/me-/ps-/pe-/start-/end-`, `text-start/end`,
  `border-s/e`, `inset-inline-*`. `ml-/mr-/pl-/pr-/left-/right-/text-left` are banned
  (enforce with a lint rule).
- **Mirror:** arrows, chevrons, back/forward, "send", progress direction, sheet
  slide direction, the rail side.
- **Do not mirror:** clocks, media play, checkmarks, logos, brand marks, charts'
  numeric axes, phone and number strings.
- **Time-series charts run left-to-right** (earliest on the left), matching Israeli
  convention in finance and sports data. Chart panels set `dir="ltr"` internally
  and keep Hebrew labels.
- **Bidi isolation:** any user-generated or Latin/number fragment inside Hebrew
  text is wrapped in `<bdi>` or given `dir="auto"` (customer names, emails,
  product names, prices).
- **Formatting** always goes through `Intl` with `he-IL`: currency `ILS`, 24-hour
  time, dates `ג׳ 14.10`, week starts on Sunday. Relative times in Hebrew
  (`לפני 5 ד׳`).
- No uppercase or letter-spaced "eyebrow" labels. Use `text-meta` + `--text-3` instead.
- Keyboard shortcuts use physical keys (`⌘K` works on a Hebrew layout); shortcut
  hints are displayed LTR.

---

## 19. Component inventory (to build, in order)

1. **Tokens:** `globals.css` `@theme` + theme switch (`data-theme` on `<html>`, default dark). The choice is stored in a cookie and read on the server so the first paint is already in the right theme (no flash)
2. **Primitives:** Button, Input, Select, Checkbox, Kbd, Chip, Tooltip, Menu, Dialog, Sheet, Toast, Skeleton
3. **Shell:** Rail, TopBar, StatusStrip, AssistantDock, CommandPalette
4. **Data:** DataTable (TanStack Table), RowActions, BulkBar, FilterTokens
5. **Club-specific:** CourtGrid, CustomerTimeline, ConversationThread
6. **AI:** AgentBadge, InlineSignal, Proposal, StreamingText, ContextChip
7. **Widgets:** Panel anatomy, Queue, Signal, Feed, ProposalStack

Proposed dependencies (none installed yet): `lucide-react`, `cmdk`,
`@radix-ui/*` primitives (behavior only, fully restyled), `@tanstack/react-table`.
Charts are deferred until needed.
