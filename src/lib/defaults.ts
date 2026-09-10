import type { Attempt, AppState, DateKey, DayRecord, MacroTargets, Settings, TaskDef } from './types'
import { todayKey } from './date'

export const SCHEMA_VERSION = 1

/**
 * The five daily rules, matching the user's own variant of 75 Hard:
 * one 45-minute workout, tracked macros, 2 litres of water, 10 pages of
 * anything, and a progress photo. All of it is editable in Settings.
 */
export const DEFAULT_TASKS: TaskDef[] = [
  {
    id: 'workout',
    label: '45 minute workout',
    hint: 'Any style — indoors or out, just move for 45 minutes',
    kind: 'workout',
    target: 45,
    icon: '🏋️',
    enabled: true,
  },
  {
    id: 'macros',
    label: 'Track macros',
    hint: 'Log protein, carbs and fat for everything you ate',
    kind: 'macros',
    icon: '🍽️',
    enabled: true,
  },
  {
    id: 'water',
    label: 'Drink 2 L of water',
    hint: '2,000 ml over the day',
    kind: 'water',
    target: 2000,
    icon: '💧',
    enabled: true,
  },
  {
    id: 'reading',
    label: 'Read 10 pages',
    hint: 'Anything you like — fiction counts',
    kind: 'reading',
    target: 10,
    icon: '📖',
    enabled: true,
  },
  {
    id: 'photo',
    label: 'Progress photo',
    hint: 'Same spot, same light, every day',
    kind: 'photo',
    icon: '📸',
    enabled: true,
  },
]

export const DEFAULT_MACRO_TARGETS: MacroTargets = {
  calories: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  waterIncrement: 250,
  units: 'metric',
}

/** A blank record for a day the user has not touched yet. */
export function emptyDay(date: DateKey): DayRecord {
  return {
    date,
    checks: {},
    water: 0,
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0, logged: false },
    reading: { pages: 0, book: '' },
    workout: { minutes: 0, kind: '', outdoors: false },
    note: '',
  }
}

/**
 * Random-ish id that works in every browser. `crypto.randomUUID` is only
 * available on secure origins, so fall back to timestamp + random.
 */
export function newId(prefix = 'id'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${uuid}`
}

export function newAttempt(startDate: DateKey = todayKey(), tasks: TaskDef[] = DEFAULT_TASKS): Attempt {
  return {
    id: newId('attempt'),
    startDate,
    tasks: tasks.map((t) => ({ ...t })),
    macroTargets: { ...DEFAULT_MACRO_TARGETS },
    days: {},
    status: 'active',
  }
}

export function initialState(): AppState {
  return {
    version: SCHEMA_VERSION,
    current: newAttempt(),
    history: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}
