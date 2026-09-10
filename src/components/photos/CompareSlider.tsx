import { useId, useState, type CSSProperties } from 'react'
import { formatShort } from '../../lib/date'
import type { DateKey } from '../../lib/types'
import { EmptyState, Field, Segmented } from '../ui'
import { usePhoto } from './usePhoto'
import './photos.css'

/** One day's photo, already resolved to a challenge day number. */
export interface ComparePhoto {
  date: DateKey
  photoId: string
  day: number
}

type Layout = 'wipe' | 'side'

const optionLabel = (photo: ComparePhoto) => `Day ${photo.day} · ${formatShort(photo.date)}`

function Frame({ photo, label }: { photo: ComparePhoto; label: string }) {
  const { url, loading } = usePhoto(photo.photoId)
  return (
    <figure className="ph-frame">
      <div className="ph-stage ph-stage--single">
        {url ? (
          <img className="ph-stage__img" src={url} alt={`Progress photo, ${optionLabel(photo)}`} />
        ) : (
          <span className="ph-stage__placeholder" aria-hidden="true">
            {loading ? <span className="ph-spinner" /> : '📷'}
          </span>
        )}
      </div>
      <figcaption className="ph-frame__caption">
        <span className="ph-frame__role">{label}</span>
        <span className="ph-frame__day tabular">{optionLabel(photo)}</span>
      </figcaption>
    </figure>
  )
}

function Wipe({ before, after }: { before: ComparePhoto; after: ComparePhoto }) {
  const [position, setPosition] = useState(50)
  const beforeImage = usePhoto(before.photoId)
  const afterImage = usePhoto(after.photoId)

  return (
    <div className="ph-wipe">
      <div className="ph-stage" style={{ '--ph-wipe': `${position}%` } as CSSProperties}>
        {beforeImage.url ? (
          <img className="ph-stage__img" src={beforeImage.url} alt={`Before, ${optionLabel(before)}`} />
        ) : (
          <span className="ph-stage__placeholder" aria-hidden="true">
            {beforeImage.loading ? <span className="ph-spinner" /> : '📷'}
          </span>
        )}
        {afterImage.url ? (
          <img
            className="ph-stage__img ph-stage__img--after"
            src={afterImage.url}
            alt={`After, ${optionLabel(after)}`}
          />
        ) : null}

        {/* A real range input gets drag, tap-to-jump, arrow keys and slider
            semantics for free; the visible divider just follows its value. */}
        <input
          className="ph-wipe__input"
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label="Wipe between the two photos"
          aria-valuetext={`${position}% — day ${before.day} on the left, day ${after.day} on the right`}
        />
        <span className="ph-wipe__divider" aria-hidden="true">
          <span className="ph-wipe__knob">‹ ›</span>
        </span>

        <span className="ph-stage__tag ph-stage__tag--left" aria-hidden="true">
          Day {before.day}
        </span>
        <span className="ph-stage__tag ph-stage__tag--right" aria-hidden="true">
          Day {after.day}
        </span>
      </div>

      <p className="ph-wipe__legend">
        Drag the divider, or use the arrow keys. Left is{' '}
        <strong>{optionLabel(before)}</strong>, right is <strong>{optionLabel(after)}</strong>.
      </p>
    </div>
  )
}

export function CompareSlider({ photos }: { photos: ComparePhoto[] }) {
  const uid = useId().replace(/:/g, '')
  const [layout, setLayout] = useState<Layout>('wipe')
  const [beforeDate, setBeforeDate] = useState<DateKey>(() => photos[0]?.date ?? '')
  const [afterDate, setAfterDate] = useState<DateKey>(() => photos[photos.length - 1]?.date ?? '')

  // Fall back to the ends of the range when a chosen photo has since been deleted.
  const before = photos.find((p) => p.date === beforeDate) ?? photos[0]
  const after = photos.find((p) => p.date === afterDate) ?? photos[photos.length - 1]

  if (!before || !after || photos.length < 2) {
    return (
      <EmptyState
        icon="🪞"
        title="Two photos needed"
        body="Once you have a second progress photo you can slide between them here."
      />
    )
  }

  return (
    <div className="ph-compare">
      <div className="ph-compare__picks">
        <Field label="Before" id={`ph-before-${uid}`}>
          <select
            id={`ph-before-${uid}`}
            className="field__select ph-select"
            value={before.date}
            onChange={(event) => setBeforeDate(event.target.value)}
          >
            {photos.map((p) => (
              <option key={p.date} value={p.date}>
                {optionLabel(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="After" id={`ph-after-${uid}`}>
          <select
            id={`ph-after-${uid}`}
            className="field__select ph-select"
            value={after.date}
            onChange={(event) => setAfterDate(event.target.value)}
          >
            {photos.map((p) => (
              <option key={p.date} value={p.date}>
                {optionLabel(p)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="ph-compare__layout">
        <Segmented
          value={layout}
          options={[
            { value: 'wipe', label: 'Wipe' },
            { value: 'side', label: 'Side by side' },
          ]}
          onChange={setLayout}
          label="Comparison layout"
        />
      </div>

      {layout === 'wipe' ? (
        // Keyed so switching photos resets the divider rather than leaving it
        // parked over a shot it was never positioned for.
        <Wipe key={`${before.date}-${after.date}`} before={before} after={after} />
      ) : (
        <div className="ph-compare__pair">
          <Frame photo={before} label="Before" />
          <Frame photo={after} label="After" />
        </div>
      )}
    </div>
  )
}
