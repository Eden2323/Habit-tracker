import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TASKS } from '../lib/defaults'
import { type Action, reducer } from '../lib/store'
import type { AppState, DateKey, DayRecord } from '../lib/types'
import { completeRun, makeAttempt, makeDay, makeState, makeTask } from './factories'

const DATE: DateKey = '2026-01-03'

/** Run a sequence of actions, so a test reads as the story it is telling. */
function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state)
}

function dayOf(state: AppState, date: DateKey = DATE): DayRecord {
  const day = state.current.days[date]
  if (!day) throw new Error(`expected a day record for ${date}`)
  return day
}

describe('water', () => {
  it('creates the day on first touch', () => {
    const next = reducer(makeState(), { type: 'addWater', date: DATE, ml: 250 })
    expect(dayOf(next)).toMatchObject({ date: DATE, water: 250, note: '', checks: {} })
  })

  it('never goes negative', () => {
    const start = makeState()
    expect(dayOf(reducer(start, { type: 'setWater', date: DATE, ml: -500 })).water).toBe(0)

    const drained = apply(
      start,
      { type: 'addWater', date: DATE, ml: 500 },
      { type: 'addWater', date: DATE, ml: -800 },
    )
    expect(dayOf(drained).water).toBe(0)
  })

  it('ignores values that are not real numbers', () => {
    expect(dayOf(reducer(makeState(), { type: 'setWater', date: DATE, ml: Number.NaN })).water).toBe(0)
    expect(dayOf(reducer(makeState(), { type: 'addWater', date: DATE, ml: Number.POSITIVE_INFINITY })).water).toBe(0)
  })

  it('accumulates across taps', () => {
    const next = apply(
      makeState(),
      { type: 'addWater', date: DATE, ml: 250 },
      { type: 'addWater', date: DATE, ml: 250 },
      { type: 'addWater', date: DATE, ml: 500 },
    )
    expect(dayOf(next).water).toBe(1000)
  })
})

describe('macros, reading and workout', () => {
  it('merges macros rather than replacing them', () => {
    const next = apply(
      makeState(),
      { type: 'setMacros', date: DATE, macros: { protein: 160, logged: true } },
      { type: 'setMacros', date: DATE, macros: { calories: 2200 } },
      { type: 'setMacros', date: DATE, macros: { carbs: 220, fat: 70 } },
    )
    expect(dayOf(next).macros).toEqual({ calories: 2200, protein: 160, carbs: 220, fat: 70, logged: true })
  })

  it('clamps macro numbers without losing the logged flag', () => {
    const next = apply(
      makeState(),
      { type: 'setMacros', date: DATE, macros: { logged: true, protein: 100 } },
      { type: 'setMacros', date: DATE, macros: { protein: -40 } },
    )
    expect(dayOf(next).macros).toMatchObject({ protein: 0, logged: true })
  })

  it('merges reading, keeping the book when only pages change', () => {
    const next = apply(
      makeState(),
      { type: 'setReading', date: DATE, reading: { book: 'Dune' } },
      { type: 'setReading', date: DATE, reading: { pages: 12 } },
    )
    expect(dayOf(next).reading).toEqual({ pages: 12, book: 'Dune' })
    expect(dayOf(reducer(next, { type: 'setReading', date: DATE, reading: { pages: -3 } })).reading.pages).toBe(0)
  })

  it('merges workout fields', () => {
    const next = apply(
      makeState(),
      { type: 'setWorkout', date: DATE, workout: { minutes: 45 } },
      { type: 'setWorkout', date: DATE, workout: { outdoors: true } },
      { type: 'setWorkout', date: DATE, workout: { kind: 'Zone 2 run' } },
    )
    expect(dayOf(next).workout).toEqual({ minutes: 45, kind: 'Zone 2 run', outdoors: true })
  })

  it('stores and clears a note', () => {
    const written = reducer(makeState(), { type: 'setNote', date: DATE, note: 'legs still sore' })
    expect(dayOf(written).note).toBe('legs still sore')
    expect(dayOf(reducer(written, { type: 'setNote', date: DATE, note: '' })).note).toBe('')
  })
})

describe('checks', () => {
  it('records an override in either direction', () => {
    const on = reducer(makeState(), { type: 'setCheck', date: DATE, taskId: 'water', value: true })
    expect(dayOf(on).checks).toEqual({ water: true })

    const off = reducer(on, { type: 'setCheck', date: DATE, taskId: 'water', value: false })
    expect(dayOf(off).checks).toEqual({ water: false })
  })

  it('clearCheck removes the key entirely rather than setting it false', () => {
    const overridden = reducer(makeState(), { type: 'setCheck', date: DATE, taskId: 'water', value: false })
    const cleared = reducer(overridden, { type: 'clearCheck', date: DATE, taskId: 'water' })
    expect(dayOf(cleared).checks).toEqual({})
    expect(Object.prototype.hasOwnProperty.call(dayOf(cleared).checks, 'water')).toBe(false)
  })

  it('leaves other overrides alone when clearing one', () => {
    const next = apply(
      makeState(),
      { type: 'setCheck', date: DATE, taskId: 'water', value: true },
      { type: 'setCheck', date: DATE, taskId: 'photo', value: true },
      { type: 'clearCheck', date: DATE, taskId: 'water' },
    )
    expect(dayOf(next).checks).toEqual({ photo: true })
  })

  it('clearing a check that was never set is a no-op', () => {
    const next = reducer(makeState(), { type: 'clearCheck', date: DATE, taskId: 'water' })
    expect(dayOf(next).checks).toEqual({})
  })
})

describe('photos', () => {
  it('attaches and detaches a photo id', () => {
    const attached = reducer(makeState(), { type: 'setPhoto', date: DATE, photoId: 'photo_2026-01-03' })
    expect(dayOf(attached).photoId).toBe('photo_2026-01-03')

    const detached = reducer(attached, { type: 'setPhoto', date: DATE })
    expect('photoId' in dayOf(detached)).toBe(false)
  })
})

describe('rules and settings', () => {
  it('replaces the task list', () => {
    const tasks = [...DEFAULT_TASKS, makeTask({ id: 'plunge', label: 'Cold plunge', icon: '🧊', custom: true })]
    const next = reducer(makeState(), { type: 'setTasks', tasks })
    expect(next.current.tasks).toEqual(tasks)
  })

  it('replaces macro targets and moves the start date', () => {
    const next = apply(
      makeState(),
      { type: 'setMacroTargets', targets: { calories: 2400, protein: 180, carbs: 240, fat: 80 } },
      { type: 'setStartDate', date: '2026-02-01' },
    )
    expect(next.current.macroTargets).toEqual({ calories: 2400, protein: 180, carbs: 240, fat: 80 })
    expect(next.current.startDate).toBe('2026-02-01')
  })

  it('merges settings rather than replacing them', () => {
    const next = apply(
      makeState({ settings: { theme: 'dark' } }),
      { type: 'setSettings', settings: { waterIncrement: 500 } },
      { type: 'setSettings', settings: { restartPromptSnoozedFor: '2026-01-04' } },
    )
    expect(next.settings).toMatchObject({ theme: 'dark', waterIncrement: 500, units: 'metric', restartPromptSnoozedFor: '2026-01-04' })
  })
})

describe('restart', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const failing = () =>
    makeState({
      current: makeAttempt({
        startDate: '2026-01-01',
        days: completeRun('2026-01-01', 3),
        tasks: [...DEFAULT_TASKS, makeTask({ id: 'plunge', label: 'Cold plunge', icon: '🧊', custom: true })],
        macroTargets: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
      }),
      settings: { theme: 'dark', restartPromptSnoozedFor: '2026-01-05' },
    })

  it('archives the old attempt with how and when it died', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 5, 8, 0)))
    const state = failing()

    const next = reducer(state, {
      type: 'restart',
      reason: 'failed',
      failedOnDay: 4,
      failedTasks: ['water', 'photo'],
      startDate: '2026-01-05',
    })

    expect(next.history).toHaveLength(1)
    expect(next.history[0]).toMatchObject({
      id: state.current.id,
      status: 'failed',
      failedOnDay: 4,
      failedTasks: ['water', 'photo'],
      endedAt: '2026-01-05T08:00:00.000Z',
    })
    expect(next.history[0]?.days).toEqual(state.current.days)
  })

  it('starts a fresh attempt at the new start date', () => {
    const state = failing()
    const next = reducer(state, { type: 'restart', reason: 'failed', startDate: '2026-01-05' })

    expect(next.current.id).not.toBe(state.current.id)
    expect(next.current.startDate).toBe('2026-01-05')
    expect(next.current.days).toEqual({})
    expect(next.current.status).toBe('active')
    expect(next.current.endedAt).toBeUndefined()
  })

  it('carries the task definitions and macro targets over to the new attempt', () => {
    const state = failing()
    const next = reducer(state, { type: 'restart', reason: 'failed', startDate: '2026-01-05' })

    expect(next.current.tasks).toEqual(state.current.tasks)
    expect(next.current.macroTargets).toEqual(state.current.macroTargets)
    // Copies, not shared references — editing the new rules must not rewrite history.
    expect(next.current.tasks).not.toBe(state.current.tasks)
    expect(next.current.tasks[0]).not.toBe(state.current.tasks[0])
    expect(next.current.macroTargets).not.toBe(state.current.macroTargets)
  })

  it('clears the snooze so the new attempt starts with a clean slate', () => {
    const next = reducer(failing(), { type: 'restart', reason: 'failed', startDate: '2026-01-05' })
    expect('restartPromptSnoozedFor' in next.settings).toBe(false)
    expect(next.settings.theme).toBe('dark')
  })

  it('defaults the new start date to today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 6, 30))
    expect(reducer(failing(), { type: 'restart', reason: 'abandoned' }).current.startDate).toBe('2026-09-09')
  })

  it('omits failure details when the attempt was simply abandoned', () => {
    const archived = reducer(failing(), { type: 'restart', reason: 'abandoned' }).history[0]
    expect(archived?.status).toBe('abandoned')
    expect(archived && 'failedOnDay' in archived).toBe(false)
    expect(archived && 'failedTasks' in archived).toBe(false)
  })

  it('appends each attempt to history, newest last', () => {
    const first = reducer(failing(), { type: 'restart', reason: 'failed', failedOnDay: 4, startDate: '2026-01-05' })
    const second = reducer(first, { type: 'restart', reason: 'failed', failedOnDay: 2, startDate: '2026-01-07' })
    expect(second.history.map((a) => a.failedOnDay)).toEqual([4, 2])
  })

  it('leaves the previous state untouched', () => {
    const state = failing()
    const before = JSON.stringify(state)
    reducer(state, { type: 'restart', reason: 'failed', failedOnDay: 4, startDate: '2026-01-05' })
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('completeChallenge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks the attempt finished without discarding it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 16, 20, 0)))
    const state = makeState({ current: makeAttempt({ startDate: '2026-01-01', days: completeRun('2026-01-01', 3) }) })

    const next = reducer(state, { type: 'completeChallenge' })
    expect(next.current.status).toBe('completed')
    expect(next.current.endedAt).toBe('2026-03-16T20:00:00.000Z')
    expect(next.current.days).toEqual(state.current.days)
    expect(next.history).toEqual([])
  })
})

describe('replaceState', () => {
  it('swaps the whole state wholesale', () => {
    const imported = makeState({
      current: makeAttempt({ startDate: '2025-06-01', days: [makeDay('2025-06-01', { water: 2000 })] }),
      settings: { theme: 'light', waterIncrement: 330 },
    })
    expect(reducer(makeState(), { type: 'replaceState', state: imported })).toBe(imported)
  })
})

describe('unknown actions', () => {
  it('leave the state exactly as it was', () => {
    const state = makeState()
    expect(reducer(state, { type: 'nope' } as unknown as Action)).toBe(state)
  })
})

describe('immutability', () => {
  it('never mutates the state handed in', () => {
    const state = makeState({ current: makeAttempt({ startDate: '2026-01-01', days: [makeDay(DATE, { water: 500 })] }) })
    const before = JSON.stringify(state)

    apply(
      state,
      { type: 'addWater', date: DATE, ml: 250 },
      { type: 'setMacros', date: DATE, macros: { logged: true } },
      { type: 'setCheck', date: DATE, taskId: 'water', value: true },
      { type: 'clearCheck', date: DATE, taskId: 'water' },
      { type: 'setPhoto', date: DATE, photoId: 'p' },
      { type: 'setSettings', settings: { theme: 'light' } },
    )

    expect(JSON.stringify(state)).toBe(before)
  })

  it('leaves history alone when a day changes', () => {
    const history = [makeAttempt({ startDate: '2025-10-01', status: 'failed', failedOnDay: 9 })]
    const state = makeState({ history })
    const next = reducer(state, { type: 'addWater', date: DATE, ml: 250 })
    expect(next.history).toBe(history)
  })
})
