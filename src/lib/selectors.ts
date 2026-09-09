import { CHALLENGE_LENGTH, dateForDay, dayNumber, todayKey } from './date'
import { emptyDay } from './defaults'
import type { Attempt, DateKey, DayRecord, TaskDef, TaskStatus } from './types'

/** The day record for a date, or a blank one if it was never touched. */
export function getDay(attempt: Attempt, date: DateKey): DayRecord {
  return attempt.days[date] ?? emptyDay(date)
}

/** Tasks that count toward completion, in checklist order. */
export function activeTasks(attempt: Attempt): TaskDef[] {
  return attempt.tasks.filter((t) => t.enabled)
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString()
}

/**
 * Completion state for one task on one day.
 *
 * Tracker-backed tasks (water, reading, workout, macros, photo) complete
 * themselves once their target is met, but an explicit entry in `day.checks`
 * always wins — that is the manual override, in either direction.
 */
export function taskStatus(task: TaskDef, day: DayRecord): TaskStatus {
  let progress = 0
  let detail = ''

  switch (task.kind) {
    case 'water': {
      const target = task.target ?? 2000
      progress = target > 0 ? Math.min(1, day.water / target) : 0
      detail = `${formatNumber(day.water)} / ${formatNumber(target)} ml`
      break
    }
    case 'reading': {
      const target = task.target ?? 10
      progress = target > 0 ? Math.min(1, day.reading.pages / target) : 0
      detail = `${formatNumber(day.reading.pages)} / ${formatNumber(target)} pages`
      break
    }
    case 'workout': {
      const target = task.target ?? 45
      progress = target > 0 ? Math.min(1, day.workout.minutes / target) : 0
      detail = `${formatNumber(day.workout.minutes)} / ${formatNumber(target)} min`
      break
    }
    case 'macros': {
      progress = day.macros.logged ? 1 : 0
      detail = day.macros.logged
        ? `${formatNumber(day.macros.protein)}P · ${formatNumber(day.macros.carbs)}C · ${formatNumber(day.macros.fat)}F`
        : 'Not logged'
      break
    }
    case 'photo': {
      progress = day.photoId ? 1 : 0
      detail = day.photoId ? 'Taken' : 'Not taken'
      break
    }
    case 'check': {
      progress = day.checks[task.id] ? 1 : 0
      detail = day.checks[task.id] ? 'Done' : 'Not done'
      break
    }
  }

  const override = day.checks[task.id]
  const done = override !== undefined ? override : progress >= 1
  return { task, done, progress: done ? 1 : progress, detail }
}

export function dayStatuses(attempt: Attempt, date: DateKey): TaskStatus[] {
  const day = getDay(attempt, date)
  return activeTasks(attempt).map((t) => taskStatus(t, day))
}

/** True when every enabled task is done for that date. */
export function isDayComplete(attempt: Attempt, date: DateKey): boolean {
  const statuses = dayStatuses(attempt, date)
  return statuses.length > 0 && statuses.every((s) => s.done)
}

/** How many of the day's tasks are done. */
export function dayCompletion(attempt: Attempt, date: DateKey): { done: number; total: number } {
  const statuses = dayStatuses(attempt, date)
  return { done: statuses.filter((s) => s.done).length, total: statuses.length }
}

/** True when the user has recorded anything at all on that date. */
export function dayHasActivity(attempt: Attempt, date: DateKey): boolean {
  const day = attempt.days[date]
  if (!day) return false
  return (
    day.water > 0 ||
    day.reading.pages > 0 ||
    day.workout.minutes > 0 ||
    day.macros.logged ||
    Boolean(day.photoId) ||
    day.note.trim().length > 0 ||
    Object.values(day.checks).some(Boolean)
  )
}

export type DayState = 'complete' | 'missed' | 'today' | 'future' | 'partial'

/**
 * Board state for a single challenge day. `missed` only ever applies to days
 * that are fully in the past — today is never a failure until it is over.
 */
export function dayState(attempt: Attempt, day: number, today: DateKey = todayKey()): DayState {
  const date = dateForDay(attempt.startDate, day)
  const todayNum = dayNumber(attempt.startDate, today)
  if (isDayComplete(attempt, date)) return 'complete'
  if (day > todayNum) return 'future'
  if (day === todayNum) return 'today'
  return dayHasActivity(attempt, date) ? 'partial' : 'missed'
}

/**
 * The first past day that was left incomplete, or null if the attempt is clean.
 * This is what triggers the restart prompt.
 */
export function firstMissedDay(attempt: Attempt, today: DateKey = todayKey()): number | null {
  const todayNum = dayNumber(attempt.startDate, today)
  const lastPast = Math.min(todayNum - 1, CHALLENGE_LENGTH)
  for (let day = 1; day <= lastPast; day += 1) {
    if (!isDayComplete(attempt, dateForDay(attempt.startDate, day))) return day
  }
  return null
}

/** Names of the tasks left unfinished on a given challenge day. */
export function missedTaskLabels(attempt: Attempt, day: number): string[] {
  const date = dateForDay(attempt.startDate, day)
  return dayStatuses(attempt, date)
    .filter((s) => !s.done)
    .map((s) => s.task.label)
}

/** Consecutive complete days ending at today (or yesterday, if today is unfinished). */
export function currentStreak(attempt: Attempt, today: DateKey = todayKey()): number {
  const todayNum = Math.min(dayNumber(attempt.startDate, today), CHALLENGE_LENGTH)
  let streak = 0
  let day = todayNum
  // Today only extends the streak once it is actually complete; an unfinished
  // today should not read as a broken streak while there is still time left.
  if (day >= 1 && !isDayComplete(attempt, dateForDay(attempt.startDate, day))) day -= 1
  while (day >= 1 && isDayComplete(attempt, dateForDay(attempt.startDate, day))) {
    streak += 1
    day -= 1
  }
  return streak
}

/** Longest run of complete days anywhere in the attempt. */
export function longestStreak(attempt: Attempt, today: DateKey = todayKey()): number {
  const todayNum = Math.min(dayNumber(attempt.startDate, today), CHALLENGE_LENGTH)
  let best = 0
  let run = 0
  for (let day = 1; day <= Math.max(0, todayNum); day += 1) {
    if (isDayComplete(attempt, dateForDay(attempt.startDate, day))) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

export interface TaskConsistency {
  task: TaskDef
  done: number
  elapsed: number
  rate: number
}

/** Per-task completion rate across every elapsed day of the attempt. */
export function taskConsistency(attempt: Attempt, today: DateKey = todayKey()): TaskConsistency[] {
  const elapsed = Math.max(0, Math.min(dayNumber(attempt.startDate, today), CHALLENGE_LENGTH))
  return activeTasks(attempt).map((task) => {
    let done = 0
    for (let day = 1; day <= elapsed; day += 1) {
      const date = dateForDay(attempt.startDate, day)
      if (taskStatus(task, getDay(attempt, date)).done) done += 1
    }
    return { task, done, elapsed, rate: elapsed > 0 ? done / elapsed : 0 }
  })
}

export interface AttemptSummary {
  dayNumber: number
  daysComplete: number
  daysRemaining: number
  elapsed: number
  percentComplete: number
  currentStreak: number
  longestStreak: number
  totalWaterMl: number
  totalPages: number
  totalWorkoutMinutes: number
  photoCount: number
}

export function summarise(attempt: Attempt, today: DateKey = todayKey()): AttemptSummary {
  const rawDay = dayNumber(attempt.startDate, today)
  const current = Math.max(1, Math.min(rawDay, CHALLENGE_LENGTH))
  const elapsed = Math.max(0, Math.min(rawDay, CHALLENGE_LENGTH))

  let daysComplete = 0
  for (let day = 1; day <= elapsed; day += 1) {
    if (isDayComplete(attempt, dateForDay(attempt.startDate, day))) daysComplete += 1
  }

  let totalWaterMl = 0
  let totalPages = 0
  let totalWorkoutMinutes = 0
  let photoCount = 0
  for (const day of Object.values(attempt.days)) {
    totalWaterMl += day.water
    totalPages += day.reading.pages
    totalWorkoutMinutes += day.workout.minutes
    if (day.photoId) photoCount += 1
  }

  return {
    dayNumber: current,
    daysComplete,
    daysRemaining: Math.max(0, CHALLENGE_LENGTH - daysComplete),
    elapsed,
    percentComplete: (daysComplete / CHALLENGE_LENGTH) * 100,
    currentStreak: currentStreak(attempt, today),
    longestStreak: longestStreak(attempt, today),
    totalWaterMl,
    totalPages,
    totalWorkoutMinutes,
    photoCount,
  }
}

/** True once all 75 days are complete. */
export function isChallengeComplete(attempt: Attempt): boolean {
  for (let day = 1; day <= CHALLENGE_LENGTH; day += 1) {
    if (!isDayComplete(attempt, dateForDay(attempt.startDate, day))) return false
  }
  return true
}

/** Dates that have a photo, oldest first. */
export function photoDays(attempt: Attempt): DayRecord[] {
  return Object.values(attempt.days)
    .filter((d) => Boolean(d.photoId))
    .sort((a, b) => a.date.localeCompare(b.date))
}
