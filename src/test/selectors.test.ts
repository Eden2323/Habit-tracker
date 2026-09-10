import { describe, expect, it } from 'vitest'
import { CHALLENGE_LENGTH, dateForDay } from '../lib/date'
import { DEFAULT_TASKS, emptyDay } from '../lib/defaults'
import {
  activeTasks,
  currentStreak,
  dayCompletion,
  dayHasActivity,
  dayState,
  dayStatuses,
  firstMissedDay,
  getDay,
  isChallengeComplete,
  isDayComplete,
  longestStreak,
  missedTaskLabels,
  photoDays,
  summarise,
  taskConsistency,
  taskStatus,
} from '../lib/selectors'
import type { DayRecord } from '../lib/types'
import { completeRun, makeAttempt, makeCompleteDay, makeDay, makeTask } from './factories'

const START = '2026-01-01'
const day = (n: number) => dateForDay(START, n)

/** Thousands separators are locale-dependent; the units and order are not. */
const grouped = (n: number) => n.toLocaleString()

describe('taskStatus', () => {
  it('tracks water against its target', () => {
    const task = makeTask({ id: 'water', kind: 'water', target: 2000 })
    const half = taskStatus(task, makeDay('2026-01-01', { water: 1000 }))
    expect(half.done).toBe(false)
    expect(half.progress).toBeCloseTo(0.5)
    expect(half.detail).toBe(`${grouped(1000)} / ${grouped(2000)} ml`)

    const met = taskStatus(task, makeDay('2026-01-01', { water: 2000 }))
    expect(met.done).toBe(true)
    expect(met.progress).toBe(1)

    // Progress never exceeds 1, however much they drink.
    expect(taskStatus(task, makeDay('2026-01-01', { water: 5000 })).progress).toBe(1)
  })

  it('rounds the water detail and falls back to a 2 L target', () => {
    const rounded = taskStatus(makeTask({ id: 'water', kind: 'water', target: 2000 }), makeDay('2026-01-01', { water: 1250.6 }))
    expect(rounded.detail).toBe(`${grouped(1251)} / ${grouped(2000)} ml`)

    const noTarget = makeTask({ id: 'water', kind: 'water' })
    expect(taskStatus(noTarget, makeDay('2026-01-01', { water: 2000 })).done).toBe(true)
    expect(taskStatus(noTarget, makeDay('2026-01-01', { water: 1999 })).done).toBe(false)
  })

  it('treats a zero target as unreachable rather than dividing by zero', () => {
    const status = taskStatus(makeTask({ id: 'water', kind: 'water', target: 0 }), makeDay('2026-01-01', { water: 500 }))
    expect(status.progress).toBe(0)
    expect(status.done).toBe(false)
  })

  it('tracks reading pages', () => {
    const task = makeTask({ id: 'reading', kind: 'reading', target: 10 })
    const partial = taskStatus(task, makeDay('2026-01-01', { reading: { pages: 5, book: 'Dune' } }))
    expect(partial.done).toBe(false)
    expect(partial.progress).toBeCloseTo(0.5)
    expect(partial.detail).toBe('5 / 10 pages')

    expect(taskStatus(task, makeDay('2026-01-01', { reading: { pages: 10, book: '' } })).done).toBe(true)
  })

  it('tracks workout minutes', () => {
    const task = makeTask({ id: 'workout', kind: 'workout', target: 45 })
    const short = taskStatus(task, makeDay('2026-01-01', { workout: { minutes: 20, kind: 'Run', outdoors: true } }))
    expect(short.done).toBe(false)
    expect(short.detail).toBe('20 / 45 min')

    const full = taskStatus(task, makeDay('2026-01-01', { workout: { minutes: 45, kind: 'Run', outdoors: true } }))
    expect(full.done).toBe(true)
    expect(full.progress).toBe(1)
  })

  it('treats macros as done once they are logged', () => {
    const task = makeTask({ id: 'macros', kind: 'macros' })
    const unlogged = taskStatus(task, makeDay('2026-01-01'))
    expect(unlogged.done).toBe(false)
    expect(unlogged.detail).toBe('Not logged')

    const logged = taskStatus(
      task,
      makeDay('2026-01-01', { macros: { calories: 2200, protein: 160, carbs: 220, fat: 70, logged: true } }),
    )
    expect(logged.done).toBe(true)
    expect(logged.detail).toBe('160P · 220C · 70F')
  })

  it('treats a photo as done once one is attached', () => {
    const task = makeTask({ id: 'photo', kind: 'photo' })
    expect(taskStatus(task, makeDay('2026-01-01')).detail).toBe('Not taken')
    const taken = taskStatus(task, makeDay('2026-01-01', { photoId: 'photo_2026-01-01' }))
    expect(taken.done).toBe(true)
    expect(taken.detail).toBe('Taken')
  })

  it('reads a plain check straight off the day', () => {
    const task = makeTask({ id: 'cold-shower', kind: 'check' })
    expect(taskStatus(task, makeDay('2026-01-01')).done).toBe(false)
    expect(taskStatus(task, makeDay('2026-01-01', { checks: { 'cold-shower': true } })).done).toBe(true)
    expect(taskStatus(task, makeDay('2026-01-01', { checks: { 'cold-shower': true } })).detail).toBe('Done')
  })

  it('lets a manual false override beat a satisfied tracker', () => {
    const task = makeTask({ id: 'water', kind: 'water', target: 2000 })
    const status = taskStatus(task, makeDay('2026-01-01', { water: 2500, checks: { water: false } }))
    expect(status.done).toBe(false)
    // The detail still reports what the tracker actually saw.
    expect(status.detail).toBe(`${grouped(2500)} / ${grouped(2000)} ml`)
  })

  it('lets a manual true override beat an unsatisfied tracker', () => {
    const task = makeTask({ id: 'water', kind: 'water', target: 2000 })
    const status = taskStatus(task, makeDay('2026-01-01', { water: 0, checks: { water: true } }))
    expect(status.done).toBe(true)
    expect(status.progress).toBe(1)
    expect(status.detail).toBe(`${grouped(0)} / ${grouped(2000)} ml`)
  })

  it('overrides a photo that was never taken', () => {
    const task = makeTask({ id: 'photo', kind: 'photo' })
    expect(taskStatus(task, makeDay('2026-01-01', { checks: { photo: true } })).done).toBe(true)
    expect(taskStatus(task, makeDay('2026-01-01', { photoId: 'p', checks: { photo: false } })).done).toBe(false)
  })
})

describe('getDay and activeTasks', () => {
  it('returns a blank record for a day never touched', () => {
    const attempt = makeAttempt({ startDate: START })
    expect(getDay(attempt, day(3))).toEqual(emptyDay(day(3)))
  })

  it('lists only enabled tasks, in checklist order', () => {
    const attempt = makeAttempt({
      startDate: START,
      tasks: DEFAULT_TASKS.map((t) => (t.id === 'photo' ? { ...t, enabled: false } : t)),
    })
    expect(activeTasks(attempt).map((t) => t.id)).toEqual(['workout', 'macros', 'water', 'reading'])
  })
})

describe('isDayComplete', () => {
  it('is true when every enabled task is done', () => {
    const attempt = makeAttempt({ startDate: START, days: [makeCompleteDay(day(1))] })
    expect(isDayComplete(attempt, day(1))).toBe(true)
  })

  it('is false when one rule is short', () => {
    const attempt = makeAttempt({ startDate: START, days: [makeCompleteDay(day(1), { water: 1500 })] })
    expect(isDayComplete(attempt, day(1))).toBe(false)
  })

  it('ignores a disabled task', () => {
    const noPhotoDay = makeCompleteDay(day(1))
    delete noPhotoDay.photoId
    const withPhotoRule = makeAttempt({ startDate: START, days: [noPhotoDay] })
    expect(isDayComplete(withPhotoRule, day(1))).toBe(false)

    const withoutPhotoRule = makeAttempt({
      startDate: START,
      tasks: DEFAULT_TASKS.map((t) => (t.id === 'photo' ? { ...t, enabled: false } : t)),
      days: [noPhotoDay],
    })
    expect(isDayComplete(withoutPhotoRule, day(1))).toBe(true)
  })

  it('is false when there are no enabled tasks at all', () => {
    const attempt = makeAttempt({
      startDate: START,
      tasks: [makeTask({ enabled: false })],
      days: [makeCompleteDay(day(1))],
    })
    expect(isDayComplete(attempt, day(1))).toBe(false)
  })

  it('is false for an untouched day', () => {
    expect(isDayComplete(makeAttempt({ startDate: START }), day(4))).toBe(false)
  })
})

describe('dayCompletion and dayStatuses', () => {
  it('counts how many of the day’s rules are done', () => {
    const partial = makeDay(day(1), { water: 2000, reading: { pages: 10, book: 'Dune' } })
    const attempt = makeAttempt({ startDate: START, days: [partial] })
    expect(dayCompletion(attempt, day(1))).toEqual({ done: 2, total: 5 })
    expect(dayStatuses(attempt, day(1)).map((s) => s.task.id)).toEqual(['workout', 'macros', 'water', 'reading', 'photo'])
  })

  it('drops disabled tasks from the total', () => {
    const attempt = makeAttempt({
      startDate: START,
      tasks: DEFAULT_TASKS.map((t) => (t.id === 'photo' ? { ...t, enabled: false } : t)),
      days: [makeDay(day(1), { water: 2000 })],
    })
    expect(dayCompletion(attempt, day(1))).toEqual({ done: 1, total: 4 })
  })
})

describe('dayHasActivity', () => {
  const attemptWith = (record: DayRecord) => makeAttempt({ startDate: START, days: [record] })

  it('is false when the day was never touched or is entirely blank', () => {
    expect(dayHasActivity(makeAttempt({ startDate: START }), day(1))).toBe(false)
    expect(dayHasActivity(attemptWith(makeDay(day(1))), day(1))).toBe(false)
  })

  it('ignores whitespace-only notes and unchecked overrides', () => {
    expect(dayHasActivity(attemptWith(makeDay(day(1), { note: '   ' })), day(1))).toBe(false)
    expect(dayHasActivity(attemptWith(makeDay(day(1), { checks: { water: false } })), day(1))).toBe(false)
  })

  it('is true for any real trace of the day', () => {
    expect(dayHasActivity(attemptWith(makeDay(day(1), { water: 250 })), day(1))).toBe(true)
    expect(dayHasActivity(attemptWith(makeDay(day(1), { note: 'rough one' })), day(1))).toBe(true)
    expect(dayHasActivity(attemptWith(makeDay(day(1), { photoId: 'p' })), day(1))).toBe(true)
    expect(dayHasActivity(attemptWith(makeDay(day(1), { checks: { water: true } })), day(1))).toBe(true)
  })
})

describe('dayState', () => {
  const today = day(5)
  const attempt = makeAttempt({
    startDate: START,
    days: [makeCompleteDay(day(1)), makeDay(day(3), { water: 500 })],
  })

  it('labels each day relative to today', () => {
    expect(dayState(attempt, 1, today)).toBe('complete')
    expect(dayState(attempt, 2, today)).toBe('missed')
    expect(dayState(attempt, 3, today)).toBe('partial')
    expect(dayState(attempt, 5, today)).toBe('today')
    expect(dayState(attempt, 6, today)).toBe('future')
  })

  it('prefers complete over today', () => {
    const finished = makeAttempt({ startDate: START, days: [makeCompleteDay(today)] })
    expect(dayState(finished, 5, today)).toBe('complete')
  })
})

describe('firstMissedDay', () => {
  it('is null when only today is incomplete — today is never a failure', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 4) })
    expect(firstMissedDay(attempt, day(5))).toBeNull()
  })

  it('is null on the very first day, before anything has been logged', () => {
    expect(firstMissedDay(makeAttempt({ startDate: START }), day(1))).toBeNull()
  })

  it('returns the first past day that fell short', () => {
    const days = [...completeRun(START, 4)]
    days[1] = makeCompleteDay(day(2), { water: 100 })
    const attempt = makeAttempt({ startDate: START, days })
    expect(firstMissedDay(attempt, day(5))).toBe(2)
  })

  it('returns day 1 when nothing has ever been logged', () => {
    expect(firstMissedDay(makeAttempt({ startDate: START }), day(3))).toBe(1)
  })

  it('never looks past day 75', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, CHALLENGE_LENGTH) })
    expect(firstMissedDay(attempt, dateForDay(START, 90))).toBeNull()
  })
})

describe('missedTaskLabels', () => {
  it('names the rules left unfinished', () => {
    const attempt = makeAttempt({ startDate: START, days: [makeDay(day(2), { water: 2000 })] })
    expect(missedTaskLabels(attempt, 2)).toEqual(['45 minute workout', 'Track macros', 'Read 10 pages', 'Progress photo'])
  })
})

describe('streaks', () => {
  it('is not broken by an unfinished today', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 4) })
    expect(currentStreak(attempt, day(5))).toBe(4)
  })

  it('counts today once it is complete', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 5) })
    expect(currentStreak(attempt, day(5))).toBe(5)
  })

  it('stops at the most recent gap', () => {
    const attempt = makeAttempt({
      startDate: START,
      days: [makeCompleteDay(day(1)), makeCompleteDay(day(2)), makeCompleteDay(day(4))],
    })
    expect(currentStreak(attempt, day(5))).toBe(1)
  })

  it('is zero with nothing logged', () => {
    expect(currentStreak(makeAttempt({ startDate: START }), day(5))).toBe(0)
    expect(currentStreak(makeAttempt({ startDate: START }), day(1))).toBe(0)
  })

  it('tracks the longest run anywhere in the attempt', () => {
    const attempt = makeAttempt({
      startDate: START,
      days: [
        makeCompleteDay(day(1)),
        makeCompleteDay(day(2)),
        makeCompleteDay(day(3)),
        makeCompleteDay(day(5)),
        makeCompleteDay(day(6)),
      ],
    })
    expect(longestStreak(attempt, day(6))).toBe(3)
    expect(currentStreak(attempt, day(6))).toBe(2)
  })

  it('does not count days that have not happened yet', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 10) })
    expect(longestStreak(attempt, day(4))).toBe(4)
  })
})

describe('taskConsistency', () => {
  it('rates each rule across every elapsed day', () => {
    const attempt = makeAttempt({
      startDate: START,
      days: [makeCompleteDay(day(1)), makeCompleteDay(day(2)), makeDay(day(3), { water: 2000 })],
    })
    const rates = taskConsistency(attempt, day(4))
    const water = rates.find((r) => r.task.id === 'water')
    const photo = rates.find((r) => r.task.id === 'photo')

    expect(water).toMatchObject({ done: 3, elapsed: 4 })
    expect(water?.rate).toBeCloseTo(0.75)
    expect(photo).toMatchObject({ done: 2, elapsed: 4 })
    expect(photo?.rate).toBeCloseTo(0.5)
  })

  it('excludes disabled tasks and survives a start date in the future', () => {
    const attempt = makeAttempt({
      startDate: START,
      tasks: DEFAULT_TASKS.map((t) => (t.id === 'photo' ? { ...t, enabled: false } : t)),
    })
    const rates = taskConsistency(attempt, '2025-12-25')
    expect(rates.map((r) => r.task.id)).toEqual(['workout', 'macros', 'water', 'reading'])
    expect(rates.every((r) => r.elapsed === 0 && r.rate === 0)).toBe(true)
  })
})

describe('summarise', () => {
  const attempt = makeAttempt({
    startDate: START,
    days: [makeCompleteDay(day(1)), makeCompleteDay(day(2)), makeDay(day(3), { water: 500 })],
  })

  it('totals the attempt up to today', () => {
    const summary = summarise(attempt, day(3))
    expect(summary).toMatchObject({
      dayNumber: 3,
      elapsed: 3,
      daysComplete: 2,
      // Calendar days left in the window, vs complete days still owed — day 3
      // has begun but is unfinished, so the two differ by one.
      daysRemaining: CHALLENGE_LENGTH - 3,
      daysToEarn: CHALLENGE_LENGTH - 2,
      currentStreak: 2,
      longestStreak: 2,
      totalWaterMl: 4500,
      totalPages: 20,
      totalWorkoutMinutes: 90,
      photoCount: 2,
    })
    expect(summary.percentComplete).toBeCloseTo((2 / CHALLENGE_LENGTH) * 100)
  })

  it('clamps the day number to the challenge window', () => {
    expect(summarise(attempt, '2025-12-25')).toMatchObject({ dayNumber: 1, elapsed: 0, daysComplete: 0 })
    expect(summarise(attempt, dateForDay(START, 200))).toMatchObject({ dayNumber: CHALLENGE_LENGTH, elapsed: CHALLENGE_LENGTH })
  })
})

describe('isChallengeComplete', () => {
  it('needs all 75 days', () => {
    const almost = makeAttempt({ startDate: START, days: completeRun(START, CHALLENGE_LENGTH - 1) })
    expect(isChallengeComplete(almost)).toBe(false)

    const finished = makeAttempt({ startDate: START, days: completeRun(START, CHALLENGE_LENGTH) })
    expect(isChallengeComplete(finished)).toBe(true)
  })

  it('is unmoved by extra days beyond the challenge', () => {
    const days = completeRun(START, CHALLENGE_LENGTH + 5)
    days[10] = makeCompleteDay(day(11), { water: 0 })
    expect(isChallengeComplete(makeAttempt({ startDate: START, days }))).toBe(false)
  })
})

describe('photoDays', () => {
  it('returns only days with a photo, oldest first', () => {
    const attempt = makeAttempt({
      startDate: START,
      days: [makeCompleteDay(day(3)), makeDay(day(1), { photoId: 'photo_a' }), makeDay(day(2), { water: 500 })],
    })
    expect(photoDays(attempt).map((d) => d.date)).toEqual([day(1), day(3)])
  })
})
