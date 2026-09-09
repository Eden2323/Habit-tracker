/**
 * Core domain types for the 75 Hard tracker.
 *
 * Everything is stored locally: the challenge state lives in localStorage
 * (small, synchronous, easy to export) and progress photos live in IndexedDB
 * (blobs are far too big for localStorage's ~5MB budget).
 */

/** A calendar day in the user's local timezone, formatted `YYYY-MM-DD`. */
export type DateKey = string

/**
 * How a task is completed. Most tasks carry their own tracker; `check` is a
 * plain manual toggle used by custom user-added habits.
 */
export type TaskKind = 'workout' | 'macros' | 'water' | 'reading' | 'photo' | 'check'

export interface TaskDef {
  id: string
  /** Shown on the checklist, e.g. "45 minute workout". */
  label: string
  /** Optional supporting line, e.g. "Any style — just move for 45 minutes". */
  hint?: string
  kind: TaskKind
  /**
   * Goal for tracker-backed tasks:
   * - `water`   → millilitres (default 2000)
   * - `reading` → pages (default 10)
   * - `workout` → minutes (default 45)
   * Unused for `macros`, `photo` and `check`.
   */
  target?: number
  /** Emoji used as the task's glyph on the checklist. */
  icon: string
  /** Custom tasks (user-added) can be deleted; built-ins can only be disabled. */
  custom?: boolean
  /** Disabled tasks are hidden and never count toward completion. */
  enabled: boolean
}

export interface MacroTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface MacroEntry {
  calories: number
  protein: number
  carbs: number
  fat: number
  /** Set once the user has logged their macros for the day. */
  logged: boolean
}

export interface ReadingEntry {
  pages: number
  book: string
}

export interface WorkoutEntry {
  minutes: number
  /** Free text, e.g. "Push day" or "Zone 2 run". */
  kind: string
  outdoors: boolean
}

export interface DayRecord {
  date: DateKey
  /**
   * Manual completion overrides keyed by task id. Tracker-backed tasks derive
   * completion from their entry, but an explicit `true`/`false` here always
   * wins — so the user can tick off a task the tracker cannot observe.
   */
  checks: Record<string, boolean>
  water: number
  macros: MacroEntry
  reading: ReadingEntry
  workout: WorkoutEntry
  /** IndexedDB key of the progress photo for this day, if any. */
  photoId?: string
  note: string
}

export type AttemptStatus = 'active' | 'failed' | 'completed' | 'abandoned'

export interface Attempt {
  id: string
  startDate: DateKey
  /** Snapshot of the rules in force for this attempt. */
  tasks: TaskDef[]
  macroTargets: MacroTargets
  days: Record<DateKey, DayRecord>
  status: AttemptStatus
  /** ISO timestamp of when the attempt ended (absent while active). */
  endedAt?: string
  /** 1-based day the attempt died on, for the history list. */
  failedOnDay?: number
  /** Which tasks were missed on the failing day, for the history list. */
  failedTasks?: string[]
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** Glass size for the water tracker's tap-to-fill buttons, in millilitres. */
  waterIncrement: number
  /** Show macro grams as a share of target rather than raw numbers. */
  units: 'metric' | 'imperial'
  /** Suppress the restart prompt until this DateKey (user chose "not yet"). */
  restartPromptSnoozedFor?: DateKey
}

export interface AppState {
  /** Schema version — bumped whenever a migration is needed. */
  version: number
  current: Attempt
  /** Previous attempts, newest last. */
  history: Attempt[]
  settings: Settings
}

/** Everything needed to render one day's checklist row. */
export interface TaskStatus {
  task: TaskDef
  done: boolean
  /** 0..1 progress for tracker-backed tasks; 0 or 1 for plain checks. */
  progress: number
  /** Human-readable progress, e.g. "1,250 / 2,000 ml". */
  detail: string
}
