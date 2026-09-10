/**
 * `compressImage` (and therefore `savePhotoForDay`) is deliberately untested:
 * jsdom has no canvas rasteriser and never fires `load` on an <img>, so the
 * compressor would hang rather than fail. Everything either side of it — the
 * IndexedDB store and the data-URL conversions — is covered here.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { blobToDataUrl, dataUrlToBlob, deletePhoto, getPhoto, listPhotoIds, pruneOrphans, putPhoto } from '../lib/photos'

/**
 * jsdom's Blob is a stub with no `text()`/`arrayBuffer()`, and Node's
 * `structuredClone` — which fake-indexeddb uses to store values — flattens it to
 * an empty object, so nothing would ever come back out of the store. The Blob
 * behind `Response` is the spec-complete one a browser would hand IndexedDB, so
 * the storage tests run against that instead.
 */
import { Blob as NodeBlob } from 'node:buffer'

const PlatformBlob = NodeBlob as unknown as typeof Blob

describe('the photo store', () => {
  const jpeg = (text: string) => new PlatformBlob([text], { type: 'image/jpeg' })

  beforeAll(() => {
    // getPhoto brand-checks with `instanceof Blob`, so the global has to match.
    vi.stubGlobal('Blob', PlatformBlob)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(async () => {
    await pruneOrphans([])
  })

  it('round-trips a blob', async () => {
    await putPhoto('photo_2026-01-01', jpeg('first day'))
    const stored = await getPhoto('photo_2026-01-01')

    expect(stored).toBeInstanceOf(PlatformBlob)
    expect(stored?.type).toBe('image/jpeg')
    expect(await stored?.text()).toBe('first day')
  })

  it('replaces a photo stored under an id it already holds', async () => {
    await putPhoto('photo_2026-01-01', jpeg('first take'))
    await putPhoto('photo_2026-01-01', jpeg('second take'))

    expect(await (await getPhoto('photo_2026-01-01'))?.text()).toBe('second take')
    expect(await listPhotoIds()).toEqual(['photo_2026-01-01'])
  })

  it('returns null for an id it does not have', async () => {
    expect(await getPhoto('photo_never-taken')).toBeNull()
  })

  it('deletes a photo, and shrugs at deleting one twice', async () => {
    await putPhoto('photo_2026-01-01', jpeg('first day'))
    await deletePhoto('photo_2026-01-01')
    expect(await getPhoto('photo_2026-01-01')).toBeNull()

    await expect(deletePhoto('photo_2026-01-01')).resolves.toBeUndefined()
  })

  it('lists the ids it holds', async () => {
    await putPhoto('photo_2026-01-02', jpeg('b'))
    await putPhoto('photo_2026-01-01', jpeg('a'))
    expect((await listPhotoIds()).sort()).toEqual(['photo_2026-01-01', 'photo_2026-01-02'])
  })

  describe('pruneOrphans', () => {
    beforeEach(async () => {
      await putPhoto('photo_a', jpeg('a'))
      await putPhoto('photo_b', jpeg('b'))
      await putPhoto('photo_c', jpeg('c'))
    })

    it('deletes exactly the ids nothing references', async () => {
      expect(await pruneOrphans(['photo_a', 'photo_c'])).toBe(1)
      expect((await listPhotoIds()).sort()).toEqual(['photo_a', 'photo_c'])
      expect(await getPhoto('photo_b')).toBeNull()
    })

    it('keeps everything that is still referenced, including ids never stored', async () => {
      expect(await pruneOrphans(['photo_a', 'photo_b', 'photo_c', 'photo_never-stored'])).toBe(0)
      expect((await listPhotoIds()).sort()).toEqual(['photo_a', 'photo_b', 'photo_c'])
    })

    it('empties the store when nothing is referenced', async () => {
      expect(await pruneOrphans([])).toBe(3)
      expect(await listPhotoIds()).toEqual([])
    })
  })
})

describe('data URL conversion', () => {
  // These run on jsdom's Blob, because jsdom's FileReader only accepts its own.
  it('encodes the bytes and mime type of a blob', async () => {
    const original = new Blob([new Uint8Array([0, 1, 2, 254, 255, 128])], { type: 'image/jpeg' })
    expect(await blobToDataUrl(original)).toBe('data:image/jpeg;base64,AAEC/v+A')
  })

  it('round-trips back to the same bytes', async () => {
    const original = new Blob([new Uint8Array([0, 1, 2, 254, 255, 128])], { type: 'image/jpeg' })
    const dataUrl = await blobToDataUrl(original)

    const restored = dataUrlToBlob(dataUrl)
    expect(restored.type).toBe('image/jpeg')
    expect(restored.size).toBe(original.size)
    expect(await blobToDataUrl(restored)).toBe(dataUrl)
  })

  it('preserves a non-jpeg mime type', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const dataUrl = await blobToDataUrl(png)
    expect(dataUrl).toBe('data:image/png;base64,iVBORw==')
    expect(dataUrlToBlob(dataUrl).type).toBe('image/png')
  })

  it('falls back to jpeg when the header carries no mime type', () => {
    expect(dataUrlToBlob('data:;base64,QUJD').type).toBe('image/jpeg')
    expect(dataUrlToBlob('QUJD').type).toBe('image/jpeg')
  })
})
