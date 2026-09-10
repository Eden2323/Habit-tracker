import type { DateKey } from './types'

/** Total days in the challenge. */
export const CHALLENGE_LENGTH = 75

/**
 * Format a Date as a local-timezone `YYYY-MM-DD` key.
 *
 * `toISOString()` is deliberately avoided: it converts to UTC, so anyone west
 * of Greenwich would flip to "tomorrow" in the evening and lose a day.
 */
export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a `YYYY-MM-DD` key into a Date at local midnight. */
export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Today, as a local date key. */
export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

/** Shift a date key by `days` (negative goes back). */
export function addDays(key: DateKey, days: number): DateKey {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Whole days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const a = fromDateKey(from)
  const b = fromDateKey(to)
  // Normalising to UTC noon sidesteps DST transitions, which would otherwise
  // make some spans 23 or 25 hours and round to the wrong number of days.
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / 86_400_000)
}

/** 1-based challenge day number for a date (day 1 is the start date). */
export function dayNumber(startDate: DateKey, date: DateKey): number {
  return daysBetween(startDate, date) + 1
}

/** The date key for a 1-based challenge day number. */
export function dateForDay(startDate: DateKey, day: number): DateKey {
  return addDays(startDate, day - 1)
}

/** True when `key` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidDateKey(key: unknown): key is DateKey {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const d = fromDateKey(key)
  return !Number.isNaN(d.getTime()) && toDateKey(d) === key
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** e.g. "Tue 9 Sep". */
export function formatShort(key: DateKey): string {
  const d = fromDateKey(key)
  return `${WEEKDAYS[d.getDay()]?.slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** e.g. "Tuesday, 9 September 2026". */
export function formatLong(key: DateKey): string {
  const d = fromDateKey(key)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Milliseconds until the next local midnight — used to roll the day over. */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}
