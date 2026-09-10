import { useId, type CSSProperties } from 'react'
import { CHALLENGE_LENGTH, dateForDay, dayNumber } from '../../lib/date'
import { activeTasks, getDay, isDayComplete } from '../../lib/selectors'
import type { Attempt, DateKey, TaskDef } from '../../lib/types'
import { taskColor } from '../ui'
import './progress.css'

const fmt = (n: number) => Math.round(n).toLocaleString()
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export interface DayPoint {
  day: number
  date: DateKey
  complete: boolean
  water: number
  pages: number
  minutes: number
}

/** One point per elapsed day of the attempt, oldest first. */
export function dayPoints(attempt: Attempt, today: DateKey): DayPoint[] {
  const elapsed = Math.max(0, Math.min(dayNumber(attempt.startDate, today), CHALLENGE_LENGTH))
  const points: DayPoint[] = []
  for (let day = 1; day <= elapsed; day += 1) {
    const date = dateForDay(attempt.startDate, day)
    const record = getDay(attempt, date)
    points.push({
      day,
      date,
      complete: isDayComplete(attempt, date),
      water: record.water,
      pages: record.reading.pages,
      minutes: record.workout.minutes,
    })
  }
  return points
}

/* --- Cumulative completion ----------------------------------------------- */

const W = 340
const H = 180
const PAD = { top: 14, right: 10, bottom: 28, left: 32 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

/** The x axis always spans the whole challenge, so the line grows into it. */
const xFor = (day: number) => PAD.left + ((day - 1) / (CHALLENGE_LENGTH - 1)) * PLOT_W
const yFor = (value: number) => PAD.top + (1 - value / CHALLENGE_LENGTH) * PLOT_H

const Y_TICKS = [0, 25, 50, CHALLENGE_LENGTH]

export function CompletionCurve({ points, today }: { points: DayPoint[]; today: DateKey }) {
  const uid = useId().replace(/:/g, '')
  const titleId = `pg-curve-title-${uid}`
  const descId = `pg-curve-desc-${uid}`

  let running = 0
  const curve = points.map((point) => {
    if (point.complete) running += 1
    return { day: point.day, value: running }
  })

  const first = curve[0]
  const last = curve[curve.length - 1]
  if (!first || !last) {
    return <p className="pg-empty">The pace chart fills in from day one.</p>
  }

  const complete = last.value
  // Only days that are over can be behind pace. Counting an unfinished today as
  // a shortfall would tell a flawless run it is a day down every morning — the
  // same reason `currentStreak` refuses to break on an in-progress today.
  const settled = points.filter((p) => p.date < today).length
  const behind = Math.max(0, settled - complete)
  const pace = behind === 0 ? 'exactly on pace' : `${plural(behind, 'day')} behind pace`

  const line = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.day).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(' ')
  const base = yFor(0).toFixed(1)
  const area = `${line} L${xFor(last.day).toFixed(1)} ${base} L${xFor(first.day).toFixed(1)} ${base} Z`

  return (
    <div className="pg-chart">
      <svg
        className="pg-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Days complete against the ideal pace</title>
        <desc id={descId}>
          {complete} of the {plural(points.length, 'day')} elapsed are complete, {pace}.
        </desc>

        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line className="pg-grid-line" x1={PAD.left} x2={W - PAD.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="pg-tick" x={PAD.left - 7} y={yFor(tick) + 3.6} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        <path className="pg-pace" d={`M${xFor(1)} ${yFor(1)} L${xFor(CHALLENGE_LENGTH)} ${yFor(CHALLENGE_LENGTH)}`} />
        <path className="pg-area" d={area} />
        <path className="pg-line" d={line} />
        {/* The dot carries a one-day attempt on its own, where a line has nothing to draw. */}
        <circle className="pg-dot" cx={xFor(last.day)} cy={yFor(last.value)} r={4} />

        <text className="pg-tick" x={PAD.left} y={H - 8}>
          Day 1
        </text>
        <text className="pg-tick" x={W - PAD.right} y={H - 8} textAnchor="end">
          Day {CHALLENGE_LENGTH}
        </text>
      </svg>

      <p className="pg-caption tabular" aria-live="polite">
        {complete} of {plural(points.length, 'day')} complete · {pace}
      </p>

      <ul className="pg-key">
        <li className="pg-key__item">
          <span className="pg-key__swatch" aria-hidden="true" /> Days banked
        </li>
        <li className="pg-key__item">
          <span className="pg-key__swatch pg-key__swatch--pace" aria-hidden="true" /> One a day
        </li>
      </ul>
    </div>
  )
}

/* --- Small multiples ------------------------------------------------------ */

type MetricKind = 'water' | 'reading' | 'workout'
type MetricTask = TaskDef & { kind: MetricKind }

const METRICS: Record<MetricKind, { noun: string; unit: string; fallbackTarget: number }> = {
  water: { noun: 'Water', unit: 'ml', fallbackTarget: 2000 },
  reading: { noun: 'Reading', unit: 'pages', fallbackTarget: 10 },
  workout: { noun: 'Workout', unit: 'min', fallbackTarget: 45 },
}

const isMetricTask = (task: TaskDef): task is MetricTask =>
  task.kind === 'water' || task.kind === 'reading' || task.kind === 'workout'

function metricValue(kind: MetricKind, point: DayPoint): number {
  switch (kind) {
    case 'water':
      return point.water
    case 'reading':
      return point.pages
    case 'workout':
      return point.minutes
  }
}

const SPARK_W = 300
const SPARK_H = 44
const SLOT = SPARK_W / CHALLENGE_LENGTH

function MetricRow({ task, points }: { task: MetricTask; points: DayPoint[] }) {
  const spec = METRICS[task.kind]
  const values = points.map((point) => metricValue(task.kind, point))
  const target = task.target && task.target > 0 ? task.target : spec.fallbackTarget
  const total = values.reduce((sum, v) => sum + v, 0)
  const average = total / values.length
  const hits = values.filter((v) => v >= target).length
  const peak = Math.max(target, ...values)
  const scale = (value: number) => (value / peak) * (SPARK_H - 4)

  const label = `${spec.noun} per day: ${fmt(average)} ${spec.unit} a day on average, and the ${fmt(target)} ${spec.unit} target was met on ${hits} of ${plural(values.length, 'day')}.`

  return (
    <li className="pg-metric" style={{ '--pg-tint': taskColor(task.kind) } as CSSProperties}>
      <div className="pg-metric__head">
        <span className="pg-metric__name">
          <span aria-hidden="true">{task.icon}</span>
          {spec.noun}
        </span>
        <span className="pg-metric__value tabular">
          {fmt(average)}
          <span className="pg-metric__unit">{spec.unit} / day</span>
        </span>
      </div>

      {total === 0 ? (
        <p className="pg-empty">Nothing logged yet.</p>
      ) : (
        <svg
          className="pg-spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          /* Bars stretch sideways to fill the card; the fixed height pins the
             vertical scale at 1, so nothing is squashed. */
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          {values.map((value, i) => {
            if (value <= 0) return null
            const height = Math.max(scale(value), 1.4)
            return (
              <rect
                key={i}
                className={value >= target ? 'pg-spark__bar pg-spark__bar--hit' : 'pg-spark__bar'}
                x={i * SLOT + 0.6}
                y={SPARK_H - height}
                width={SLOT - 1.2}
                height={height}
              />
            )
          })}
          <line className="pg-spark__target" x1={0} x2={SPARK_W} y1={SPARK_H - scale(target)} y2={SPARK_H - scale(target)} />
          <line className="pg-spark__base" x1={0} x2={SPARK_W} y1={SPARK_H - 0.5} y2={SPARK_H - 0.5} />
        </svg>
      )}

      <p className="pg-metric__foot tabular">
        Target {fmt(target)} {spec.unit} · met on {hits} of {plural(values.length, 'day')}
      </p>
    </li>
  )
}

export function MetricStrip({ attempt, points }: { attempt: Attempt; points: DayPoint[] }) {
  const tasks = activeTasks(attempt).filter(isMetricTask)
  if (points.length === 0) return <p className="pg-empty">Daily volumes appear once the attempt is under way.</p>
  if (tasks.length === 0) return <p className="pg-empty">No measured rules are switched on.</p>
  return (
    <ul className="pg-metrics">
      {tasks.map((task) => (
        <MetricRow key={task.id} task={task} points={points} />
      ))}
    </ul>
  )
}
