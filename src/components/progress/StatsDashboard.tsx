import { useMemo, type CSSProperties } from 'react'
import { CHALLENGE_LENGTH } from '../../lib/date'
import { summarise, taskConsistency } from '../../lib/selectors'
import type { Attempt, DateKey } from '../../lib/types'
import { Card, EmptyState, ProgressRing, taskColor } from '../ui'
import { CompletionCurve, MetricStrip, dayPoints } from './Charts'
import './progress.css'

const fmt = (n: number) => Math.round(n).toLocaleString()

/** Millilitres read better as litres once the totals run into five figures. */
function formatLitres(ml: number): string {
  const litres = ml / 1000
  return litres >= 10 ? fmt(litres) : (Math.round(litres * 10) / 10).toFixed(1)
}

function formatDuration(minutes: number): string {
  const whole = Math.round(minutes)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

interface Tile {
  label: string
  value: string
  unit?: string
}

export function StatsDashboard({ attempt, today }: { attempt: Attempt; today: DateKey }) {
  const stats = useMemo(() => summarise(attempt, today), [attempt, today])
  const consistency = useMemo(() => taskConsistency(attempt, today), [attempt, today])
  const points = useMemo(() => dayPoints(attempt, today), [attempt, today])

  const percent = Math.round(stats.percentComplete)

  const tiles: Tile[] = [
    { label: 'Current streak', value: fmt(stats.currentStreak), unit: stats.currentStreak === 1 ? 'day' : 'days' },
    { label: 'Longest streak', value: fmt(stats.longestStreak), unit: stats.longestStreak === 1 ? 'day' : 'days' },
    { label: 'Days complete', value: fmt(stats.daysComplete), unit: `of ${CHALLENGE_LENGTH}` },
    { label: 'Days to go', value: fmt(stats.daysRemaining) },
    { label: 'Still to earn', value: fmt(stats.daysToEarn), unit: stats.daysToEarn === 1 ? 'day' : 'days' },
    { label: 'Completion', value: `${percent}`, unit: '%' },
    { label: 'Water drunk', value: formatLitres(stats.totalWaterMl), unit: 'L' },
    { label: 'Pages read', value: fmt(stats.totalPages) },
    { label: 'Training', value: formatDuration(stats.totalWorkoutMinutes) },
    { label: 'Photos', value: fmt(stats.photoCount) },
  ]

  return (
    <>
      <Card title="This attempt">
        <div className="pg-hero">
          <ProgressRing
            value={stats.daysComplete / CHALLENGE_LENGTH}
            size={96}
            stroke={9}
            color={stats.daysComplete === CHALLENGE_LENGTH ? 'var(--success)' : undefined}
          >
            <span className="pg-hero__pct tabular" aria-hidden="true">
              {percent}%
            </span>
          </ProgressRing>
          <div className="pg-hero__text">
            <p className="pg-hero__day">
              Day {stats.dayNumber} of {CHALLENGE_LENGTH}
            </p>
            <p className="pg-hero__line tabular" aria-live="polite">
              {stats.daysComplete} days banked · {stats.daysToEarn} still to earn
            </p>
          </div>
        </div>

        <ul className="pg-tiles">
          {tiles.map((tile) => (
            <li key={tile.label} className="pg-tile">
              {/* Spoken as one phrase; the split-up visual parts would read as "18of 75". */}
              <span className="visually-hidden">
                {tile.label}: {tile.value}
                {tile.unit ? ` ${tile.unit}` : ''}
              </span>
              <span className="pg-tile__value" aria-hidden="true">
                {tile.value}
                {tile.unit ? <span className="pg-tile__unit">{tile.unit}</span> : null}
              </span>
              <span className="pg-tile__label" aria-hidden="true">
                {tile.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Consistency">
        {points.length === 0 || consistency.length === 0 ? (
          <EmptyState
            icon="📊"
            title="Nothing to measure yet"
            body="Once day one is under way, each rule gets its own hit rate here."
          />
        ) : (
          <ul className="pg-bars">
            {consistency.map(({ task, done, elapsed, rate }) => (
              <li key={task.id} className="pg-bar" style={{ '--pg-tint': taskColor(task.kind) } as CSSProperties}>
                <div className="pg-bar__head">
                  <span className="pg-bar__label">
                    <span aria-hidden="true">{task.icon}</span> {task.label}
                  </span>
                  <span className="pg-bar__stat tabular">
                    {done} / {elapsed} days · {Math.round(rate * 100)}%
                  </span>
                </div>
                <div className="pg-bar__track" aria-hidden="true">
                  <span className="pg-bar__fill" style={{ width: `${Math.round(rate * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pace">
        <CompletionCurve points={points} today={today} />
      </Card>

      <Card title="Daily volume">
        <MetricStrip attempt={attempt} points={points} />
      </Card>
    </>
  )
}
