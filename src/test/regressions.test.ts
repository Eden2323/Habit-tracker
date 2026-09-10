/**
 * Regressions found by the post-build review.
 *
 * Each test here pins a behaviour that was wrong once: they are the cheapest
 * way to stop the same misreading of the domain creeping back in.
 */

import { describe, expect, it } from 'vitest'
import { CHALLENGE_LENGTH, addDays, dateForDay } from '../lib/date'
import { photoDays, summarise } from '../lib/selectors'
import { STORAGE_KEY, loadState, migrate } from '../lib/storage'
import { completeRun, makeAttempt, makeCompleteDay, makeDay } from './factories'

const START = '2026-01-01'

describe('summarise totals are windowed to the attempt', () => {
  it('ignores day records that fall outside the current start date', () => {
    // Twenty logged days from 1 Jan, then the user corrects Day 1 to 11 Jan.
    // The first ten records now sit before the window and must not be counted.
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 20) })
    const moved = { ...attempt, startDate: addDays(START, 10) }

    const summary = summarise(moved, addDays(START, 19))

    expect(summary.elapsed).toBe(10)
    expect(summary.daysComplete).toBe(10)
    // Ten complete days at 2,000 ml / 10 pages / 45 min / one photo each.
    expect(summary.totalWaterMl).toBe(20_000)
    expect(summary.totalPages).toBe(100)
    expect(summary.totalWorkoutMinutes).toBe(450)
    expect(summary.photoCount).toBe(10)
  })

  it('separates calendar days left from complete days still owed', () => {
    // Day 4 missed, days 1-3 and 5-10 complete, today is day 10.
    const days = [
      ...completeRun(START, 3),
      makeDay(dateForDay(START, 4), { water: 500 }),
      ...Array.from({ length: 6 }, (_, i) => makeCompleteDay(dateForDay(START, i + 5))),
    ]
    const attempt = makeAttempt({ startDate: START, days })

    const summary = summarise(attempt, dateForDay(START, 10))

    expect(summary.daysComplete).toBe(9)
    // 65 days of calendar left (11..75), but 66 complete days still to earn.
    expect(summary.daysRemaining).toBe(CHALLENGE_LENGTH - 10)
    expect(summary.daysToEarn).toBe(CHALLENGE_LENGTH - 9)
    expect(summary.daysRemaining).toBeLessThan(summary.daysToEarn)
  })
})

describe('photoDays stays inside the attempt window', () => {
  it('drops photos whose day number would be zero or negative', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 5) })
    const moved = { ...attempt, startDate: addDays(START, 3) }

    const shown = photoDays(moved)

    // Days 1-3 of the old run now sit before the window; only 2 remain.
    expect(shown).toHaveLength(2)
    expect(shown.map((d) => d.date)).toEqual([addDays(START, 3), addDays(START, 4)])
  })

  it('drops photos past day 75', () => {
    const attempt = makeAttempt({
      startDate: START,
      days: [makeCompleteDay(dateForDay(START, 1)), makeCompleteDay(dateForDay(START, CHALLENGE_LENGTH + 1))],
    })

    expect(photoDays(attempt).map((d) => d.date)).toEqual([dateForDay(START, 1)])
  })
})

describe('unreadable stored state is salvaged, not overwritten', () => {
  it('keeps the raw value under a side key and still returns a usable state', () => {
    const truncated = '{"version":1,"current":{"startDate":"2026-01-01","days":{'
    localStorage.setItem(STORAGE_KEY, truncated)

    const state = loadState()

    expect(state.current.days).toEqual({})
    expect(localStorage.getItem(`${STORAGE_KEY}:unreadable`)).toBe(truncated)
    localStorage.clear()
  })

  it('leaves a readable state alone', () => {
    const attempt = makeAttempt({ startDate: START, days: completeRun(START, 2) })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, current: attempt, history: [], settings: {} }))

    const state = loadState()

    expect(Object.keys(state.current.days)).toHaveLength(2)
    expect(localStorage.getItem(`${STORAGE_KEY}:unreadable`)).toBeNull()
    localStorage.clear()
  })
})

describe('migrate is idempotent', () => {
  it('produces the same state when run over its own output', () => {
    const once = migrate({ current: makeAttempt({ startDate: START, days: completeRun(START, 3) }) })
    const twice = migrate(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })
})
