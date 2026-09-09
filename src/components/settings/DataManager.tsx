import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { buildBackup, countDays, exportBackup, parseBackup, photoIdsIn, restorePhotos, type ParsedBackup } from '../../lib/backup'
import { formatLong, isValidDateKey, toDateKey } from '../../lib/date'
import { useStore } from '../../lib/store'
import { Button, Card, Modal, useToast } from '../ui'
import './data.css'

/**
 * Past this a clipboard write either silently truncates or hangs the tab, and
 * a backup with photos in it passes the line after a couple of weeks.
 */
const MAX_CLIPBOARD_BYTES = 1_500_000

type Busy = 'export' | 'copy' | 'restore' | null

function formatSize(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024))
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toLocaleString()} KB`
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`

/** The export timestamp is UTC; the user thinks in the day they were standing in. */
function exportedOn(iso: string | null): string | null {
  if (!iso) return null
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return isValidDateKey(iso) ? formatLong(iso) : null
  return formatLong(toDateKey(when))
}

export function DataManager() {
  const { state, dispatch, today, persisted } = useStore()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  const uid = useId().replace(/:/g, '')

  const [busy, setBusy] = useState<Busy>(null)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<ParsedBackup | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const footprint = useMemo(
    () => ({
      days: countDays(state),
      photos: photoIdsIn(state).length,
      bytes: JSON.stringify(state).length,
    }),
    [state],
  )

  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard)

  /** The toast already announces itself; this only narrates the wait. */
  function done(message: string) {
    setStatus('')
    toast(message)
  }

  async function download() {
    setBusy('export')
    setStatus('Building your backup…')
    try {
      const blob = await exportBackup(state)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `75hard-backup-${today}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoking in the same tick cancels the download in Safari; the file has
      // long since been handed off by the time this fires.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      if (alive.current) done(`Backup saved — ${plural(footprint.days, 'day')}, ${plural(footprint.photos, 'photo')}`)
    } catch {
      if (alive.current) {
        setStatus('')
        toast('Could not build the backup. Try again with the app in the foreground.', 'error')
      }
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  async function copyToClipboard() {
    setBusy('copy')
    setStatus('Building your backup…')
    try {
      const text = JSON.stringify(await buildBackup(state))
      if (text.length > MAX_CLIPBOARD_BYTES) {
        setStatus('')
        toast(`This backup is ${formatSize(text.length)} — too big to paste. Use Download instead.`, 'error')
        return
      }
      await navigator.clipboard.writeText(text)
      if (alive.current) done('Backup copied — paste it somewhere safe')
    } catch {
      if (alive.current) {
        setStatus('')
        toast('This browser would not give the app clipboard access.', 'error')
      }
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the value lets the same file be picked again after a failure.
    event.target.value = ''
    if (!file) return

    setBusy('restore')
    setStatus('Reading that file…')
    try {
      const parsed = await parseBackup(file)
      if (!alive.current) return
      setPending(parsed)
      setStatus('')
    } catch (err) {
      if (alive.current) {
        setStatus('')
        toast(err instanceof Error ? err.message : 'That file could not be read.', 'error')
      }
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  async function confirmRestore() {
    if (!pending) return
    const incoming = pending
    setPending(null)
    setBusy('restore')
    setStatus('Restoring…')
    try {
      const { restored, missing } = await restorePhotos(incoming.state, incoming.photos)
      dispatch({ type: 'replaceState', state: incoming.state })
      const tail = missing > 0 ? ` — ${plural(missing, 'photo')} were not in the file` : ''
      if (alive.current) done(`Restored ${plural(countDays(incoming.state), 'day')} and ${plural(restored, 'photo')}${tail}`)
    } catch {
      if (alive.current) {
        setStatus('')
        toast('The restore did not finish. Your current data has been left alone.', 'error')
      }
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  const incomingDays = pending ? countDays(pending.state) : 0
  const incomingPhotos = pending ? photoIdsIn(pending.state).filter((id) => pending.photos[id]).length : 0
  const exportedLabel = exportedOn(pending?.exportedAt ?? null)

  return (
    <Card title="Your data">
      {!persisted ? (
        <p className="dm-alert" role="alert">
          <strong>This browser is not saving your progress.</strong> Private browsing, a full disk or a locked-down
          setting will do this — anything you log now disappears when the tab closes. Download a backup before you carry
          on.
        </p>
      ) : null}

      <p className="dm-lede">
        Everything lives on this phone and nowhere else. A backup is one file with your days, your rules and your photos
        in it — enough to rebuild the whole challenge on a new device.
      </p>

      <dl className="dm-stats">
        <div className="dm-stat">
          <dt className="dm-stat__label">Days recorded</dt>
          <dd className="dm-stat__value tabular">{footprint.days.toLocaleString()}</dd>
        </div>
        <div className="dm-stat">
          <dt className="dm-stat__label">Photos</dt>
          <dd className="dm-stat__value tabular">{footprint.photos.toLocaleString()}</dd>
        </div>
        <div className="dm-stat">
          <dt className="dm-stat__label">Stored text</dt>
          <dd className="dm-stat__value tabular">{formatSize(footprint.bytes)}</dd>
        </div>
      </dl>
      <p className="dm-hint">
        The browser gives this app roughly 5 MB for text. Photos are kept separately and do not count against it.
      </p>

      <div className="dm-actions">
        <Button variant="primary" block onClick={download} disabled={busy !== null}>
          {busy === 'export' ? 'Preparing…' : 'Download backup'}
        </Button>
        <Button block onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          Restore from backup
        </Button>
        {canCopy ? (
          <Button variant="ghost" block onClick={copyToClipboard} disabled={busy !== null}>
            {busy === 'copy' ? 'Preparing…' : 'Copy backup to clipboard'}
          </Button>
        ) : null}
      </div>
      <p className="dm-hint">
        Copying to the clipboard is there for browsers that block downloads — small backups only, and it needs a secure
        connection.
      </p>

      <input
        ref={fileInput}
        className="dm-file"
        type="file"
        accept="application/json,.json"
        onChange={onPick}
        aria-label="Choose a backup file to restore"
      />
      <p className="visually-hidden" aria-live="polite">
        {status}
      </p>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Replace everything with this backup?"
        labelledBy={`${uid}-restore-title`}
      >
        <p className="dm-confirm__lede">
          This does not merge. Everything currently on this device is thrown away and the backup takes its place.
        </p>
        <ul className="dm-confirm__list">
          <li>
            <strong>Goes:</strong> your current attempt ({plural(Object.keys(state.current.days).length, 'day')}{' '}
            logged){state.history.length > 0 ? `, ${plural(state.history.length, 'archived attempt')}` : ''} and your
            rules.
          </li>
          <li>
            <strong>Arrives:</strong> {plural(incomingDays, 'day')} and {plural(incomingPhotos, 'photo')} from the file.
          </li>
          <li>
            <strong>Stays:</strong> photo files already on this device are left alone, so a day the backup could not
            carry may still find its picture.
          </li>
        </ul>
        <p className="dm-confirm__meta">
          {exportedLabel ? `Backed up ${exportedLabel}` : 'This file does not say when it was made.'}
        </p>
        <div className="modal__actions">
          <Button onClick={() => setPending(null)}>Keep what I have</Button>
          <Button variant="danger" onClick={confirmRestore}>
            Replace my data
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
