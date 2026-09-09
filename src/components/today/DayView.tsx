import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CHALLENGE_LENGTH, dayNumber, formatLong } from '../../lib/date'
import { dayStatuses, getDay, taskStatus } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey, DayRecord, TaskDef, TaskStatus } from '../../lib/types'
import { Button, Card, EmptyState, ProgressRing, taskColor } from '../ui'
import { PhotoCapture } from '../photos/PhotoCapture'
import { MacroTracker } from './MacroTracker'
import { NotesEditor } from './NotesEditor'
import { ReadingLog } from './ReadingLog'
import { WaterTracker } from './WaterTracker'
import { WorkoutTracker } from './WorkoutTracker'
import './day-view.css'

/** Strip a task's manual override, so we can ask what the tracker alone thinks. */
function withoutOverride(day: DayRecord, taskId: string): DayRecord {
  const checks = { ...day.checks }
  delete checks[taskId]
  return { ...day, checks }
}

function Tracker({ date, task }: { date: DateKey; task: TaskDef }) {
  switch (task.kind) {
    case 'water':
      return <WaterTracker date={date} task={task} />
    case 'workout':
      return <WorkoutTracker date={date} task={task} />
    case 'macros':
      return <MacroTracker date={date} task={task} />
    case 'reading':
      return <ReadingLog date={date} task={task} />
    case 'photo':
      return <PhotoCapture date={date} />
    default:
      return null
  }
}

function TaskRow({
  date,
  status,
  day,
  open,
  onToggle,
}: {
  date: DateKey
  status: TaskStatus
  day: DayRecord
  open: boolean
  onToggle: () => void
}) {
  const { dispatch } = useStore()
  const { task, done, progress, detail } = status
  const override = day.checks[task.id]
  const autoDone = taskStatus(task, withoutOverride(day, task.id)).done
  const expandable = task.kind !== 'check'
  const panelId = `dv-panel-${task.id}`

  // Ticking something the tracker already satisfies hands control back to it;
  // disagreeing with the tracker is exactly what the stored override is for.
  const setDone = (next: boolean) => {
    if (next === autoDone) dispatch({ type: 'clearCheck', date, taskId: task.id })
    else dispatch({ type: 'setCheck', date, taskId: task.id, value: next })
  }

  const classes = ['dv-row', done ? 'dv-row--done' : '', open ? 'dv-row--open' : ''].filter(Boolean).join(' ')

  return (
    <li className={classes} style={{ '--dv-tint': taskColor(task.kind) } as CSSProperties}>
      <div className="dv-row__head">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={task.label}
          className="dv-check"
          onClick={() => setDone(!done)}
        >
          <span className="dv-check__box">
            <svg className="dv-check__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 12.5l4.2 4.2L19 7" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="dv-row__main"
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable && open ? panelId : undefined}
          onClick={() => (expandable ? onToggle() : setDone(!done))}
        >
          <span className="dv-row__icon" aria-hidden="true">
            {task.icon}
          </span>
          <span className="dv-row__body">
            <span className="dv-row__label">{task.label}</span>
            <span className="dv-row__detail">
              {/* A plain check has no tracker, so its hint is more use than "Not done". */}
              {task.kind === 'check' && task.hint ? task.hint : detail}
              {override !== undefined ? <span className="dv-badge">manual</span> : null}
            </span>
          </span>
          {expandable ? (
            <svg className="dv-row__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 10l4 4 4-4" />
            </svg>
          ) : null}
        </button>
      </div>

      <div className="dv-bar" aria-hidden="true">
        <span className="dv-bar__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      {expandable && open ? (
        <div className="dv-panel" id={panelId} role="group" aria-label={task.label}>
          {task.hint ? <p className="dv-panel__hint">{task.hint}</p> : null}
          <Tracker date={date} task={task} />
          {override !== undefined ? (
            <div className="dv-override">
              <span>{override ? 'Ticked off by hand' : 'Held open by hand'}</span>
              <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'clearCheck', date, taskId: task.id })}>
                Use tracker
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export default function DayView({ date }: { date: DateKey }) {
  const { state, today } = useStore()
  const attempt = state.current
  const [open, setOpen] = useState<{ date: DateKey; taskId: string } | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  const dayNum = dayNumber(attempt.startDate, date)
  const outside = dayNum < 1 || dayNum > CHALLENGE_LENGTH
  const day = getDay(attempt, date)
  const statuses = dayStatuses(attempt, date)
  const total = statuses.length
  const doneCount = statuses.filter((s) => s.done).length
  const complete = total > 0 && doneCount === total

  // Celebrate only the moment the last task lands — not every render of an
  // already-finished day, and not when navigating onto one.
  const previous = useRef({ date, complete })
  useEffect(() => {
    const justFinished = complete && !previous.current.complete && previous.current.date === date
    previous.current = { date, complete }
    if (!justFinished) return undefined
    setCelebrate(true)
    const timer = setTimeout(() => setCelebrate(false), 1200)
    return () => clearTimeout(timer)
  }, [date, complete])

  if (outside) {
    return (
      <div className="dv">
        <p className="dv-outside__date">{formatLong(date)}</p>
        <Card>
          <EmptyState
            icon="🗓️"
            title="Outside this attempt"
            body={
              dayNum < 1
                ? `This attempt began on ${formatLong(attempt.startDate)}, so there is nothing to track here.`
                : `This attempt runs ${CHALLENGE_LENGTH} days and that would be day ${dayNum}.`
            }
          />
        </Card>
      </div>
    )
  }

  const openId = open && open.date === date ? open.taskId : null
  const toggle = (taskId: string) =>
    setOpen((current) => (current && current.date === date && current.taskId === taskId ? null : { date, taskId }))

  const statusLine =
    total === 0 ? 'No tasks enabled' : complete ? 'Day complete — nice.' : `${doneCount} of ${total} done`

  const heroClasses = ['dv-hero', complete ? 'dv-hero--complete' : '', celebrate ? 'dv-hero--celebrate' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="dv">
      <header className={heroClasses}>
        <ProgressRing
          value={total > 0 ? doneCount / total : 0}
          size={104}
          stroke={9}
          color={complete ? 'var(--success)' : undefined}
        >
          <span className="dv-hero__ring-label" aria-hidden="true">
            {complete ? '✓' : `${doneCount}/${total}`}
          </span>
        </ProgressRing>

        <div className="dv-hero__text">
          <h2 className="dv-hero__day">
            Day <span className="dv-hero__num tabular">{dayNum}</span> of {CHALLENGE_LENGTH}
            {date === today ? <span className="dv-hero__pill">Today</span> : null}
          </h2>
          <p className="dv-hero__date">{formatLong(date)}</p>
          <p className="dv-hero__status" aria-live="polite">
            {statusLine}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <Card>
          <EmptyState
            icon="🎯"
            title="No tasks enabled"
            body="Every rule is switched off. Turn some back on in Settings to start tracking again."
          />
        </Card>
      ) : (
        <ul className="dv-list">
          {statuses.map((status) => (
            <TaskRow
              key={status.task.id}
              date={date}
              status={status}
              day={day}
              open={openId === status.task.id}
              onToggle={() => toggle(status.task.id)}
            />
          ))}
        </ul>
      )}

      <NotesEditor date={date} />
    </div>
  )
}
