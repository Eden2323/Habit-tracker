import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { msUntilMidnight, todayKey } from './date'
import { emptyDay, newAttempt } from './defaults'
import { loadState, saveState } from './storage'
import type { AppState, Attempt, DateKey, DayRecord, MacroEntry, MacroTargets, ReadingEntry, Settings, TaskDef, WorkoutEntry } from './types'

export type Action =
  | { type: 'setWater'; date: DateKey; ml: number }
  | { type: 'addWater'; date: DateKey; ml: number }
  | { type: 'setMacros'; date: DateKey; macros: Partial<MacroEntry> }
  | { type: 'setReading'; date: DateKey; reading: Partial<ReadingEntry> }
  | { type: 'setWorkout'; date: DateKey; workout: Partial<WorkoutEntry> }
  | { type: 'setNote'; date: DateKey; note: string }
  | { type: 'setCheck'; date: DateKey; taskId: string; value: boolean }
  | { type: 'clearCheck'; date: DateKey; taskId: string }
  | { type: 'setPhoto'; date: DateKey; photoId?: string }
  | { type: 'setTasks'; tasks: TaskDef[] }
  | { type: 'setMacroTargets'; targets: MacroTargets }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'setStartDate'; date: DateKey }
  | { type: 'restart'; reason: Attempt['status']; failedOnDay?: number; failedTasks?: string[]; startDate?: DateKey }
  | { type: 'completeChallenge' }
  | { type: 'replaceState'; state: AppState }

/** Apply a change to one day of the current attempt, creating it if needed. */
function withDay(state: AppState, date: DateKey, update: (day: DayRecord) => DayRecord): AppState {
  const existing = state.current.days[date] ?? emptyDay(date)
  const next = update(existing)
  return {
    ...state,
    current: { ...state.current, days: { ...state.current.days, [date]: next } },
  }
}

const clampPositive = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setWater':
      return withDay(state, action.date, (d) => ({ ...d, water: clampPositive(action.ml) }))

    case 'addWater':
      return withDay(state, action.date, (d) => ({ ...d, water: clampPositive(d.water + action.ml) }))

    case 'setMacros':
      return withDay(state, action.date, (d) => {
        const merged = { ...d.macros, ...action.macros }
        return {
          ...d,
          macros: {
            calories: clampPositive(merged.calories),
            protein: clampPositive(merged.protein),
            carbs: clampPositive(merged.carbs),
            fat: clampPositive(merged.fat),
            logged: merged.logged,
          },
        }
      })

    case 'setReading':
      return withDay(state, action.date, (d) => {
        const merged = { ...d.reading, ...action.reading }
        return { ...d, reading: { pages: clampPositive(merged.pages), book: merged.book } }
      })

    case 'setWorkout':
      return withDay(state, action.date, (d) => {
        const merged = { ...d.workout, ...action.workout }
        return {
          ...d,
          workout: { minutes: clampPositive(merged.minutes), kind: merged.kind, outdoors: merged.outdoors },
        }
      })

    case 'setNote':
      return withDay(state, action.date, (d) => ({ ...d, note: action.note }))

    case 'setCheck':
      return withDay(state, action.date, (d) => ({
        ...d,
        checks: { ...d.checks, [action.taskId]: action.value },
      }))

    case 'clearCheck':
      return withDay(state, action.date, (d) => {
        const checks = { ...d.checks }
        delete checks[action.taskId]
        return { ...d, checks }
      })

    case 'setPhoto':
      return withDay(state, action.date, (d) => {
        const next: DayRecord = { ...d }
        if (action.photoId) next.photoId = action.photoId
        else delete next.photoId
        return next
      })

    case 'setTasks':
      return { ...state, current: { ...state.current, tasks: action.tasks } }

    case 'setMacroTargets':
      return { ...state, current: { ...state.current, macroTargets: action.targets } }

    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }

    case 'setStartDate':
      return { ...state, current: { ...state.current, startDate: action.date } }

    case 'restart': {
      // The old attempt is archived rather than deleted — the history view is
      // the whole point of "see how far you got last time".
      const archived: Attempt = {
        ...state.current,
        status: action.reason,
        endedAt: new Date().toISOString(),
      }
      if (action.failedOnDay !== undefined) archived.failedOnDay = action.failedOnDay
      if (action.failedTasks !== undefined) archived.failedTasks = action.failedTasks

      const fresh = newAttempt(action.startDate ?? todayKey(), state.current.tasks)
      fresh.macroTargets = { ...state.current.macroTargets }

      const settings = { ...state.settings }
      delete settings.restartPromptSnoozedFor

      return { ...state, current: fresh, history: [...state.history, archived], settings }
    }

    case 'completeChallenge':
      return {
        ...state,
        current: { ...state.current, status: 'completed', endedAt: new Date().toISOString() },
      }

    case 'replaceState':
      return action.state

    default:
      return state
  }
}

interface StoreValue {
  state: AppState
  dispatch: (action: Action) => void
  /** Today's date key, refreshed automatically when the clock crosses midnight. */
  today: DateKey
  /** False when localStorage rejected the last write (private mode, quota). */
  persisted: boolean
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initial ?? loadState())
  const [today, setToday] = useState<DateKey>(() => todayKey())
  const [persisted, setPersisted] = useState(true)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setPersisted(saveState(state))
  }, [state])

  // Roll over to the new day without needing a refresh. A timeout to the next
  // midnight is cheaper and more accurate than polling every minute, and the
  // visibility listener catches phones that slept through the boundary.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setToday(todayKey())
        schedule()
      }, msUntilMidnight() + 1000)
    }
    schedule()

    const onVisible = () => {
      if (document.visibilityState === 'visible') setToday(todayKey())
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const value = useMemo<StoreValue>(() => ({ state, dispatch, today, persisted }), [state, today, persisted])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside a <StoreProvider>')
  return ctx
}

/** Convenience hook for the attempt currently in progress. */
export function useAttempt(): Attempt {
  return useStore().state.current
}
