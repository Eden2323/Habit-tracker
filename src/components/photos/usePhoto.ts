import { useEffect, useState } from 'react'
import { getPhoto } from '../../lib/photos'

/**
 * Load a stored photo as an object URL.
 *
 * Object URLs pin their blob in memory until they are revoked, so every URL
 * this hook hands out is revoked when the id changes or the caller unmounts —
 * 75 leaked photos would be tens of megabytes of nothing.
 *
 * `reloadKey` exists because photo ids are derived from the date: replacing a
 * day's photo reuses the id, so nothing else would tell us the blob changed.
 */
export function usePhoto(photoId: string | undefined, reloadKey = 0): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => Boolean(photoId))

  useEffect(() => {
    if (!photoId) {
      setUrl(null)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setUrl(null)

    getPhoto(photoId)
      .then((blob) => {
        if (cancelled) return
        if (blob) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setUrl(null)
        setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId, reloadKey])

  return { url, loading }
}
