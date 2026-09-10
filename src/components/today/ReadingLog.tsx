import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey, DayRecord, TaskDef } from '../../lib/types'
import { Button, Field } from '../ui'
import './reading.css'
import { useFlushOnHide } from '../../lib/useFlushOnHide'

const DEFAULT_TARGET = 10
const MAX_PAGES = 2000
const QUICK_ADDS = [5, 10]
/** Long enough to swallow a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 400

const fmt = (n: number) => Math.round(n).toLocaleString()
/** Titles are matched loosely, so "dune " and "Dune" count as the same book. */
const titleKey = (title: string) => title.trim().toLowerCase()

/**
 * Holds one pending write and fires it after a pause — or early on demand,
 * when `scope` changes, and on unmount. Writing every keystroke straight to
 * the reducer would re-serialise the whole state on each letter of a title.
 */
function useDeferredWrite(delay: number, scope: string) {
  const pending = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const write = pending.current
    pending.current = null
    write?.()
  }, [])

  const queue = useCallback(
    (write: () => void) => {
      pending.current = write
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  // Each queued write captured its own date, so flushing on a day change lands
  // it on the day it was typed into rather than losing it to the next edit.
  useEffect(() => flush, [flush, scope])
  useFlushOnHide(flush)

  return { queue, flush }
}

/** Distinct titles from the rest of the attempt, most recently read first. */
function bookHistory(days: DayRecord[], date: DateKey): string[] {
  const titles = new Map<string, string>()
  const recentFirst = days
    .filter((d) => d.date !== date && d.reading.book.trim().length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const day of recentFirst) {
    const title = day.reading.book.trim()
    if (!titles.has(titleKey(title))) titles.set(titleKey(title), title)
  }
  return [...titles.values()]
}

/** Whatever they were reading last: the nearest earlier day, else the nearest later one. */
function suggestedBook(days: DayRecord[], date: DateKey): string {
  let before: DayRecord | undefined
  let after: DayRecord | undefined
  for (const day of days) {
    if (day.date === date || !day.reading.book.trim()) continue
    if (day.date < date) {
      if (!before || day.date > before.date) before = day
    } else if (!after || day.date < after.date) {
      after = day
    }
  }
  return (before ?? after)?.reading.book.trim() ?? ''
}

export function ReadingLog({ date, task }: { date: DateKey; task: TaskDef }) {
  const { state, dispatch } = useStore()
  const attempt = state.current
  const { queue: queuePages, flush: flushPages } = useDeferredWrite(COMMIT_DELAY, date)
  const { queue: queueBook, flush: flushBook } = useDeferredWrite(COMMIT_DELAY, date)
  // useId contains colons, which are fine in an id but not in every selector.
  const uid = useId().replace(/:/g, '')
  const pagesId = `rd-pages-${uid}`
  const bookId = `rd-book-${uid}`
  const listId = `rd-books-${uid}`

  const reading = getDay(attempt, date).reading
  const target = task.target && task.target > 0 ? task.target : DEFAULT_TARGET

  const [pagesText, setPagesText] = useState(() => String(reading.pages))
  const [book, setBook] = useState(reading.book)
  const [openDate, setOpenDate] = useState(date)

  // Re-opening a different day swaps the record under the form, so reset the drafts.
  if (openDate !== date) {
    setOpenDate(date)
    setPagesText(String(reading.pages))
    setBook(reading.book)
  }

  const pages = clampPages(pagesText)
  const percent = Math.round((pages / target) * 100)

  // Totals come from the store, but today's number is still a draft for a
  // moment after each tap — count it directly so the totals never lag behind.
  const otherDays = Object.values(attempt.days).filter((d) => d.date !== date)
  const totalPages = otherDays.reduce((sum, d) => sum + d.reading.pages, 0) + pages
  const currentKey = titleKey(book)
  const bookPages = currentKey
    ? otherDays.reduce((sum, d) => (titleKey(d.reading.book) === currentKey ? sum + d.reading.pages : sum), 0) + pages
    : 0

  const history = bookHistory(otherDays, date)
  const suggestion = suggestedBook(otherDays, date)

  function commitPages(value: number, now = false) {
    const next = Math.max(0, Math.min(MAX_PAGES, Math.round(value)))
    setPagesText(String(next))
    queuePages(() => dispatch({ type: 'setReading', date, reading: { pages: next } }))
    if (now) flushPages()
  }

  function typePages(raw: string) {
    setPagesText(raw)
    const next = clampPages(raw)
    queuePages(() => dispatch({ type: 'setReading', date, reading: { pages: next } }))
  }

  function commitBook(value: string, now = false) {
    setBook(value)
    queueBook(() => dispatch({ type: 'setReading', date, reading: { book: value } }))
    if (now) flushBook()
  }

  return (
    <div className="rd">
      <p className="rd-readout" aria-live="polite">
        <span className="rd-readout__value tabular">{fmt(pages)}</span>
        <span className="rd-readout__unit">pages</span>
        <span className="rd-readout__rest tabular">
          / {fmt(target)} · {percent}%
        </span>
        {pages >= target ? <span className="rd-pill">Target met</span> : null}
      </p>

      <div className="rd-bar" aria-hidden="true">
        <span className="rd-bar__fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>

      <Field label="Pages read" id={pagesId}>
        <div className="rd-stepper">
          <button
            type="button"
            className="rd-step"
            disabled={pages <= 0}
            aria-label="One page fewer"
            onClick={() => commitPages(pages - 1, true)}
          >
            <span aria-hidden="true">−</span>
          </button>
          <input
            id={pagesId}
            className="field__input rd-stepper__input tabular"
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            max={MAX_PAGES}
            value={pagesText}
            onChange={(event) => typePages(event.target.value)}
            onBlur={() => {
              setPagesText(String(pages))
              flushPages()
            }}
          />
          <button
            type="button"
            className="rd-step"
            disabled={pages >= MAX_PAGES}
            aria-label="One page more"
            onClick={() => commitPages(pages + 1, true)}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </Field>

      <div className="rd-chips" role="group" aria-label="Adjust pages">
        {QUICK_ADDS.map((amount) => (
          <button
            key={amount}
            type="button"
            className="rd-chip"
            aria-label={`Add ${amount} pages`}
            onClick={() => commitPages(pages + amount, true)}
          >
            +{amount}
          </button>
        ))}
        <Button size="sm" variant="ghost" disabled={pages <= 0} onClick={() => commitPages(0, true)}>
          Clear pages
        </Button>
      </div>

      <Field label="Book" id={bookId} hint={history.length > 0 ? 'Titles you have logged before autocomplete' : undefined}>
        <input
          id={bookId}
          className="field__input"
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          list={listId}
          placeholder={suggestion || 'Anything counts'}
          value={book}
          onChange={(event) => commitBook(event.target.value)}
          onBlur={() => {
            // Only rewrite when trimming actually changes something; a blur on
            // an untouched field should not churn the stored record.
            if (book.trim() === book) flushBook()
            else commitBook(book.trim(), true)
          }}
        />
        <datalist id={listId}>
          {history.map((title) => (
            <option key={title} value={title} />
          ))}
        </datalist>
      </Field>

      {/* The suggestion stays a placeholder until it is tapped: guessing the
          title into the record would fake data on a day they never read. */}
      {suggestion && !book.trim() ? (
        <button type="button" className="rd-suggest" onClick={() => commitBook(suggestion, true)}>
          <span className="rd-suggest__label">Still reading</span>
          <span className="rd-suggest__title">{suggestion}</span>
        </button>
      ) : null}

      <dl className="rd-totals">
        <div className="rd-total">
          <dt className="rd-total__label">This attempt</dt>
          <dd className="rd-total__value tabular">{fmt(totalPages)} pages</dd>
        </div>
        {currentKey ? (
          <div className="rd-total">
            <dt className="rd-total__label">On {book.trim()}</dt>
            <dd className="rd-total__value tabular">{fmt(bookPages)} pages</dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

function clampPages(text: string): number {
  const n = Math.round(Number(text))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(MAX_PAGES, n)
}
