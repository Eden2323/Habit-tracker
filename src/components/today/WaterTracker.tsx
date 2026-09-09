import { useId, useState, type FormEvent } from 'react'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey, TaskDef } from '../../lib/types'
import { Button, Field } from '../ui'
import './trackers.css'

const DEFAULT_TARGET = 2000
const DEFAULT_INCREMENT = 250
/** Beyond this the row stops being a row and starts being a wall of buttons. */
const MAX_GLASSES = 24

/** Tumbler outline, in the 28×36 user space shared by the icon and its clip. */
const GLASS_PATH = 'M6 4 H22 L19.9 30.7 C19.8 32 18.8 33 17.5 33 H10.5 C9.2 33 8.2 32 8.1 30.7 Z'

const fmt = (n: number) => Math.round(n).toLocaleString()

export function WaterTracker({ date, task }: { date: DateKey; task: TaskDef }) {
  const { state, dispatch } = useStore()
  const [custom, setCustom] = useState('')
  // useId contains colons, which are fine in an id but not in a url() lookup.
  const uid = useId().replace(/:/g, '')
  const clipId = `tk-glass-${uid}`
  const customId = `tk-water-custom-${uid}`

  const ml = getDay(state.current, date).water
  const target = task.target && task.target > 0 ? task.target : DEFAULT_TARGET
  const increment = state.settings.waterIncrement > 0 ? state.settings.waterIncrement : DEFAULT_INCREMENT
  const glasses = Math.min(MAX_GLASSES, Math.max(1, Math.ceil(target / increment)))
  const percent = Math.round((ml / target) * 100)
  const over = ml - target

  function tapGlass(n: number) {
    // Tapping the glass that already *is* the total empties it, so an
    // overshoot costs one tap to undo rather than a trip to the number pad.
    const next = ml === n * increment ? (n - 1) * increment : n * increment
    dispatch({ type: 'setWater', date, ml: next })
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault()
    const amount = Math.round(Number(custom))
    if (!custom.trim() || !Number.isFinite(amount) || amount === 0) return
    dispatch({ type: 'addWater', date, ml: amount })
    setCustom('')
  }

  return (
    <div className="tk tk-water">
      <svg className="tk-defs" aria-hidden="true" focusable="false" width="0" height="0">
        <defs>
          <clipPath id={clipId}>
            <path d={GLASS_PATH} />
          </clipPath>
        </defs>
      </svg>

      <p className="tk-readout" aria-live="polite">
        <span className="tk-readout__value tabular">{fmt(ml)}</span>
        <span className="tk-readout__unit">ml</span>
        <span className="tk-readout__rest tabular">
          / {fmt(target)} ml · {percent}%
        </span>
        {over > 0 ? <span className="tk-pill">+{fmt(over)} ml over</span> : null}
        {over === 0 && ml > 0 ? <span className="tk-pill">Target met</span> : null}
      </p>

      <div className="tk-glasses" role="group" aria-label={`Water, ${fmt(increment)} ml per glass`}>
        {Array.from({ length: glasses }, (_, i) => {
          const n = i + 1
          const level = Math.max(0, Math.min(1, (ml - (n - 1) * increment) / increment))
          const isTotal = ml === n * increment
          return (
            <button
              key={n}
              type="button"
              className="tk-glass"
              aria-pressed={level >= 1}
              aria-label={
                isTotal
                  ? `Empty glass ${n}, back to ${fmt((n - 1) * increment)} ml`
                  : `Fill to glass ${n}, ${fmt(n * increment)} ml`
              }
              onClick={() => tapGlass(n)}
            >
              <svg className="tk-glass__icon" viewBox="0 0 28 36" aria-hidden="true" focusable="false">
                <g clipPath={`url(#${clipId})`}>
                  <rect className="tk-glass__liquid" x="2" y="3" width="24" height="30" style={{ transform: `scaleY(${level})` }} />
                </g>
                <path className="tk-glass__outline" d={GLASS_PATH} />
              </svg>
            </button>
          )
        })}
      </div>

      <div className="tk-steppers">
        <button
          type="button"
          className="tk-step"
          disabled={ml <= 0}
          aria-label={`Remove ${fmt(increment)} millilitres`}
          onClick={() => dispatch({ type: 'addWater', date, ml: -increment })}
        >
          <span className="tk-step__glyph" aria-hidden="true">−</span>
          <span className="tk-step__text tabular">{fmt(increment)} ml</span>
        </button>
        <button
          type="button"
          className="tk-step"
          aria-label={`Add ${fmt(increment)} millilitres`}
          onClick={() => dispatch({ type: 'addWater', date, ml: increment })}
        >
          <span className="tk-step__glyph" aria-hidden="true">+</span>
          <span className="tk-step__text tabular">{fmt(increment)} ml</span>
        </button>
      </div>

      <form className="tk-custom" onSubmit={submitCustom}>
        <Field label="Custom amount" id={customId} hint="For bottles that aren't a round number of glasses">
          <div className="tk-custom__row">
            <input
              id={customId}
              className="field__input tk-custom__input tabular"
              type="number"
              inputMode="numeric"
              step={10}
              min={0}
              max={5000}
              placeholder="330"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
            <Button type="submit" disabled={!custom.trim()}>
              Add
            </Button>
          </div>
        </Field>
      </form>

      <div className="tk-actions">
        <Button size="sm" variant="ghost" disabled={ml <= 0} onClick={() => dispatch({ type: 'setWater', date, ml: 0 })}>
          Clear water
        </Button>
      </div>
    </div>
  )
}
