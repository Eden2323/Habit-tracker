import { useId, useState } from 'react'
import { CHALLENGE_LENGTH, dateForDay } from '../lib/date'
import { activeTasks, firstMissedDay, isChallengeComplete, missedTaskLabels, summarise } from '../lib/selectors'
import { useStore } from '../lib/store'
import { Button, Modal } from './ui'
import './restart-banner.css'

/**
 * The one place the app is allowed to bring up starting over.
 *
 * It never resets anything on its own — a missed day only ever produces a
 * prompt, and the reset needs two deliberate taps. "Not yet" puts it away for
 * the rest of the day so the app is still usable while the user decides.
 */
export function RestartBanner() {
  const { state, dispatch, today } = useStore()
  const attempt = state.current
  const uid = useId().replace(/:/g, '')
  const [confirming, setConfirming] = useState<'restart' | 'archive' | null>(null)

  // With every rule switched off no day can ever be complete, so the prompt
  // would fire on an empty challenge. Say nothing instead.
  const hasRules = activeTasks(attempt).length > 0
  const finished = hasRules && isChallengeComplete(attempt)
  const missedDay = hasRules ? firstMissedDay(attempt, today) : null
  // firstMissedDay only looks at days that are fully behind us; this keeps that
  // promise checkable at the call site — today is never a failure.
  const missed = missedDay !== null && dateForDay(attempt.startDate, missedDay) < today ? missedDay : null

  if (!finished && missed === null) return null

  const snoozed = state.settings.restartPromptSnoozedFor === today
  const missedLabels = missed !== null ? missedTaskLabels(attempt, missed) : []

  function snooze() {
    dispatch({ type: 'setSettings', settings: { restartPromptSnoozedFor: today } })
  }

  function restart() {
    if (missed === null) return
    setConfirming(null)
    dispatch({
      type: 'restart',
      reason: 'failed',
      failedOnDay: missed,
      failedTasks: missedLabels,
      startDate: today,
    })
  }

  function archive() {
    setConfirming(null)
    dispatch({ type: 'restart', reason: 'completed', startDate: today })
  }

  const titleId = `${uid}-rb-title`

  return (
    <div className="rb-wrap">
      {snoozed ? (
        <div className="rb-chip">
          <p className="rb-chip__text">
            {finished ? `${CHALLENGE_LENGTH} days done — archive whenever you are ready.` : 'You have an incomplete day.'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="rb-chip__action"
            onClick={() => setConfirming(finished ? 'archive' : 'restart')}
          >
            {finished ? 'Archive' : 'Restart'}
          </Button>
        </div>
      ) : (
        <section className={finished ? 'rb-banner rb-banner--done' : 'rb-banner'} aria-labelledby={titleId}>
          <h2 className="rb-title" id={titleId}>
            {finished ? `${CHALLENGE_LENGTH} days. Every single one of them.` : `Day ${missed} was incomplete — 75 Hard says start over.`}
          </h2>

          {finished ? (
            <p className="rb-body">
              You finished the whole thing. Archive this run to keep it in your record and begin a fresh Day 1, or leave
              it here and keep looking through it.
            </p>
          ) : (
            <p className="rb-body">
              Missed that day:{' '}
              {missedLabels.length > 0 ? (
                missedLabels.map((label) => (
                  <span key={label} className="rb-tag">
                    {label}
                  </span>
                ))
              ) : (
                <span className="rb-tag">nothing was logged</span>
              )}
            </p>
          )}

          <div className="rb-actions">
            {finished ? (
              <>
                <Button variant="primary" onClick={() => setConfirming('archive')}>
                  Archive and start fresh
                </Button>
                <Button variant="ghost" onClick={snooze}>
                  Keep browsing
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" onClick={() => setConfirming('restart')}>
                  Restart at Day 1
                </Button>
                <Button variant="ghost" onClick={snooze}>
                  Not yet
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {confirming === 'restart' && missed !== null ? (
        <Modal open onClose={() => setConfirming(null)} title="Start over at Day 1?" labelledBy={`${uid}-rb-restart`}>
          <ul className="rb-confirm">
            <li>
              <strong>Kept:</strong> this attempt is archived to Previous attempts — Day {missed - 1} reached,{' '}
              {summarise(attempt, today).daysComplete} of {CHALLENGE_LENGTH} days complete. Every photo, note and number
              stays where it is.
            </li>
            <li>
              <strong>Reset:</strong> the counter. Today becomes Day 1 and the board starts empty again.
            </li>
            <li>
              <strong>Carried over:</strong> your rules and macro targets, exactly as they are now.
            </li>
          </ul>
          <div className="modal__actions">
            <Button onClick={() => setConfirming(null)}>Keep this attempt</Button>
            <Button variant="danger" onClick={restart}>
              Restart at Day 1
            </Button>
          </div>
        </Modal>
      ) : null}

      {confirming === 'archive' ? (
        <Modal open onClose={() => setConfirming(null)} title="Archive this challenge?" labelledBy={`${uid}-rb-archive`}>
          <ul className="rb-confirm">
            <li>
              <strong>Kept:</strong> all {CHALLENGE_LENGTH} days move to Previous attempts, marked finished, with the
              photos and notes intact.
            </li>
            <li>
              <strong>New:</strong> today becomes Day 1 of a fresh challenge, on the same rules.
            </li>
          </ul>
          <div className="modal__actions">
            <Button onClick={() => setConfirming(null)}>Not yet</Button>
            <Button variant="primary" onClick={archive}>
              Archive and start fresh
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
