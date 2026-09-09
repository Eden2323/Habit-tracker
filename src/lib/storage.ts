import { isValidDateKey, todayKey } from './date'
import { DEFAULT_MACRO_TARGETS, DEFAULT_SETTINGS, DEFAULT_TASKS, SCHEMA_VERSION, emptyDay, initialState, newId } from './defaults'
import type { AppState, Attempt, DayRecord, MacroTargets, Settings, TaskDef, TaskKind } from './types'

export const STORAGE_KEY = 'hard75:state:v1'

const TASK_KINDS: TaskKind[] = ['workout', 'macros', 'water', 'reading', 'photo', 'check']

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Clamp to a sane, non-negative number — guards against corrupt imports. */
function positive(value: unknown, fallback = 0): number {
  return Math.max(0, num(value, fallback))
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTask(raw: unknown, index: number): TaskDef | null {
  if (!isRecord(raw)) return null
  const kind = TASK_KINDS.includes(raw.kind as TaskKind) ? (raw.kind as TaskKind) : 'check'
  const label = str(raw.label).trim()
  if (!label) return null
  const task: TaskDef = {
    id: str(raw.id) || newId(`task${index}`),
    label,
    kind,
    icon: str(raw.icon) || '✅',
    enabled: bool(raw.enabled, true),
  }
  const hint = str(raw.hint).trim()
  if (hint) task.hint = hint
  if (raw.target !== undefined && raw.target !== null) task.target = positive(raw.target)
  if (raw.custom !== undefined) task.custom = bool(raw.custom)
  return task
}

function parseTasks(raw: unknown): TaskDef[] {
  if (!Array.isArray(raw)) return DEFAULT_TASKS.map((t) => ({ ...t }))
  const tasks = raw.map(parseTask).filter((t): t is TaskDef => t !== null)
  // De-duplicate ids; two tasks sharing an id would corrupt the checks map.
  const seen = new Set<string>()
  const unique = tasks.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
  return unique.length > 0 ? unique : DEFAULT_TASKS.map((t) => ({ ...t }))
}

function parseMacroTargets(raw: unknown): MacroTargets {
  if (!isRecord(raw)) return { ...DEFAULT_MACRO_TARGETS }
  return {
    calories: positive(raw.calories, DEFAULT_MACRO_TARGETS.calories),
    protein: positive(raw.protein, DEFAULT_MACRO_TARGETS.protein),
    carbs: positive(raw.carbs, DEFAULT_MACRO_TARGETS.carbs),
    fat: positive(raw.fat, DEFAULT_MACRO_TARGETS.fat),
  }
}

function parseDay(date: string, raw: unknown): DayRecord | null {
  if (!isValidDateKey(date)) return null
  const base = emptyDay(date)
  if (!isRecord(raw)) return base

  const checks: Record<string, boolean> = {}
  if (isRecord(raw.checks)) {
    for (const [id, value] of Object.entries(raw.checks)) {
      if (typeof value === 'boolean') checks[id] = value
    }
  }

  const macros = isRecord(raw.macros) ? raw.macros : {}
  const reading = isRecord(raw.reading) ? raw.reading : {}
  const workout = isRecord(raw.workout) ? raw.workout : {}

  const day: DayRecord = {
    date,
    checks,
    water: positive(raw.water),
    macros: {
      calories: positive(macros.calories),
      protein: positive(macros.protein),
      carbs: positive(macros.carbs),
      fat: positive(macros.fat),
      logged: bool(macros.logged),
    },
    reading: { pages: positive(reading.pages), book: str(reading.book) },
    workout: {
      minutes: positive(workout.minutes),
      kind: str(workout.kind),
      outdoors: bool(workout.outdoors),
    },
    note: str(raw.note),
  }
  const photoId = str(raw.photoId)
  if (photoId) day.photoId = photoId
  return day
}

export function parseAttempt(raw: unknown): Attempt | null {
  if (!isRecord(raw)) return null
  const startDate = isValidDateKey(raw.startDate) ? raw.startDate : todayKey()
  const days: Record<string, DayRecord> = {}
  if (isRecord(raw.days)) {
    for (const [date, value] of Object.entries(raw.days)) {
      const day = parseDay(date, value)
      if (day) days[date] = day
    }
  }
  const status = ['active', 'failed', 'completed', 'abandoned'].includes(String(raw.status))
    ? (raw.status as Attempt['status'])
    : 'active'

  const attempt: Attempt = {
    id: str(raw.id) || newId('attempt'),
    startDate,
    tasks: parseTasks(raw.tasks),
    macroTargets: parseMacroTargets(raw.macroTargets),
    days,
    status,
  }
  if (raw.endedAt) attempt.endedAt = str(raw.endedAt)
  if (raw.failedOnDay !== undefined) attempt.failedOnDay = positive(raw.failedOnDay)
  if (Array.isArray(raw.failedTasks)) attempt.failedTasks = raw.failedTasks.map((t) => str(t)).filter(Boolean)
  return attempt
}

function parseSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS }
  const theme = ['system', 'light', 'dark'].includes(String(raw.theme))
    ? (raw.theme as Settings['theme'])
    : DEFAULT_SETTINGS.theme
  const settings: Settings = {
    theme,
    waterIncrement: positive(raw.waterIncrement, DEFAULT_SETTINGS.waterIncrement) || DEFAULT_SETTINGS.waterIncrement,
    units: raw.units === 'imperial' ? 'imperial' : 'metric',
  }
  if (isValidDateKey(raw.restartPromptSnoozedFor)) settings.restartPromptSnoozedFor = raw.restartPromptSnoozedFor
  return settings
}

/**
 * Turn arbitrary parsed JSON into a valid AppState.
 *
 * Never throws: anything unrecognised falls back to a default, so a corrupt or
 * hand-edited backup degrades gracefully instead of white-screening the app.
 */
export function migrate(raw: unknown): AppState {
  if (!isRecord(raw)) return initialState()
  const current = parseAttempt(raw.current)
  const history = Array.isArray(raw.history)
    ? raw.history.map(parseAttempt).filter((a): a is Attempt => a !== null)
    : []
  return {
    version: SCHEMA_VERSION,
    current: current ?? initialState().current,
    history,
    settings: parseSettings(raw.settings),
  }
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage
    if (!s) return null
    // Safari in private mode exposes localStorage but throws on write.
    const probe = '__hard75_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

export function loadState(): AppState {
  const store = safeStorage()
  if (!store) return initialState()
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    return migrate(JSON.parse(raw))
  } catch {
    return initialState()
  }
}

let warnedAboutQuota = false

export function saveState(state: AppState): boolean {
  const store = safeStorage()
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (err) {
    if (!warnedAboutQuota) {
      warnedAboutQuota = true
      console.error('Could not save progress to localStorage', err)
    }
    return false
  }
}

export function clearState(): void {
  safeStorage()?.removeItem(STORAGE_KEY)
}
