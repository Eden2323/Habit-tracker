import { useMemo, type CSSProperties } from 'react'
import { CHALLENGE_LENGTH, dateForDay, formatLong } from '../../lib/date'
import { dayCompletion, dayState, type DayState } from '../../lib/selectors'
import type { Attempt, DateKey } from '../../lib/types'
import { Card } from '../ui'
import './progress.css'

interface Cell {
  day: number
  date: DateKey
  state: DayState
  done: number
  total: number
  isToday: boolean
}

const LEGEND: { state: DayState; label: string }[] = [
  { state: 'complete', label: 'Complete' },
  { state: 'partial', label: 'Partial' },
  { state: 'missed', label: 'Missed' },
  { state: 'today', label: 'Today' },
  { state: 'future', label: 'To come' },
]

function cellLabel(cell: Cell): string {
  const when = formatLong(cell.date)
  if (cell.state === 'future') return `Day ${cell.day}, upcoming, ${when}`
  const counts = `${cell.done} of ${cell.total} tasks done`
  if (cell.state === 'complete') return `Day ${cell.day} complete, ${counts}, ${when}`
  if (cell.state === 'missed') return `Day ${cell.day} missed, ${counts}, ${when}`
  if (cell.isToday) return `Day ${cell.day}, today, ${counts}, ${when}`
  return `Day ${cell.day}, ${counts}, ${when}`
}

export function DayGrid({
  attempt,
  today,
  onSelectDate,
}: {
  attempt: Attempt
  today: DateKey
  onSelectDate: (date: DateKey) => void
}) {
  const cells = useMemo<Cell[]>(
    () =>
      Array.from({ length: CHALLENGE_LENGTH }, (_, i) => {
        const day = i + 1
        const date = dateForDay(attempt.startDate, day)
        const { done, total } = dayCompletion(attempt, date)
        return { day, date, state: dayState(attempt, day, today), done, total, isToday: date === today }
      }),
    [attempt, today],
  )

  const tally: Record<DayState, number> = { complete: 0, partial: 0, missed: 0, today: 0, future: 0 }
  for (const cell of cells) tally[cell.state] += 1

  const caption = [
    `${tally.complete} complete`,
    tally.partial > 0 ? `${tally.partial} partial` : '',
    tally.missed > 0 ? `${tally.missed} missed` : '',
    `${tally.future} to come`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card title="The board">
      <p className="pg-board__caption tabular" aria-live="polite">
        {caption}
      </p>

      <div className="pg-grid" role="group" aria-label={`All ${CHALLENGE_LENGTH} days`}>
        {cells.map((cell) => {
          const fill = cell.total > 0 ? Math.round((cell.done / cell.total) * 100) : 0
          const classes = ['pg-cell', `pg-cell--${cell.state}`, cell.isToday ? 'pg-cell--now' : '']
          return (
            <button
              key={cell.day}
              type="button"
              className={classes.filter(Boolean).join(' ')}
              style={{ '--pg-fill': `${fill}%` } as CSSProperties}
              aria-label={cellLabel(cell)}
              aria-current={cell.isToday ? 'date' : undefined}
              onClick={() => onSelectDate(cell.date)}
            >
              <span className="pg-cell__num tabular" aria-hidden="true">
                {cell.day}
              </span>
            </button>
          )
        })}
      </div>

      <ul className="pg-legend">
        {LEGEND.map((item) => (
          <li key={item.state} className="pg-legend__item">
            <span className={`pg-swatch pg-swatch--${item.state}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
    </Card>
  )
}
