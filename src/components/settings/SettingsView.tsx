import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CHALLENGE_LENGTH, addDays, dayNumber, formatLong, isValidDateKey } from '../../lib/date'
import { summarise } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { MacroTargets, Settings } from '../../lib/types'
import { Button, Card, Field, Modal, Segmented, useToast } from '../ui'
import { AttemptHistory } from './AttemptHistory'
import { DataManager } from './DataManager'
import { RulesEditor } from './RulesEditor'
import { clearGeminiApiKey, getGeminiApiKey, setGeminiApiKey } from '../../lib/aiFoodVision'
import './settings.css'

/** Long enough to swallow a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 350

type MacroKey = keyof MacroTargets

const MACRO_FIELDS: { key: MacroKey; label: string; unit: string; max: number; step: number }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', max: 12_000, step: 50 },
  { key: 'protein', label: 'Protein', unit: 'g', max: 1500, step: 5 },
  { key: 'carbs', label: 'Carbs', unit: 'g', max: 1500, step: 5 },
  { key: 'fat', label: 'Fat', unit: 'g', max: 1000, step: 5 },
]

/** Atwater factors — what one gram of each macro is worth in kcal. */
const KCAL_PER_GRAM: Record<Exclude<MacroKey, 'calories'>, number> = { protein: 4, carbs: 4, fat: 9 }

/** Rounding noise is not worth a nudge; a real mismatch is. */
const KCAL_TOLERANCE = 25

const GLASS_PRESETS = [200, 250, 330, 500]

const THEME_OPTIONS: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function clampMacro(text: string, max: number): number {
  const n = Math.round(Number(text))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(max, n)
}

export default function SettingsView() {
  const { state, dispatch, today } = useStore()
  const toast = useToast()
  const uid = useId().replace(/:/g, '')

  const attempt = state.current
  const settings = state.settings
  const targets = attempt.macroTargets

  const [aiKey, setAiKey] = useState<string | null>(() => getGeminiApiKey())
  const [aiKeyDraft, setAiKeyDraft] = useState<string>('')

  function saveAiKey() {
    const key = aiKeyDraft.trim()
    if (!key) return
    setGeminiApiKey(key)
    setAiKey(key)
    setAiKeyDraft('')
    toast('Gemini API key saved')
  }

  function removeAiKey() {
    clearGeminiApiKey()
    setAiKey(null)
    setAiKeyDraft('')
    toast('Gemini API key removed')
  }

  // --- Macro targets -------------------------------------------------------

  const [macroDraft, setMacroDraft] = useState<Partial<Record<MacroKey, string>>>({})
  const pendingTargets = useRef<MacroTargets | null>(null)
  const macroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushTargets = useCallback(() => {
    if (macroTimer.current !== null) clearTimeout(macroTimer.current)
    macroTimer.current = null
    const next = pendingTargets.current
    pendingTargets.current = null
    if (next) dispatch({ type: 'setMacroTargets', targets: next })
  }, [dispatch])

  // Leaving the tab mid-edit must still land the pending write.
  useEffect(() => flushTargets, [flushTargets])

  const macroValue = (key: MacroKey): string => macroDraft[key] ?? String(targets[key])

  function targetsFrom(draft: Partial<Record<MacroKey, string>>): MacroTargets {
    const read = (key: MacroKey): number => {
      const text = draft[key]
      const field = MACRO_FIELDS.find((f) => f.key === key)
      return text === undefined ? targets[key] : clampMacro(text, field?.max ?? 0)
    }
    return { calories: read('calories'), protein: read('protein'), carbs: read('carbs'), fat: read('fat') }
  }

  function typeMacro(key: MacroKey, text: string) {
    const draft = { ...macroDraft, [key]: text }
    setMacroDraft(draft)
    pendingTargets.current = targetsFrom(draft)
    if (macroTimer.current !== null) clearTimeout(macroTimer.current)
    macroTimer.current = setTimeout(flushTargets, COMMIT_DELAY)
  }

  function commitMacro(key: MacroKey) {
    flushTargets()
    setMacroDraft((current) => {
      if (current[key] === undefined) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const live = targetsFrom(macroDraft)
  const impliedKcal = Math.round(
    live.protein * KCAL_PER_GRAM.protein + live.carbs * KCAL_PER_GRAM.carbs + live.fat * KCAL_PER_GRAM.fat,
  )
  const kcalGap = impliedKcal - live.calories
  const showKcalNudge = impliedKcal > 0 && Math.abs(kcalGap) > KCAL_TOLERANCE

  function matchCalories() {
    setMacroDraft((current) => ({ ...current, calories: String(impliedKcal) }))
    pendingTargets.current = { ...live, calories: impliedKcal }
    flushTargets()
  }

  // --- Water glass ---------------------------------------------------------

  const [glassDraft, setGlassDraft] = useState<string | null>(null)
  const glassValue = glassDraft ?? String(settings.waterIncrement)

  function typeGlass(text: string) {
    setGlassDraft(text)
    const n = Math.round(Number(text))
    if (Number.isFinite(n) && n >= 50 && n <= 2000) dispatch({ type: 'setSettings', settings: { waterIncrement: n } })
  }

  function pickGlass(ml: number) {
    setGlassDraft(null)
    dispatch({ type: 'setSettings', settings: { waterIncrement: ml } })
  }

  // --- Theme ---------------------------------------------------------------

  // The app shell is the right home for this once it mounts — the attribute has
  // to be set on first paint, not when Settings happens to be open. Keeping it
  // here as well means the control still works on its own.
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  // --- Start date ----------------------------------------------------------

  const [startDraft, setStartDraft] = useState(attempt.startDate)
  const [seenStart, setSeenStart] = useState(attempt.startDate)
  // A restart swaps the attempt under the form, so re-read its start date.
  if (seenStart !== attempt.startDate) {
    setSeenStart(attempt.startDate)
    setStartDraft(attempt.startDate)
  }

  const earliestStart = addDays(today, -(CHALLENGE_LENGTH - 1))
  let startError: string | null = null
  if (!isValidDateKey(startDraft)) startError = 'Pick a real date.'
  else if (startDraft > today) startError = 'Day 1 cannot be in the future.'
  else if (startDraft < earliestStart) startError = `That is over ${CHALLENGE_LENGTH} days ago — the challenge would already be over.`

  function typeStart(value: string) {
    setStartDraft(value)
    if (isValidDateKey(value) && value <= today && value >= earliestStart) {
      dispatch({ type: 'setStartDate', date: value })
    }
  }

  // --- Restart -------------------------------------------------------------

  const [restartOpen, setRestartOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const summary = summarise(attempt, today)

  function openRestart() {
    setUnderstood(false)
    setRestartOpen(true)
  }

  function restart() {
    dispatch({ type: 'restart', reason: 'abandoned', startDate: today })
    setRestartOpen(false)
    toast('Archived. You are back on day 1.')
  }

  return (
    <div className="st-view">
      <header className="st-view__head">
        <h2 className="st-view__title">Settings</h2>
        <p className="st-view__sub">Day {summary.dayNumber} of {CHALLENGE_LENGTH}</p>
      </header>

      <RulesEditor />

      <Card title="Macro targets">
        <div className="st-grid">
          {MACRO_FIELDS.map((field) => (
            <Field key={field.key} label={`${field.label} (${field.unit})`} id={`st-macro-${uid}-${field.key}`}>
              <input
                id={`st-macro-${uid}-${field.key}`}
                className="field__input tabular"
                type="number"
                inputMode="numeric"
                min={0}
                max={field.max}
                step={field.step}
                enterKeyHint="done"
                value={macroValue(field.key)}
                onChange={(event) => typeMacro(field.key, event.target.value)}
                onBlur={() => commitMacro(field.key)}
              />
            </Field>
          ))}
        </div>

        <p className="st-implied" aria-live="polite">
          Your grams add up to <span className="tabular">{impliedKcal.toLocaleString()} kcal</span>
          {showKcalNudge
            ? ` — ${Math.abs(kcalGap).toLocaleString()} ${kcalGap > 0 ? 'above' : 'below'} your calorie target.`
            : '.'}
        </p>

        {showKcalNudge ? (
          <Button onClick={matchCalories}>
            Set calories to {impliedKcal.toLocaleString()}
          </Button>
        ) : null}

        <p className="st-hint">A target of 0 turns that number off in the day&rsquo;s macro tracker.</p>
      </Card>

      <Card title="AI Meal Scanner">
        <Field
          label="Gemini Vision API Key"
          id={`st-gemini-${uid}`}
          hint="Powers photo meal analysis. Stored locally in your browser and connects directly to Google Gemini."
        >
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              id={`st-gemini-${uid}`}
              className="field__input"
              type="password"
              placeholder={aiKey ? '••••••••••••••••••••' : 'Paste your API key'}
              value={aiKeyDraft}
              onChange={(e) => setAiKeyDraft(e.target.value)}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={saveAiKey}
              disabled={!aiKeyDraft.trim() || aiKeyDraft.trim() === aiKey}
            >
              Save
            </Button>
            {aiKey ? (
              <Button variant="ghost" size="sm" onClick={removeAiKey}>
                Clear
              </Button>
            ) : null}
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.85rem', color: aiKey ? 'var(--success)' : 'var(--text-muted)' }}>
            {aiKey ? '✓ Key configured' : 'No key set'}
          </span>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
          >
            Get a free key at Google AI Studio &rarr;
          </a>
        </div>
      </Card>

      <Card title="Water">
        <Field
          label="Glass size"
          id={`st-glass-${uid}`}
          hint="One tap of the water tracker's + button adds this much"
        >
          <div className="st-measure">
            <input
              id={`st-glass-${uid}`}
              className="field__input tabular"
              type="number"
              inputMode="numeric"
              min={50}
              max={2000}
              step={10}
              enterKeyHint="done"
              value={glassValue}
              onChange={(event) => typeGlass(event.target.value)}
              onBlur={() => setGlassDraft(null)}
            />
            <span className="st-measure__unit">ml</span>
          </div>
        </Field>

        <div className="st-chips" role="group" aria-label="Common glass sizes">
          {GLASS_PRESETS.map((ml) => (
            <button
              key={ml}
              type="button"
              className="st-chip tabular"
              aria-pressed={settings.waterIncrement === ml}
              onClick={() => pickGlass(ml)}
            >
              {ml} ml
            </button>
          ))}
        </div>
      </Card>

      <Card title="Appearance">
        <div className="st-row">
          <span className="st-row__label">Theme</span>
          <Segmented
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(theme) => dispatch({ type: 'setSettings', settings: { theme } })}
            label="Theme"
          />
        </div>
        <p className="st-hint">System follows whatever your phone is set to, including its night schedule.</p>
      </Card>

      <Card title="Start date">
        <Field label="Day 1 fell on" id={`st-start-${uid}`}>
          <input
            id={`st-start-${uid}`}
            className="field__input"
            type="date"
            min={earliestStart}
            max={today}
            value={startDraft}
            onChange={(event) => typeStart(event.target.value)}
          />
        </Field>

        {startError ? (
          <p className="st-error" role="alert">
            {startError}
          </p>
        ) : (
          <p className="st-hint">
            Day 1 is {formatLong(startDraft)}, which makes today day {dayNumber(startDraft, today)}. Nothing you have
            logged moves — every entry stays on the date you logged it — but the day numbers around it shift.
          </p>
        )}
      </Card>

      <AttemptHistory />

      <DataManager />

      <Card title="Danger zone">
        <p className="st-note st-note--danger">
          Restarting files the attempt you are on away in your history and puts you back on day 1. There is no undo.
        </p>
        <Button variant="danger" block onClick={openRestart}>
          Restart the challenge
        </Button>
      </Card>

      <p className="st-about">
        Everything lives on this device. No account, no server, nothing leaves your phone — which also means clearing
        your browser data clears the challenge. Export a backup before you switch phones.
      </p>

      <Modal
        open={restartOpen}
        onClose={() => setRestartOpen(false)}
        title="Restart at day 1?"
        labelledBy={`st-restart-title-${uid}`}
      >
        <p className="st-modal__body">
          You are on day {summary.dayNumber}, with {summary.daysComplete} full{' '}
          {summary.daysComplete === 1 ? 'day' : 'days'} behind you. Restarting moves this attempt into your history —
          the days, notes and photos all stay there to look back on — and starts a new day 1 today,{' '}
          {formatLong(today)}. Your rules and macro targets carry over.
        </p>

        <label className="st-check">
          <input
            type="checkbox"
            className="st-check__box"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>I understand this ends day {summary.dayNumber} and there is no undo.</span>
        </label>

        <div className="modal__actions">
          <Button onClick={() => setRestartOpen(false)}>Keep going</Button>
          <Button variant="danger" disabled={!understood} onClick={restart}>
            Restart at day 1
          </Button>
        </div>
      </Modal>
    </div>
  )
}
