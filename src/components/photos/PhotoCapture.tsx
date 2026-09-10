import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { formatShort } from '../../lib/date'
import { deletePhoto, savePhotoForDay } from '../../lib/photos'
import { getDay } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import type { DateKey } from '../../lib/types'
import { Button, Modal, useToast } from '../ui'
import { usePhoto } from './usePhoto'
import './photos.css'

/** Phone photos are big; past this it is a video, a RAW file, or a mistake. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

const megabytes = (bytes: number) => Math.max(1, Math.round(bytes / 1024 / 1024))

export function PhotoCapture({ date }: { date: DateKey }) {
  const { state, dispatch, today } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // A replacement reuses the same id, so the loader would otherwise keep
  // showing the old blob. Bumping this forces the re-read.
  const [reload, setReload] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const alive = useRef(true)
  const uid = useId().replace(/:/g, '')

  const photoId = getDay(state.current, date).photoId
  const { url, loading } = usePhoto(photoId, reload)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clearing the value lets the same file be picked again after a failure.
    event.target.value = ''
    if (!file) return

    // Some Android pickers hand over an empty type; only reject a stated non-image.
    if (file.type && !file.type.startsWith('image/')) {
      toast('That is not an image file.', 'error')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast(`That file is ${megabytes(file.size)} MB — 25 MB is the limit.`, 'error')
      return
    }

    setBusy(true)
    try {
      const savedId = await savePhotoForDay(state.current.id, date, file)
      if (!alive.current) return
      dispatch({ type: 'setPhoto', date, photoId: savedId })
      setReload((n) => n + 1)
      toast('Progress photo saved')
    } catch {
      if (alive.current) toast('Could not save that photo — this device may be out of storage.', 'error')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  async function remove() {
    setConfirming(false)
    if (!photoId) return
    try {
      await deletePhoto(photoId)
    } catch {
      // The day is unlinked either way; a stranded blob is swept up by pruneOrphans.
      if (alive.current) toast('Photo removed from the day, but the file could not be deleted.', 'error')
    }
    if (!alive.current) return
    dispatch({ type: 'setPhoto', date })
    setReload((n) => n + 1)
  }

  const inputId = `ph-file-${uid}`
  const pickLabel = photoId ? 'Replace photo' : date === today ? "Take today's photo" : 'Add a photo'

  return (
    <div className="ph-capture">
      {photoId ? (
        <div className="ph-capture__row">
          <span className="ph-thumb">
            {url ? (
              <img className="ph-thumb__img" src={url} alt={`Progress photo for ${formatShort(date)}`} />
            ) : (
              <span className="ph-thumb__fallback" aria-hidden="true">
                {loading ? <span className="ph-spinner" /> : '📷'}
              </span>
            )}
          </span>
          <div className="ph-capture__meta">
            <p className="ph-capture__state">Photo saved</p>
            <p className="ph-capture__hint">
              {url || loading ? 'Stays on this device — nothing is uploaded.' : 'The image file is missing from this device.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="ph-capture__actions">
        <input
          id={inputId}
          className="ph-file"
          type="file"
          accept="image/*"
          // `capture` opens the camera straight away, which is right for today
          // but would block reaching the library for a day already gone by.
          {...(date === today ? { capture: 'environment' as const } : {})}
          disabled={busy}
          onChange={onPick}
        />
        <label className={`btn ${photoId ? 'btn--secondary' : 'btn--primary'} ph-pick`} htmlFor={inputId}>
          {busy ? (
            <>
              <span className="ph-spinner" aria-hidden="true" />
              Saving…
            </>
          ) : (
            pickLabel
          )}
        </label>

        {photoId ? (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Delete
          </Button>
        ) : null}
      </div>

      <p className="ph-status" aria-live="polite">
        {busy ? 'Compressing and saving your photo…' : ''}
      </p>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this photo?"
        labelledBy={`ph-del-title-${uid}`}
      >
        <p className="ph-confirm">
          The progress photo for {formatShort(date)} will be erased from this device. There is no copy anywhere else.
        </p>
        <div className="modal__actions">
          <Button onClick={() => setConfirming(false)}>Keep it</Button>
          <Button variant="danger" onClick={remove}>
            Delete photo
          </Button>
        </div>
      </Modal>
    </div>
  )
}
