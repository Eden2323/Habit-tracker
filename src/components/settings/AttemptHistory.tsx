import { useMemo } from 'react'
import { CHALLENGE_LENGTH, formatShort, toDateKey } from '../../lib/date'
import { summarise } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { Attempt, DateKey } from '../../lib/types'
import { Card, EmptyState } from '../ui'
import './data.css'

const STATUS_LABEL: Record<Attempt['status'], string> = {
  active: 'In progress',
  failed: 'Restarted',
  completed: 'Finished',
  abandoned: 'Archived',
}

/** The day the attempt stopped counting: when it was archived, or its last entry. */
function endDate(attempt: Attempt): DateKey {
  if (attempt.endedAt) {
    const ended = new Date(attempt.endedAt)
    if (!Number.isNaN(ended.getTime())) return toDateKey(ended)
  }
  const logged = Object.keys(attempt.days).sort()
  return logged[logged.length - 1] ?? attempt.startDate
}

/** `failedTasks` holds labels, but tolerate ids so an older file still reads. */
function taskLabel(attempt: Attempt, value: string): string {
  return attempt.tasks.find((t) => t.id === value)?.label ?? value
}

export function AttemptHistory() {
  const { state } = useStore()

  const rows = useMemo(
    () =>
      // Stored oldest first; the last thing that happened is the most useful.
      [...state.history].reverse().map((attempt) => {
        const end = endDate(attempt)
        const stats = summarise(attempt, end)
        // A stumble on day 34 still means 33 days were earned.
        const reached = attempt.failedOnDay ? attempt.failedOnDay - 1 : stats.daysComplete
        return {
          attempt,
          end,
          reached,
          daysComplete: stats.daysComplete,
          longestStreak: stats.longestStreak,
          photoCount: stats.photoCount,
          missed: (attempt.failedTasks ?? []).map((t) => taskLabel(attempt, t)),
        }
      }),
    [state.history],
  )

  if (rows.length === 0) {
    return (
      <Card title="Previous attempts">
        <EmptyState
          icon="🗂️"
          title="Nothing archived yet"
          body="If you ever start over, the attempt you were on is kept here — with how far you got."
        />
      </Card>
    )
  }

  return (
    <Card title="Previous attempts">
      <p className="dm-caption">
        {rows.length === 1 ? 'One run before this one.' : `${rows.length} runs before this one.`} None of it was wasted —
        the days are still counted here.
      </p>

      <ol className="dm-history">
        {rows.map((row) => (
          <li key={row.attempt.id} className="dm-attempt">
            <div className="dm-attempt__head">
              <h3 className="dm-attempt__title">
                {row.attempt.status === 'completed'
                  ? `All ${CHALLENGE_LENGTH} days`
                  : row.reached >= 1
                    ? `Made it to Day ${row.reached}`
                    : 'Reset on day one'}
              </h3>
              <span className={`dm-badge dm-badge--${row.attempt.status}`}>{STATUS_LABEL[row.attempt.status]}</span>
            </div>

            <p className="dm-attempt__range">
              {formatShort(row.attempt.startDate)} → {formatShort(row.end)}
            </p>

            <ul className="dm-facts">
              <li>
                <span className="dm-facts__value tabular">{row.daysComplete}</span> of {CHALLENGE_LENGTH} days complete
              </li>
              <li>
                Best streak <span className="dm-facts__value tabular">{row.longestStreak}</span>
              </li>
              {row.photoCount > 0 ? (
                <li>
                  <span className="dm-facts__value tabular">{row.photoCount}</span>{' '}
                  {row.photoCount === 1 ? 'photo' : 'photos'}
                </li>
              ) : null}
            </ul>

            {row.missed.length > 0 ? (
              <p className="dm-attempt__missed">
                {row.attempt.failedOnDay ? `Day ${row.attempt.failedOnDay} came up short on ` : 'Came up short on '}
                {row.missed.map((label) => (
                  <span key={label} className="dm-chip">
                    {label}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  )
}
