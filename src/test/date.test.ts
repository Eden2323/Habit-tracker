import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHALLENGE_LENGTH,
  addDays,
  dateForDay,
  dayNumber,
  daysBetween,
  formatLong,
  formatShort,
  fromDateKey,
  isValidDateKey,
  msUntilMidnight,
  toDateKey,
  todayKey,
} from '../lib/date'

// @types/node is not in this tsconfig's `types` list, so reach for process
// through a narrow cast rather than pulling the whole node typings in.
const nodeEnv = (globalThis as unknown as { process?: { env: { TZ?: string } } }).process?.env

/**
 * Run `fn` with the process timezone switched. CI runs in UTC, where local and
 * UTC agree — the only way to prove date.ts uses local time is to move the
 * clock off Greenwich for the duration of the assertion.
 */
function withTimeZone(tz: string, fn: () => void): void {
  if (!nodeEnv) throw new Error('no process.env available to switch timezone')
  const previous = nodeEnv.TZ
  nodeEnv.TZ = tz
  try {
    fn()
  } finally {
    if (previous === undefined) delete nodeEnv.TZ
    else nodeEnv.TZ = previous
  }
}

describe('toDateKey', () => {
  it('uses local time, not UTC, west of Greenwich', () => {
    withTimeZone('America/Los_Angeles', () => {
      // 20:00 on 9 Sep in Los Angeles is already 10 Sep in UTC.
      const evening = new Date(Date.UTC(2026, 8, 10, 3, 0))
      expect(evening.toISOString().slice(0, 10)).toBe('2026-09-10')
      expect(toDateKey(evening)).toBe('2026-09-09')
    })
  })

  it('uses local time, not UTC, east of Greenwich', () => {
    withTimeZone('Asia/Tokyo', () => {
      // 01:00 on 10 Sep in Tokyo is still 9 Sep in UTC.
      const earlyHours = new Date(Date.UTC(2026, 8, 9, 16, 0))
      expect(earlyHours.toISOString().slice(0, 10)).toBe('2026-09-09')
      expect(toDateKey(earlyHours)).toBe('2026-09-10')
    })
  })

  it('reads the local calendar fields of the date', () => {
    const d = new Date(2026, 8, 9, 23, 59, 59)
    expect(toDateKey(d)).toBe('2026-09-09')
  })

  it('zero-pads month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('fromDateKey', () => {
  it('parses to local midnight', () => {
    const d = fromDateKey('2026-09-09')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(9)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('round-trips with toDateKey', () => {
    for (const key of ['2024-02-29', '2025-12-31', '2026-01-01', '2026-07-04']) {
      expect(toDateKey(fromDateKey(key))).toBe(key)
    }
  })
})

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01')
  })
})

describe('daysBetween', () => {
  it('counts across a month boundary', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2026-01-01', '2026-02-01')).toBe(31)
  })

  it('counts the leap day in a leap year and skips it otherwise', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366)
  })

  it('counts across a year boundary', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetween('2025-11-20', '2026-02-02')).toBe(74)
  })

  it('is negative when the range runs backwards, and zero for the same day', () => {
    expect(daysBetween('2026-02-01', '2026-01-31')).toBe(-1)
    expect(daysBetween('2026-02-01', '2026-02-01')).toBe(0)
  })

  it('is unaffected by DST transitions', () => {
    withTimeZone('America/Los_Angeles', () => {
      // 8 Mar 2026 is 23 hours long, 1 Nov 2026 is 25.
      expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
      expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1)
      expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    })
  })
})

describe('dayNumber and dateForDay', () => {
  it('makes the start date day 1', () => {
    expect(dayNumber('2026-01-01', '2026-01-01')).toBe(1)
    expect(dateForDay('2026-01-01', 1)).toBe('2026-01-01')
  })

  it('round-trips day 1 and day 75', () => {
    for (const start of ['2026-01-01', '2025-11-20', '2024-01-01']) {
      for (const day of [1, CHALLENGE_LENGTH]) {
        expect(dayNumber(start, dateForDay(start, day))).toBe(day)
      }
    }
  })

  it('lands day 75 on the right calendar date across month, year and leap boundaries', () => {
    expect(dateForDay('2026-01-01', 75)).toBe('2026-03-16')
    expect(dateForDay('2025-11-20', 75)).toBe('2026-02-02')
    expect(dateForDay('2024-01-01', 75)).toBe('2024-03-15')
  })

  it('numbers days before the start as zero or negative', () => {
    expect(dayNumber('2026-01-10', '2026-01-09')).toBe(0)
    expect(dayNumber('2026-01-10', '2026-01-08')).toBe(-1)
  })
})

describe('isValidDateKey', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateKey('2026-09-09')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true)
    expect(isValidDateKey('2026-12-31')).toBe(true)
  })

  it('rejects dates that do not exist', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-00-10')).toBe(false)
    expect(isValidDateKey('2026-04-31')).toBe(false)
  })

  it('rejects malformed strings', () => {
    expect(isValidDateKey('2026-1-5')).toBe(false)
    expect(isValidDateKey('nonsense')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
    expect(isValidDateKey('2026-09-09T00:00:00Z')).toBe(false)
    expect(isValidDateKey('26-09-09')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidDateKey(null)).toBe(false)
    expect(isValidDateKey(undefined)).toBe(false)
    expect(isValidDateKey(20260909)).toBe(false)
    expect(isValidDateKey(new Date())).toBe(false)
    expect(isValidDateKey(['2026-09-09'])).toBe(false)
    expect(isValidDateKey({ date: '2026-09-09' })).toBe(false)
  })
})

describe('todayKey', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the supplied clock', () => {
    expect(todayKey(new Date(2026, 8, 9, 13, 0))).toBe('2026-09-09')
  })

  it('falls back to the system clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 13, 0))
    expect(todayKey()).toBe('2026-09-09')
  })
})

describe('msUntilMidnight', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down to the next local midnight', () => {
    expect(msUntilMidnight(new Date(2026, 8, 9, 23, 59, 59))).toBe(1_000)
    expect(msUntilMidnight(new Date(2026, 8, 9, 23, 0, 0))).toBe(60 * 60 * 1000)
  })

  it('stays within (0, 86400000] at every hour of the day', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const ms = msUntilMidnight(new Date(2026, 8, 9, hour, 0, 0))
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThanOrEqual(86_400_000)
    }
  })

  it('returns a full day at midnight itself, never zero', () => {
    expect(msUntilMidnight(new Date(2026, 8, 9, 0, 0, 0))).toBe(86_400_000)
  })

  it('reads the system clock when called with no argument', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 22, 0, 0))
    expect(msUntilMidnight()).toBe(2 * 60 * 60 * 1000)
  })
})

describe('formatting', () => {
  it('formats a short label', () => {
    expect(formatShort('2026-09-09')).toBe('Wed 9 Sep')
  })

  it('formats a long label', () => {
    // The JSDoc example spells the month out; the shared MONTHS table is
    // abbreviated, so the long form differs only by the weekday and year.
    expect(formatLong('2026-09-09')).toBe('Wednesday, 9 Sep 2026')
  })
})
