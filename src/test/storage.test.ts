import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidDateKey } from '../lib/date'
import { DEFAULT_SETTINGS, DEFAULT_TASKS, SCHEMA_VERSION } from '../lib/defaults'
import { STORAGE_KEY, clearState, loadState, migrate, parseAttempt, saveState } from '../lib/storage'
import { completeRun, makeAttempt, makeDay, makeState } from './factories'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('migrate on garbage', () => {
  const garbage: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'hard75'],
    ['an array', [1, 2, 3]],
    ['a number', 42],
    ['an empty object', {}],
    ['a partial object', { version: 1 }],
    ['nested nonsense', { current: 'yesterday', history: 'none', settings: 7 }],
  ]

  it.each(garbage)('returns a usable state for %s without throwing', (_label, input) => {
    const state = migrate(input)
    expect(state.version).toBe(SCHEMA_VERSION)
    expect(state.history).toEqual([])
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
    expect(state.current.tasks).toHaveLength(DEFAULT_TASKS.length)
    expect(state.current.days).toEqual({})
    expect(state.current.status).toBe('active')
    expect(isValidDateKey(state.current.startDate)).toBe(true)
  })

  it('keeps what it can from a half-written attempt', () => {
    const state = migrate({ current: { startDate: '2026-01-01' } })
    expect(state.current.startDate).toBe('2026-01-01')
    expect(state.current.tasks.map((t) => t.id)).toEqual(DEFAULT_TASKS.map((t) => t.id))
    expect(state.current.id).toMatch(/^attempt_/)
  })

  it('replaces an impossible start date with something valid', () => {
    expect(isValidDateKey(migrate({ current: { startDate: '2026-02-30' } }).current.startDate)).toBe(true)
  })
})

describe('migrate on hostile values', () => {
  it('clamps negative and non-numeric day values', () => {
    const state = migrate({
      current: {
        startDate: '2026-01-01',
        days: {
          '2026-01-01': {
            water: -500,
            reading: { pages: 'lots', book: 42 },
            workout: { minutes: -10, kind: null, outdoors: 'yes' },
            macros: { calories: '1800', protein: -1, carbs: NaN, fat: undefined, logged: 'true' },
            note: 12,
          },
        },
      },
    })
    const day = state.current.days['2026-01-01']
    expect(day).toBeDefined()
    expect(day?.water).toBe(0)
    expect(day?.reading).toEqual({ pages: 0, book: '' })
    expect(day?.workout).toEqual({ minutes: 0, kind: '', outdoors: false })
    // A numeric string is still a number; everything else falls back to zero.
    expect(day?.macros).toEqual({ calories: 1800, protein: 0, carbs: 0, fat: 0, logged: false })
    expect(day?.note).toBe('')
  })

  it('drops days that are not real dates and blanks unreadable ones', () => {
    const state = migrate({
      current: {
        startDate: '2026-01-01',
        days: {
          '2026-02-30': { water: 2000 },
          '2026-1-5': { water: 2000 },
          nonsense: { water: 2000 },
          '2026-01-02': 'not a record',
        },
      },
    })
    expect(Object.keys(state.current.days)).toEqual(['2026-01-02'])
    expect(state.current.days['2026-01-02']?.water).toBe(0)
  })

  it('keeps only boolean check overrides', () => {
    const state = migrate({
      current: { startDate: '2026-01-01', days: { '2026-01-01': { checks: { water: true, photo: 'yes', reading: 1 } } } },
    })
    expect(state.current.days['2026-01-01']?.checks).toEqual({ water: true })
  })

  it('drops tasks with no label and de-duplicates ids', () => {
    const state = migrate({
      current: {
        startDate: '2026-01-01',
        tasks: [
          { id: 'a', label: 'Keep me', kind: 'check', icon: '✅', enabled: true },
          { id: 'a', label: 'Duplicate id', kind: 'check', icon: '✅', enabled: true },
          { id: 'b', label: '   ', kind: 'check' },
          { id: 'c', kind: 'check' },
          'not a task',
          null,
        ],
      },
    })
    expect(state.current.tasks.map((t) => t.label)).toEqual(['Keep me'])
  })

  it('repairs the salvageable parts of a task', () => {
    const state = migrate({
      current: {
        startDate: '2026-01-01',
        tasks: [{ label: 'Cold plunge', kind: 'swimming', target: -20, hint: '  ' }],
      },
    })
    const task = state.current.tasks[0]
    expect(task).toMatchObject({ label: 'Cold plunge', kind: 'check', icon: '✅', enabled: true, target: 0 })
    expect(task?.id).toBeTruthy()
    expect(task?.hint).toBeUndefined()
  })

  it('falls back to the default rules when nothing survives', () => {
    expect(migrate({ current: { tasks: [{ kind: 'water' }] } }).current.tasks).toHaveLength(DEFAULT_TASKS.length)
    expect(migrate({ current: { tasks: 'five rules' } }).current.tasks).toHaveLength(DEFAULT_TASKS.length)
  })

  it('sanitises macro targets and settings', () => {
    const state = migrate({
      current: { macroTargets: { calories: -100, protein: 'lots', carbs: 300, fat: null } },
      settings: { theme: 'purple', waterIncrement: -50, units: 'gallons', restartPromptSnoozedFor: '2026-02-30' },
    })
    // `null` coerces to 0 and so clamps rather than falling back; only values
    // that cannot be read as a number at all (here, 'lots') take the default.
    expect(state.current.macroTargets).toEqual({ calories: 0, protein: 160, carbs: 300, fat: 0 })
    expect(state.settings.theme).toBe('system')
    expect(state.settings.waterIncrement).toBe(DEFAULT_SETTINGS.waterIncrement)
    expect(state.settings.units).toBe('metric')
    expect(state.settings.restartPromptSnoozedFor).toBeUndefined()
  })

  it('keeps a valid snooze date and theme', () => {
    const state = migrate({ settings: { theme: 'dark', units: 'imperial', waterIncrement: 500, restartPromptSnoozedFor: '2026-09-09' } })
    expect(state.settings).toEqual({
      theme: 'dark',
      units: 'imperial',
      waterIncrement: 500,
      restartPromptSnoozedFor: '2026-09-09',
    })
  })

  it('drops history entries it cannot read', () => {
    const state = migrate({
      history: [{ startDate: '2026-01-01', status: 'failed', failedOnDay: 12, failedTasks: ['water', 7, null] }, 'junk', null],
    })
    expect(state.history).toHaveLength(1)
    expect(state.history[0]).toMatchObject({ status: 'failed', failedOnDay: 12, failedTasks: ['water'] })
  })

  it('rejects an unknown attempt status', () => {
    expect(parseAttempt({ startDate: '2026-01-01', status: 'exploded' })?.status).toBe('active')
    expect(parseAttempt('not an attempt')).toBeNull()
  })
})

describe('saveState and loadState', () => {
  it('round-trips days, tasks and settings', () => {
    const state = makeState({
      current: makeAttempt({
        startDate: '2026-01-01',
        days: [
          ...completeRun('2026-01-01', 2),
          makeDay('2026-01-03', { water: 750, note: 'legs still sore', checks: { photo: true } }),
        ],
        tasks: [...DEFAULT_TASKS, { id: 'plunge', label: 'Cold plunge', kind: 'check', icon: '🧊', enabled: true, custom: true }],
        macroTargets: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
      }),
      history: [makeAttempt({ startDate: '2025-10-01', status: 'failed', failedOnDay: 9, failedTasks: ['water'], endedAt: '2025-10-09T21:00:00.000Z' })],
      settings: { theme: 'dark', waterIncrement: 500, restartPromptSnoozedFor: '2026-01-03' },
    })

    expect(saveState(state)).toBe(true)
    expect(loadState()).toEqual(state)
  })

  it('writes under the published key', () => {
    saveState(makeState())
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ version: SCHEMA_VERSION })
  })

  it('returns a fresh state when nothing is stored', () => {
    const state = loadState()
    expect(state.current.days).toEqual({})
    expect(state.history).toEqual([])
    expect(state.current.tasks).toHaveLength(DEFAULT_TASKS.length)
  })

  it('survives corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{"current": ')
    expect(() => loadState()).not.toThrow()
    expect(loadState().current.tasks).toHaveLength(DEFAULT_TASKS.length)
  })

  it('reports failure instead of throwing when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveState(makeState())).toBe(false)
  })

  it('clears the stored state', () => {
    saveState(makeState())
    clearState()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
