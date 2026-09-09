import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { newId } from '../../lib/defaults'
import { useStore } from '../../lib/store'
import type { TaskDef, TaskKind } from '../../lib/types'
import { Button, Card, Field } from '../ui'
import './settings.css'

/** Long enough to swallow a burst of typing, short enough to feel live. */
const COMMIT_DELAY = 350

interface TargetSpec {
  unit: string
  /** Spoken unit, for the field's accessible name. */
  word: string
  max: number
  step: number
}

/** Only these kinds measure themselves against a number. */
const TARGETS: Partial<Record<TaskKind, TargetSpec>> = {
  water: { unit: 'ml', word: 'millilitres', max: 10_000, step: 50 },
  reading: { unit: 'pages', word: 'pages', max: 500, step: 1 },
  workout: { unit: 'min', word: 'minutes', max: 600, step: 5 },
}

const KIND_SUMMARY: Record<TaskKind, string> = {
  workout: 'Timed workout',
  macros: 'Macros logged for the day',
  water: 'Water tracker',
  reading: 'Pages read',
  photo: 'One photo a day',
  check: 'Tick it off',
}

function summaryFor(task: TaskDef): string {
  const spec = TARGETS[task.kind]
  if (spec && task.target) return `${task.target.toLocaleString()} ${spec.unit} a day`
  return KIND_SUMMARY[task.kind]
}

type DraftField = 'label' | 'hint' | 'icon' | 'target'
type Drafts = Record<string, Partial<Record<DraftField, string>>>

export function RulesEditor() {
  const { state, dispatch } = useStore()
  const tasks = state.current.tasks
  const uid = useId().replace(/:/g, '')

  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [status, setStatus] = useState('')

  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const pending = useRef(new Map<string, Partial<TaskDef>>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Fold any queued text edits into a fresh array and empty the queue. */
  const drain = useCallback((): TaskDef[] => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const patches = pending.current
    pending.current = new Map()
    return tasksRef.current.map((task) => {
      const patch = patches.get(task.id)
      if (!patch) return task
      const merged: TaskDef = { ...task, ...patch }
      // A nameless or glyphless task would be thrown away on the next load,
      // so a cleared field falls back rather than committing something invalid.
      if (!merged.label.trim()) merged.label = task.label
      if (!merged.icon.trim()) merged.icon = task.icon
      if (!merged.hint) delete merged.hint
      return merged
    })
  }, [])

  const flush = useCallback(() => {
    if (pending.current.size === 0) {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      return
    }
    dispatch({ type: 'setTasks', tasks: drain() })
  }, [dispatch, drain])

  /** Structural edits land on top of whatever text is still queued. */
  const apply = useCallback(
    (change: (list: TaskDef[]) => TaskDef[]) => {
      dispatch({ type: 'setTasks', tasks: change(drain()) })
    },
    [dispatch, drain],
  )

  const queue = useCallback(
    (id: string, patch: Partial<TaskDef>) => {
      pending.current.set(id, { ...pending.current.get(id), ...patch })
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, COMMIT_DELAY)
    },
    [flush],
  )

  // Navigating away mid-edit must still land the pending write.
  useEffect(() => flush, [flush])

  const enabledCount = tasks.filter((t) => t.enabled).length

  function setDraft(id: string, field: DraftField, value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
  }

  /** Hand the field back to the stored value once the edit has committed. */
  function commitField(id: string, field: DraftField) {
    flush()
    setDrafts((current) => {
      const row = current[id]
      if (!row || row[field] === undefined) return current
      const next = { ...row }
      delete next[field]
      return { ...current, [id]: next }
    })
  }

  function typeText(task: TaskDef, field: 'label' | 'hint' | 'icon', value: string) {
    setDraft(task.id, field, value)
    const patch: Partial<TaskDef> =
      field === 'label' ? { label: value } : field === 'hint' ? { hint: value.trim() } : { icon: value.trim() }
    queue(task.id, patch)
  }

  function typeTarget(task: TaskDef, spec: TargetSpec, value: string) {
    setDraft(task.id, 'target', value)
    const n = Math.round(Number(value))
    // A target of zero can never be met, so an empty box keeps the old number.
    if (Number.isFinite(n) && n > 0) queue(task.id, { target: Math.min(spec.max, n) })
  }

  function toggleEnabled(task: TaskDef) {
    if (task.enabled && enabledCount <= 1) {
      setStatus('Keep at least one rule switched on.')
      return
    }
    apply((list) => list.map((t) => (t.id === task.id ? { ...t, enabled: !t.enabled } : t)))
    setStatus(`${task.label} ${task.enabled ? 'switched off' : 'switched on'}.`)
  }

  function move(index: number, delta: number) {
    const to = index + delta
    if (to < 0 || to >= tasks.length) return
    apply((list) => {
      const next = [...list]
      const from = next[index]
      const swap = next[to]
      if (!from || !swap) return list
      next[index] = swap
      next[to] = from
      return next
    })
    setStatus(`${tasks[index]?.label ?? 'Rule'} moved to position ${to + 1} of ${tasks.length}.`)
  }

  function addTask() {
    const task: TaskDef = {
      id: newId('task'),
      label: 'New habit',
      kind: 'check',
      icon: '✅',
      custom: true,
      enabled: true,
    }
    apply((list) => [...list, task])
    setOpenId(task.id)
    setStatus('Habit added. Give it a name.')
  }

  function remove(task: TaskDef) {
    if (task.enabled && enabledCount <= 1) {
      setStatus('Keep at least one rule switched on.')
      return
    }
    apply((list) => list.filter((t) => t.id !== task.id))
    setConfirmId(null)
    if (openId === task.id) setOpenId(null)
    setStatus(`${task.label} deleted.`)
  }

  return (
    <Card title="Your rules">
      <p className="st-note">
        Every day is scored live against whatever is set here. Raise a target and a day you had already finished can
        un-tick itself — so change these early, or knowingly.
      </p>

      <ul className="st-rules">
        {tasks.map((task, index) => {
          const row = drafts[task.id]
          const label = row?.label ?? task.label
          const hint = row?.hint ?? task.hint ?? ''
          const icon = row?.icon ?? task.icon
          const spec = TARGETS[task.kind]
          const target = row?.target ?? (task.target !== undefined ? String(task.target) : '')

          const open = openId === task.id
          const panelId = `st-panel-${uid}-${task.id}`
          const lastOn = task.enabled && enabledCount <= 1

          return (
            <li key={task.id} className={task.enabled ? 'st-rule' : 'st-rule st-rule--off'}>
              <div className="st-rule__head">
                <button
                  type="button"
                  className="st-rule__open"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : task.id)}
                >
                  <span className="st-rule__icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="st-rule__text">
                    <span className="st-rule__label">{label}</span>
                    <span className="st-rule__meta">
                      {task.enabled ? summaryFor(task) : 'Not counted'}
                    </span>
                  </span>
                  <span className={open ? 'st-rule__chevron st-rule__chevron--open' : 'st-rule__chevron'} aria-hidden="true">
                    ›
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  className="st-switch"
                  aria-checked={task.enabled}
                  aria-disabled={lastOn}
                  aria-label={`Count ${task.label} toward each day`}
                  onClick={() => toggleEnabled(task)}
                >
                  <span className="st-switch__thumb" />
                </button>
              </div>

              {open ? (
                <div className="st-rule__panel" id={panelId}>
                  <Field label="Name" id={`st-label-${uid}-${task.id}`}>
                    <input
                      id={`st-label-${uid}-${task.id}`}
                      className="field__input"
                      type="text"
                      maxLength={60}
                      enterKeyHint="done"
                      value={label}
                      onChange={(event) => typeText(task, 'label', event.target.value)}
                      onBlur={() => commitField(task.id, 'label')}
                    />
                  </Field>

                  <Field label="Note" id={`st-hint-${uid}-${task.id}`} hint="The small line under the name">
                    <input
                      id={`st-hint-${uid}-${task.id}`}
                      className="field__input"
                      type="text"
                      maxLength={90}
                      enterKeyHint="done"
                      placeholder="Optional"
                      value={hint}
                      onChange={(event) => typeText(task, 'hint', event.target.value)}
                      onBlur={() => commitField(task.id, 'hint')}
                    />
                  </Field>

                  <div className="st-pair">
                    <Field label="Icon" id={`st-icon-${uid}-${task.id}`}>
                      <input
                        id={`st-icon-${uid}-${task.id}`}
                        className="field__input st-icon-field"
                        type="text"
                        maxLength={8}
                        autoComplete="off"
                        enterKeyHint="done"
                        value={icon}
                        onChange={(event) => typeText(task, 'icon', event.target.value)}
                        onBlur={() => commitField(task.id, 'icon')}
                      />
                    </Field>

                    {spec ? (
                      <Field label={`Target in ${spec.word}`} id={`st-target-${uid}-${task.id}`}>
                        <input
                          id={`st-target-${uid}-${task.id}`}
                          className="field__input tabular"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={spec.max}
                          step={spec.step}
                          enterKeyHint="done"
                          value={target}
                          onChange={(event) => typeTarget(task, spec, event.target.value)}
                          onBlur={() => commitField(task.id, 'target')}
                        />
                      </Field>
                    ) : null}
                  </div>

                  {lastOn ? (
                    <p className="st-hint">
                      This is your last rule still on. A day with nothing in it can never be complete, so it stays.
                    </p>
                  ) : null}

                  <div className="st-rule__foot">
                    <div className="st-move">
                      {/* aria-disabled rather than disabled: a disabled button drops
                          keyboard focus the moment an item reaches an end. */}
                      <Button
                        className="st-move__btn"
                        aria-disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <span aria-hidden="true">↑</span> Move up
                      </Button>
                      <Button
                        className="st-move__btn"
                        aria-disabled={index === tasks.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <span aria-hidden="true">↓</span> Move down
                      </Button>
                    </div>

                    {task.custom ? (
                      confirmId === task.id ? (
                        <div className="st-move">
                          <Button variant="danger" onClick={() => remove(task)}>
                            Delete for good
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmId(null)}>
                            Keep it
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" className="st-delete" onClick={() => setConfirmId(task.id)}>
                          Delete habit
                        </Button>
                      )
                    ) : (
                      <p className="st-hint">
                        Built-in rules switch off but never delete — the days you already logged against them would
                        lose their name.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <Button block onClick={addTask}>
        <span aria-hidden="true">＋</span> Add your own habit
      </Button>

      <p className="visually-hidden" role="status">
        {status}
      </p>
    </Card>
  )
}
