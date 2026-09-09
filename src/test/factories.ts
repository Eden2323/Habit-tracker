/**
 * Fixture builders, so tests read as intent rather than setup.
 *
 * Everything is built on `emptyDay`/`newAttempt` from the real defaults — if the
 * shape of a record changes, these move with it instead of drifting.
 */

import { dateForDay } from '../lib/date'
import { DEFAULT_MACRO_TARGETS, DEFAULT_SETTINGS, DEFAULT_TASKS, SCHEMA_VERSION, emptyDay, newAttempt } from '../lib/defaults'
import type { AppState, Attempt, DateKey, DayRecord, MacroTargets, Settings, TaskDef } from '../lib/types'

/** A day record with the given overrides merged into a blank day. */
export function makeDay(date: DateKey, overrides: Partial<DayRecord> = {}): DayRecord {
  const base = emptyDay(date)
  return {
    ...base,
    ...overrides,
    // Nested groups merge rather than replace, so a test can set one field.
    date,
    checks: { ...base.checks, ...overrides.checks },
    macros: { ...base.macros, ...overrides.macros },
    reading: { ...base.reading, ...overrides.reading },
    workout: { ...base.workout, ...overrides.workout },
  }
}

/** A day that satisfies all five default rules; overrides can break one. */
export function makeCompleteDay(date: DateKey, overrides: Partial<DayRecord> = {}): DayRecord {
  return makeDay(date, {
    water: 2000,
    macros: { calories: 2200, protein: 160, carbs: 220, fat: 70, logged: true },
    reading: { pages: 10, book: 'Dune' },
    workout: { minutes: 45, kind: 'Push day', outdoors: false },
    photoId: `photo_${date}`,
    ...overrides,
  })
}

/** Key a list of day records by date, ready for `Attempt['days']`. */
export function daysMap(days: DayRecord[]): Record<DateKey, DayRecord> {
  return Object.fromEntries(days.map((d) => [d.date, d]))
}

/** `count` consecutive complete days, starting at day 1 of the attempt. */
export function completeRun(startDate: DateKey, count: number): DayRecord[] {
  return Array.from({ length: count }, (_, i) => makeCompleteDay(dateForDay(startDate, i + 1)))
}

export interface AttemptOptions {
  startDate?: DateKey
  /** Either a list (keyed automatically) or an already-keyed map. */
  days?: DayRecord[] | Record<DateKey, DayRecord>
  tasks?: TaskDef[]
  macroTargets?: MacroTargets
  status?: Attempt['status']
  id?: string
  endedAt?: string
  failedOnDay?: number
  failedTasks?: string[]
}

export function makeAttempt(options: AttemptOptions = {}): Attempt {
  const startDate = options.startDate ?? '2026-01-01'
  const attempt = newAttempt(startDate, options.tasks ?? DEFAULT_TASKS)
  attempt.days = Array.isArray(options.days) ? daysMap(options.days) : options.days ?? {}
  attempt.macroTargets = { ...(options.macroTargets ?? DEFAULT_MACRO_TARGETS) }
  if (options.status) attempt.status = options.status
  if (options.id) attempt.id = options.id
  if (options.endedAt) attempt.endedAt = options.endedAt
  if (options.failedOnDay !== undefined) attempt.failedOnDay = options.failedOnDay
  if (options.failedTasks) attempt.failedTasks = options.failedTasks
  return attempt
}

export function makeState(options: { current?: Attempt; history?: Attempt[]; settings?: Partial<Settings> } = {}): AppState {
  return {
    version: SCHEMA_VERSION,
    current: options.current ?? makeAttempt(),
    history: options.history ?? [],
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
  }
}

/** A single-task attempt, handy for isolating one rule's behaviour. */
export function makeTask(overrides: Partial<TaskDef> = {}): TaskDef {
  return {
    id: 'task',
    label: 'A task',
    kind: 'check',
    icon: '✅',
    enabled: true,
    ...overrides,
  }
}
