import { useEffect, useMemo, useRef, useState, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'
import { dayNumber, formatLong, formatShort } from '../../lib/date'
import { photoDays } from '../../lib/selectors'
import { useStore } from '../../lib/store'
import { Card, EmptyState, Segmented } from '../ui'
import { CompareSlider, type ComparePhoto } from './CompareSlider'
import { usePhoto } from './usePhoto'
import './photos.css'

type Mode = 'timeline' | 'compare'

/**
 * True once the element has been near the viewport. Tiles only ask for their
 * blob after that, so scrolling to day 12 never materialises 75 object URLs.
 */
function useInView(ref: RefObject<Element>): boolean {
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (inView) return undefined
    const element = ref.current
    if (!element) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '250px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, inView])

  return inView
}

function pendingClass(inView: boolean, loading: boolean): string {
  if (!inView) return 'ph-tile__placeholder'
  return loading ? 'ph-tile__skeleton' : 'ph-tile__missing'
}

function PhotoTile({ photo, onOpen }: { photo: ComparePhoto; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const inView = useInView(ref)
  const { url, loading } = usePhoto(inView ? photo.photoId : undefined)

  return (
    <li>
      <button
        ref={ref}
        type="button"
        className="ph-tile"
        onClick={onOpen}
        aria-label={`Open photo from day ${photo.day}, ${formatShort(photo.date)}`}
      >
        <span className="ph-tile__frame">
          {url ? (
            <img className="ph-tile__img" src={url} alt="" loading="lazy" />
          ) : (
            // Only the tile actually being fetched shimmers; a screenful of
            // animated placeholders is a lot of compositing for nothing.
            <span className={pendingClass(inView, loading)} aria-hidden="true">
              {inView && !loading ? '📷' : ''}
            </span>
          )}
        </span>
        <span className="ph-tile__meta">
          <span className="ph-tile__day tabular">Day {photo.day}</span>
          <span className="ph-tile__date">{formatShort(photo.date)}</span>
        </span>
      </button>
    </li>
  )
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: ComparePhoto[]
  index: number
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const photo = photos[index]
  const { url, loading } = usePhoto(photo?.photoId)
  const panelRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const count = photos.length

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        onIndex(index - 1)
        return
      }
      if (event.key === 'ArrowRight' && index < count - 1) {
        event.preventDefault()
        onIndex(index + 1)
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [index, count, onIndex, onClose])

  function onTouchEnd(event: ReactTouchEvent) {
    const start = touchStart.current
    const end = event.changedTouches[0]
    touchStart.current = null
    if (!start || !end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return
    const next = dx < 0 ? index + 1 : index - 1
    if (next >= 0 && next < count) onIndex(next)
  }

  if (!photo) return null

  return (
    <div
      className="ph-lb"
      role="dialog"
      aria-modal="true"
      aria-label={`Progress photo, day ${photo.day}`}
      tabIndex={-1}
      ref={panelRef}
    >
      <div className="ph-lb__bar">
        <div className="ph-lb__title">
          <p className="ph-lb__day tabular">Day {photo.day}</p>
          <p className="ph-lb__date">{formatLong(photo.date)}</p>
        </div>
        <button type="button" className="ph-lb__close" onClick={onClose} aria-label="Close photo">
          ×
        </button>
      </div>

      <div
        className="ph-lb__stage"
        onTouchStart={(event) => {
          const touch = event.changedTouches[0]
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        }}
        onTouchEnd={onTouchEnd}
      >
        {url ? (
          <img className="ph-lb__img" src={url} alt={`Progress photo from day ${photo.day}, ${formatLong(photo.date)}`} />
        ) : (
          <p className="ph-lb__fallback">{loading ? 'Loading photo…' : 'This photo is no longer on the device.'}</p>
        )}
      </div>

      <div className="ph-lb__nav">
        <button
          type="button"
          className="ph-lb__step"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous photo"
        >
          ‹
        </button>
        <p className="ph-lb__count tabular" aria-live="polite">
          {index + 1} of {count}
        </p>
        <button
          type="button"
          className="ph-lb__step"
          onClick={() => onIndex(index + 1)}
          disabled={index >= count - 1}
          aria-label="Next photo"
        >
          ›
        </button>
      </div>
    </div>
  )
}

export default function PhotosView() {
  const { state } = useStore()
  const attempt = state.current
  const [mode, setMode] = useState<Mode>('timeline')
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const photos = useMemo<ComparePhoto[]>(() => {
    const out: ComparePhoto[] = []
    for (const day of photoDays(attempt)) {
      if (!day.photoId) continue
      out.push({ date: day.date, photoId: day.photoId, day: dayNumber(attempt.startDate, day.date) })
    }
    return out
  }, [attempt])

  // A deleted photo must not leave the lightbox pointing past the end.
  const lightboxIndex = openIndex !== null && openIndex < photos.length ? openIndex : null

  return (
    <div className="ph-view">
      <header className="ph-view__head">
        <div>
          <h2 className="ph-view__title">Progress photos</h2>
          <p className="ph-view__count tabular">
            {photos.length === 1 ? '1 day captured' : `${photos.length} days captured`}
          </p>
        </div>
        {photos.length > 0 ? (
          <Segmented
            value={mode}
            options={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'compare', label: 'Compare' },
            ]}
            onChange={setMode}
            label="Photo view"
          />
        ) : null}
      </header>

      {photos.length === 0 ? (
        <Card>
          <EmptyState
            icon="📸"
            title="No photos yet"
            body="Take today's progress photo from the checklist. Same spot, same light, and day 75 will be worth seeing."
          />
        </Card>
      ) : mode === 'compare' ? (
        <Card>
          <CompareSlider photos={photos} />
        </Card>
      ) : (
        <ul className="ph-grid">
          {photos.map((photo, index) => (
            <PhotoTile key={photo.date} photo={photo} onOpen={() => setOpenIndex(index)} />
          ))}
        </ul>
      )}

      <p className="ph-privacy">Photos are stored on this device only — they are never uploaded anywhere.</p>

      {lightboxIndex !== null ? (
        <Lightbox photos={photos} index={lightboxIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </div>
  )
}
