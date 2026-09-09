import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey, TaskDef } from '../../lib/types'
import { Field } from '../ui'
import './trackers.css'

const DEFAULT_TARGET = 45
const QUICK_MINUTES = [30, 45, 60, 75, 90]
const MAX_MINUTES = 600
/** Long enough to swallow a drag or a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 400

interface TrackVars extends CSSProperties {
  '--tk-fill'?: number
  '--tk-target'?: number
}

/**
 * Holds the latest pending write per field and lets the caller fire them
 * early. Without this, a slider drag and a typed workout name would each
 * re-serialise the whole state to localStorage dozens of times.
 */
function useDeferredCommits(delay: number) {
  const pending = useRef(new Map<string, () => void>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const writes = [...pending.current.values()]
    pending.current.clear()
    for (const write of writes) write()
  }, [])

  const defer = useCallback(
    (field: string, run: () => void) => {
      pending.current.set(field, run)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  // Closing the day mid-edit must not lose it; each pending write captured its
  // own date, so it still lands on the day it was typed into.
  useEffect(() => flush, [flush])

  return { defer, flush }
}

export function WorkoutTracker({ date, task }: { date: DateKey; task: TaskDef }) {
  const { state, dispatch } = useStore()
  const { defer, flush } = useDeferredCommits(COMMIT_DELAY)
  const uid = useId().replace(/:/g, '')
  const minutesId = `tk-workout-minutes-${uid}`
  const kindId = `tk-workout-kind-${uid}`

  const workout = getDay(state.current, date).workout
  const target = task.target && task.target > 0 ? task.target : DEFAULT_TARGET
  const sliderMax = Math.max(120, Math.min(MAX_MINUTES, Math.ceil((target * 2) / 15) * 15))

  const [minutesText, setMinutesText] = useState(() => String(workout.minutes))
  const [kind, setKind] = useState(workout.kind)
  const [openDate, setOpenDate] = useState(date)

  // Re-opening a past day swaps the record under the form, so reset the drafts.
  if (openDate !== date) {
    setOpenDate(date)
    setMinutesText(String(workout.minutes))
    setKind(workout.kind)
  }

  const minutes = clampMinutes(minutesText)
  const percent = Math.round((minutes / target) * 100)

  function commitMinutes(value: number, now = false) {
    const next = Math.max(0, Math.min(MAX_MINUTES, Math.round(value)))
    setMinutesText(String(next))
    defer('minutes', () => dispatch({ type: 'setWorkout', date, workout: { minutes: next } }))
    if (now) flush()
  }

  function typeMinutes(raw: string) {
    setMinutesText(raw)
    const next = clampMinutes(raw)
    defer('minutes', () => dispatch({ type: 'setWorkout', date, workout: { minutes: next } }))
  }

  function typeKind(value: string) {
    setKind(value)
    defer('kind', () => dispatch({ type: 'setWorkout', date, workout: { kind: value } }))
  }

  const trackStyle: TrackVars = {
    '--tk-fill': Math.max(0, Math.min(1, minutes / sliderMax)),
    '--tk-target': Math.max(0, Math.min(1, target / sliderMax)),
  }

  return (
    <div className="tk tk-workout">
      <p className="tk-readout" aria-live="polite">
        <span className="tk-readout__value tabular">{minutes}</span>
        <span className="tk-readout__unit">min</span>
        <span className="tk-readout__rest tabular">
          / {target} min · {percent}%
        </span>
        {minutes >= target ? <span className="tk-pill">Target met</span> : null}
      </p>

      <div className="tk-bar">
        <span className="tk-bar__fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>

      <div className="tk-range-wrap" style={trackStyle}>
        <span className="tk-range__tick" aria-hidden="true" />
        <input
          className="tk-range"
          type="range"
          min={0}
          max={sliderMax}
          step={1}
          value={Math.min(minutes, sliderMax)}
          aria-label="Workout minutes"
          aria-valuetext={`${minutes} minutes`}
          onChange={(event) => commitMinutes(Number(event.target.value))}
          onPointerUp={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
        <div className="tk-scale" aria-hidden="true">
          <span>0</span>
          <span className="tabular">{sliderMax} min</span>
        </div>
        <span className="tk-range__goal tabular" aria-hidden="true">
          goal {target}
        </span>
      </div>

      <div className="tk-chips" role="group" aria-label="Common workout lengths">
        {QUICK_MINUTES.map((value) => (
          <button
            key={value}
            type="button"
            className="tk-chip"
            aria-pressed={minutes === value}
            onClick={() => commitMinutes(value, true)}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="tk-fields">
        <Field label="Minutes" id={minutesId}>
          <input
            id={minutesId}
            className="field__input tabular"
            type="number"
            inputMode="numeric"
            step={5}
            min={0}
            max={MAX_MINUTES}
            value={minutesText}
            onChange={(event) => typeMinutes(event.target.value)}
            onBlur={() => {
              setMinutesText(String(minutes))
              flush()
            }}
          />
        </Field>

        <Field label="What did you do?" id={kindId}>
          <input
            id={kindId}
            className="field__input"
            type="text"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Push day, Zone 2 run…"
            value={kind}
            onChange={(event) => typeKind(event.target.value)}
            onBlur={flush}
          />
        </Field>
      </div>

      <label className="tk-switch">
        <input
          className="tk-switch__input"
          type="checkbox"
          checked={workout.outdoors}
          onChange={(event) => dispatch({ type: 'setWorkout', date, workout: { outdoors: event.target.checked } })}
        />
        <span className="tk-switch__text">
          Outdoors
          <span className="tk-switch__hint">Rain counts. It always counts.</span>
        </span>
        <span className="tk-switch__track" aria-hidden="true">
          <span className="tk-switch__thumb" />
        </span>
      </label>
    </div>
  )
}

function clampMinutes(text: string): number {
  const n = Math.round(Number(text))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(MAX_MINUTES, n)
}
