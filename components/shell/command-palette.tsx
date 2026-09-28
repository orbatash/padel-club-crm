import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { IconSearch, IconSignal } from '@/components/ui/icons'
import { Kbd } from '@/components/ui/text'
import s from './shell.module.css'

// Command palette foundation (DESIGN_SYSTEM.md §10). Modules register more
// commands later (customers, bookings, context actions) through `commands`.

export type Command = {
  id: string
  group: string
  label: string
  icon: (p: { size?: number; className?: string }) => React.JSX.Element
  shortcut?: string
  keywords?: string
  run: () => void
}

const ASK_AI_GROUP = 'שאל את ה-AI'

export function CommandPalette({
  commands,
  onClose,
  onAskAi,
}: {
  commands: Command[]
  onClose: () => void
  onAskAi: (query: string) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  // Return focus to whatever was focused before the palette opened.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    return () => previous?.focus?.()
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = q
      ? commands.filter((c) => `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase().includes(q))
      : commands
    // Natural-language fallthrough: anything typed can go to the assistant.
    const ask: Command | null = q
      ? {
          id: 'ai:ask',
          group: ASK_AI_GROUP,
          label: `שאל: ${query.trim()}`,
          icon: IconSignal,
          run: () => onAskAi(query.trim()),
        }
      : null
    return ask ? [...matched, ask] : matched
  }, [commands, query, onAskAi])

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0))
  const optionId = (i: number) => `${listId}-option-${i}`

  useEffect(() => {
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [listId, activeIndex])

  const choose = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((activeIndex + 1) % Math.max(results.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((activeIndex - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[activeIndex])
    }
  }

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
          <IconSearch size={16} />
          <input
            className={s.paletteInput}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="חפש פעולה או מסך… או שאל את ה-AI"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className={s.paletteList} id={listId} role="listbox">
          {results.length === 0 && <p className={s.paletteEmpty}>אין תוצאות</p>}
          {results.map((command, i) => {
            const showGroup = i === 0 || results[i - 1].group !== command.group
            const Icon = command.icon
            const isAi = command.group === ASK_AI_GROUP
            return (
              <div key={command.id}>
                {showGroup && <div className={s.paletteGroup}>{command.group}</div>}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`${s.paletteItem} ${i === activeIndex ? s.paletteItemActive : ''}`}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => choose(command)}
                >
                  <Icon size={15} className={isAi ? s.aiGlyph : undefined} />
                  <span className={s.paletteLabel}>{command.label}</span>
                  {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                </div>
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
            <Kbd>esc</Kbd> סגירה
          </span>
        </div>
      </div>
    </div>
  )
}
