import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey, MacroEntry, TaskDef } from '../../lib/types'
import { MealScannerModal } from './MealScannerModal'
import type { MealTotals } from '../../lib/aiFoodVision'
import './macros.css'
import { useFlushOnHide } from '../../lib/useFlushOnHide'

type MacroKey = 'protein' | 'carbs' | 'fat' | 'calories'
type GramKey = Exclude<MacroKey, 'calories'>

interface MacroSpec {
  label: string
  unit: 'g' | 'kcal'
  /** Spoken unit, for the stepper buttons' labels. */
  unitWord: string
  tint: string
  /** One tap of − or +. */
  step: number
  max: number
}

const SPEC: Record<MacroKey, MacroSpec> = {
  protein: { label: 'Protein', unit: 'g', unitWord: 'grams', tint: 'var(--task-photo)', step: 10, max: 600 },
  carbs: { label: 'Carbs', unit: 'g', unitWord: 'grams', tint: 'var(--task-water)', step: 10, max: 1200 },
  fat: { label: 'Fat', unit: 'g', unitWord: 'grams', tint: 'var(--task-reading)', step: 5, max: 400 },
  calories: { label: 'Calories', unit: 'kcal', unitWord: 'kilocalories', tint: 'var(--task-macros)', step: 100, max: 12000 },
}

/** Calories last: it is the total, and its suggestion sits under the parts. */
const ORDER: MacroKey[] = ['protein', 'carbs', 'fat', 'calories']
const SPLIT: GramKey[] = ['protein', 'carbs', 'fat']
/** Atwater factors — what one gram of each macro is worth in kcal. */
const KCAL_PER_GRAM: Record<GramKey, number> = { protein: 4, carbs: 4, fat: 9 }

/** Long enough to swallow a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 350
const RING_SIZE = 96
const RING_STROKE = 12

function fmt(n: number, unit: 'g' | 'kcal' = 'kcal'): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: unit === 'g' ? 1 : 0 })
}

function parseValue(text: string, max: number): number {
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(max, Math.round(n * 10) / 10)
}

/** A zero reads better as an empty field than as a "0" the user has to delete. */
function draftFrom(entry: MacroEntry): Record<MacroKey, string> {
  const text = (n: number) => (n > 0 ? String(Math.round(n * 10) / 10) : '')
  return {
    protein: text(entry.protein),
    carbs: text(entry.carbs),
    fat: text(entry.fat),
    calories: text(entry.calories),
  }
}

function patchFor(key: MacroKey, value: number): Partial<MacroEntry> {
  const patch: Partial<MacroEntry> = {}
  patch[key] = value
  return patch
}

/**
 * Whole percentages that still add up to 100 — an even split should read
 * 34/33/33 rather than three rounded thirds that visibly miss.
 */
function wholePercents(parts: number[], total: number): number[] {
  if (total <= 0) return parts.map(() => 0)
  const exact = parts.map((p) => (p / total) * 100)
  const out = exact.map(Math.floor)
  let spare = 100 - out.reduce((a, b) => a + b, 0)
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
  for (const { index } of byRemainder) {
    if (spare <= 0) break
    out[index] = (out[index] ?? 0) + 1
    spare -= 1
  }
  return out
}

/**
 * Holds one pending macro write so a keystroke does not re-serialise the whole
 * state to localStorage. The patch carries its own date, so a write started on
 * one day still lands there if the view moves on before it flushes.
 */
function useMacroCommit(date: DateKey) {
  const { dispatch } = useStore()
  const pending = useRef<{ date: DateKey; patch: Partial<MacroEntry> } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const held = pending.current
    pending.current = null
    if (held) dispatch({ type: 'setMacros', date: held.date, macros: held.patch })
  }, [dispatch])

  const queue = useCallback(
    (patch: Partial<MacroEntry>) => {
      if (pending.current && pending.current.date !== date) flush()
      pending.current = { date, patch: { ...pending.current?.patch, ...patch } }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, COMMIT_DELAY)
    },
    [date, flush],
  )

  const commit = useCallback(
    (patch: Partial<MacroEntry>) => {
      queue(patch)
      flush()
    },
    [queue, flush],
  )

  // Collapsing the task unmounts the tracker mid-edit; the pending write must
  // still land.
  useEffect(() => flush, [flush])
  useFlushOnHide(flush)

  return { queue, commit, flush }
}

interface RowVars extends CSSProperties {
  '--mc-tint'?: string
}

export function MacroTracker({ date, task }: { date: DateKey; task: TaskDef }) {
  const { state, today } = useStore()
  const { queue, commit, flush } = useMacroCommit(date)
  const uid = useId().replace(/:/g, '')

  const entry = getDay(state.current, date).macros
  const targets = state.current.macroTargets

  const [draft, setDraft] = useState<Record<MacroKey, string>>(() => draftFrom(entry))
  const [openDate, setOpenDate] = useState(date)

  // Re-opening a different day swaps the record under the form, so reset drafts.
  if (openDate !== date) {
    setOpenDate(date)
    setDraft(draftFrom(entry))
  }

  const [scannerOpen, setScannerOpen] = useState(false)

  const values: Record<MacroKey, number> = {
    protein: parseValue(draft.protein, SPEC.protein.max),
    carbs: parseValue(draft.carbs, SPEC.carbs.max),
    fat: parseValue(draft.fat, SPEC.fat.max),
    calories: parseValue(draft.calories, SPEC.calories.max),
  }

  function handleApplyMeal(totals: MealTotals, mode: 'add' | 'replace') {
    if (mode === 'add') {
      const p = Math.max(0, Math.round((values.protein + totals.protein) * 10) / 10)
      const c = Math.max(0, Math.round((values.carbs + totals.carbs) * 10) / 10)
      const f = Math.max(0, Math.round((values.fat + totals.fat) * 10) / 10)
      const cal = Math.max(0, Math.round(values.calories + totals.calories))
      setDraft({
        protein: String(p),
        carbs: String(c),
        fat: String(f),
        calories: String(cal),
      })
      commit({ protein: p, carbs: c, fat: f, calories: cal, logged: true })
    } else {
      setDraft({
        protein: String(totals.protein),
        carbs: String(totals.carbs),
        fat: String(totals.fat),
        calories: String(totals.calories),
      })
      commit({
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        calories: totals.calories,
        logged: true,
      })
    }
  }

  const kcalParts = SPLIT.map((key) => values[key] * KCAL_PER_GRAM[key])
  const fromMacros = kcalParts.reduce((a, b) => a + b, 0)
  const percents = wholePercents(kcalParts, fromMacros)
  const suggested = Math.round(fromMacros)
  // Never rewrite a number the user typed: offer it, let them take it.
  const suggestionOpen = suggested > 0 && suggested !== Math.round(values.calories)

  const setField = (key: MacroKey, text: string) => setDraft((current) => ({ ...current, [key]: text }))

  function typeValue(key: MacroKey, raw: string) {
    setField(key, raw)
    queue(patchFor(key, parseValue(raw, SPEC[key].max)))
  }

  function bump(key: MacroKey, delta: number) {
    const next = Math.max(0, Math.min(SPEC[key].max, Math.round((values[key] + delta) * 10) / 10))
    setField(key, next > 0 ? String(next) : '')
    commit(patchFor(key, next))
  }

  function normalise(key: MacroKey) {
    const value = values[key]
    setField(key, value > 0 ? String(value) : '')
    flush()
  }

  const radius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  let travelled = 0
  const arcs = SPLIT.map((key, index) => {
    const length = fromMacros > 0 ? ((kcalParts[index] ?? 0) / fromMacros) * circumference : 0
    const arc = { key, length, offset: travelled }
    travelled += length
    return arc
  })

  return (
    <div className="mc">
      <div className="mc-ai-bar">
        <button
          type="button"
          className="mc-ai-btn"
          onClick={() => setScannerOpen(true)}
          aria-label="Scan meal photo with AI to estimate ingredients and macros"
        >
          <span className="mc-ai-btn__icon" aria-hidden="true">
            📸
          </span>
          <span className="mc-ai-btn__content">
            <span className="mc-ai-btn__title">Estimate from meal photo</span>
            <span className="mc-ai-btn__sub">AI ingredient detection & portion weights with human review</span>
          </span>
          <span className="mc-ai-btn__arrow" aria-hidden="true">
            &rarr;
          </span>
        </button>
      </div>

      <MealScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onApply={handleApplyMeal}
        currentMacros={values}
      />

      <div className="mc-summary" aria-live="polite">
        <div className="mc-ring">
          <svg
            className="mc-ring__svg"
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            aria-hidden="true"
            focusable="false"
          >
            <circle
              className="mc-ring__track"
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={radius}
              fill="none"
              strokeWidth={RING_STROKE}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                className="mc-ring__arc"
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                strokeWidth={RING_STROKE}
                strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                strokeDashoffset={-arc.offset}
                style={{ stroke: SPEC[arc.key].tint }}
              />
            ))}
          </svg>
          <p className="mc-ring__label">
            <span className="mc-ring__value tabular">{fmt(suggested)}</span>
            <span className="mc-ring__unit">kcal</span>
          </p>
        </div>

        <ul className="mc-legend">
          {SPLIT.map((key, index) => (
            <li key={key} className="mc-legend__item">
              <span className="mc-legend__dot" style={{ background: SPEC[key].tint }} aria-hidden="true" />
              <span className="mc-legend__name">{SPEC[key].label}</span>
              <span className="mc-legend__pct tabular">{percents[index] ?? 0}%</span>
            </li>
          ))}
        </ul>

        <p className="mc-caption">
          {fromMacros > 0 ? 'Calories from protein, carbs and fat' : 'Enter your macros to see the split'}
        </p>
      </div>

      <div className="mc-rows">
        {ORDER.map((key) => {
          const spec = SPEC[key]
          const value = values[key]
          const target = targets[key]
          const inputId = `mc-${key}-${uid}`
          const footId = `mc-${key}-foot-${uid}`

          const hasTarget = target > 0
          const over = hasTarget && value > target
          // Past the target the bar rescales to the actual, so the overshoot
          // has somewhere to go instead of silently clipping at 100%.
          const scale = over ? value : target
          const fillPercent = hasTarget ? (Math.min(value, target) / scale) * 100 : 0
          const overPercent = over ? ((value - target) / scale) * 100 : 0
          const delta = target - value

          let deltaText = 'No target set'
          let deltaTone = ''
          if (over) {
            deltaText = `${fmt(-delta, spec.unit)} ${spec.unit} over`
            deltaTone = ' mc-row__delta--over'
          } else if (hasTarget && delta === 0) {
            deltaText = 'Target met'
            deltaTone = ' mc-row__delta--met'
          } else if (hasTarget) {
            deltaText = `${fmt(delta, spec.unit)} ${spec.unit} left`
          }

          return (
            <div key={key} className="mc-row" style={{ '--mc-tint': spec.tint } as RowVars}>
              <div className="mc-row__head">
                <label className="mc-row__label" htmlFor={inputId}>
                  {spec.label}
                </label>
                <div className="mc-input">
                  <button
                    type="button"
                    className="mc-step"
                    disabled={value <= 0}
                    aria-label={`Take ${spec.step} ${spec.unitWord} off ${spec.label.toLowerCase()}`}
                    onClick={() => bump(key, -spec.step)}
                  >
                    <span aria-hidden="true">−</span>
                  </button>
                  <input
                    id={inputId}
                    className="mc-input__field tabular"
                    type="number"
                    inputMode="decimal"
                    step={spec.unit === 'g' ? 1 : 10}
                    min={0}
                    max={spec.max}
                    placeholder="0"
                    enterKeyHint="done"
                    aria-describedby={footId}
                    value={draft[key]}
                    onChange={(event) => typeValue(key, event.target.value)}
                    onBlur={() => normalise(key)}
                  />
                  <span className="mc-input__unit" aria-hidden="true">
                    {spec.unit}
                  </span>
                  <button
                    type="button"
                    className="mc-step"
                    disabled={value >= spec.max}
                    aria-label={`Add ${spec.step} ${spec.unitWord} of ${spec.label.toLowerCase()}`}
                    onClick={() => bump(key, spec.step)}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
              </div>

              <div className="mc-bar" aria-hidden="true">
                <span className="mc-bar__fill" style={{ width: `${fillPercent}%` }} />
                <span className="mc-bar__over" style={{ width: `${overPercent}%` }} />
              </div>

              <p className="mc-row__foot" id={footId}>
                <span className="tabular">
                  {hasTarget
                    ? `${fmt(value, spec.unit)} / ${fmt(target, spec.unit)} ${spec.unit}`
                    : `${fmt(value, spec.unit)} ${spec.unit}`}
                </span>
                <span className={`mc-row__delta${deltaTone}`}>{deltaText}</span>
              </p>

              {key === 'calories' && suggestionOpen ? (
                <button
                  type="button"
                  className="mc-suggest"
                  onClick={() => {
                    setField('calories', String(suggested))
                    commit({ calories: suggested })
                  }}
                >
                  <span className="mc-suggest__text">
                    {value > 0 ? 'Your macros work out to' : 'Calories from your macros'}
                    <span className="mc-suggest__value tabular">{fmt(suggested)} kcal</span>
                  </span>
                  <span className="mc-suggest__cta">{value > 0 ? 'Replace' : 'Use it'}</span>
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <button type="button" className="mc-log" aria-pressed={entry.logged} onClick={() => commit({ logged: !entry.logged })}>
        <span className="mc-log__icon" aria-hidden="true">
          {task.icon}
        </span>
        <span className="mc-log__text">
          <span className="mc-log__title">
            {entry.logged ? 'Macros logged' : `Mark macros logged${date === today ? ' for today' : ''}`}
          </span>
          <span className="mc-log__hint">
            {entry.logged
              ? 'Turn this off if the day is not done with you yet.'
              : 'Numbers alone do not tick the rule — confirm once the food is in.'}
          </span>
        </span>
        <span className="mc-log__switch" aria-hidden="true">
          <span className="mc-log__thumb" />
        </span>
      </button>
    </div>
  )
}
