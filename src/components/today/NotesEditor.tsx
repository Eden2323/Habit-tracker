import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey } from '../../lib/types'
import { Button } from '../ui'
import './reading.css'
import { useFlushOnHide } from '../../lib/useFlushOnHide'

/** Long enough to swallow a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 400
/** Below this a counter is just noise; above it, people start wondering. */
const COUNT_FROM = 240
const PROMPT = 'How did today go? What was hard?'

export function NotesEditor({ date }: { date: DateKey }) {
  const { state, dispatch } = useStore()
  const note = getDay(state.current, date).note
  const uid = useId().replace(/:/g, '')
  const panelId = `rd-note-panel-${uid}`
  const fieldId = `rd-note-field-${uid}`

  const [open, setOpen] = useState(false)
  const [text, setText] = useState(note)
  const [draftDate, setDraftDate] = useState(date)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const card = useRef<HTMLButtonElement>(null)
  const opened = useRef(false)
  const pending = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Moving to another day swaps the record under the textarea.
  if (draftDate !== date) {
    setDraftDate(date)
    setText(note)
  }

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const write = pending.current
    pending.current = null
    write?.()
  }, [])

  useFlushOnHide(flush)

  // A sentence half-typed when the day changes — or when the view goes away —
  // still belongs to the day it was written on, and the queued write captured
  // that date, so landing it late is still landing it correctly.
  useEffect(() => flush, [flush, date])

  // Grow to fit rather than making them scroll a four-line box one-handed.
  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text, open])

  // Follow the toggle with the focus: into the textarea on open, back onto the
  // card on close. `opened` keeps the first render from grabbing focus at all.
  useEffect(() => {
    if (open) {
      opened.current = true
      const el = textarea.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    } else if (opened.current) {
      opened.current = false
      card.current?.focus()
    }
  }, [open])

  function edit(value: string) {
    setText(value)
    pending.current = () => dispatch({ type: 'setNote', date, note: value })
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(flush, COMMIT_DELAY)
  }

  if (!open) {
    const preview = text.split('\n').find((line) => line.trim().length > 0) ?? ''
    return (
      <button
        type="button"
        ref={card}
        className={preview ? 'rd-note rd-note--closed rd-note--filled' : 'rd-note rd-note--closed'}
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        <span className="rd-note__icon" aria-hidden="true">
          {preview ? '📓' : '📝'}
        </span>
        <span className="rd-note__summary">
          <span className="rd-note__title">{preview ? 'Note' : 'Add a note'}</span>
          <span className="rd-note__preview">{preview || PROMPT}</span>
        </span>
        <svg className="rd-note__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 10l4 4 4-4" />
        </svg>
      </button>
    )
  }

  return (
    <section className="rd-note rd-note--open">
      <div className="rd-note__head">
        <h2 className="rd-note__heading">Note</h2>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={true}
          aria-controls={panelId}
          onClick={() => {
            flush()
            setOpen(false)
          }}
        >
          Done
        </Button>
      </div>

      <div id={panelId}>
        <label className="visually-hidden" htmlFor={fieldId}>
          Note for this day
        </label>
        <textarea
          id={fieldId}
          ref={textarea}
          className="rd-note__input"
          rows={3}
          placeholder={PROMPT}
          value={text}
          onChange={(event) => edit(event.target.value)}
          onBlur={flush}
        />
        <p className="rd-note__foot">
          <span>Saved as you type</span>
          {text.length >= COUNT_FROM ? <span className="tabular">{text.length} characters</span> : null}
        </p>
      </div>
    </section>
  )
}
