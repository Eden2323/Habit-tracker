/**
 * Progress-photo storage.
 *
 * Photos are stored as Blobs in IndexedDB rather than base64 in localStorage:
 * 75 phone photos would blow through the ~5MB localStorage budget within a
 * week. Every photo is downscaled and re-encoded before it is saved.
 */

const DB_NAME = 'hard75-photos'
const DB_VERSION = 1
const STORE = 'photos'

/** Longest edge, in pixels, that a stored photo is scaled down to. */
export const MAX_PHOTO_EDGE = 1280
export const PHOTO_QUALITY = 0.82

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open photo database'))
  }).catch((err: unknown) => {
    // Let a later call retry rather than caching the failure forever.
    dbPromise = null
    throw err
  })
  dbPromise = pending
  return pending
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Photo storage request failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Photo storage transaction aborted'))
  })
}

export async function putPhoto(id: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, id) as IDBRequest<IDBValidKey>)
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const value = await withStore<unknown>('readonly', (store) => store.get(id) as IDBRequest<unknown>)
  return value instanceof Blob ? value : null
}

export async function deletePhoto(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

export async function listPhotoIds(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>)
  return keys.map(String)
}

/** Remove photos no longer referenced by any day, e.g. after an import. */
export async function pruneOrphans(keepIds: Iterable<string>): Promise<number> {
  const keep = new Set(keepIds)
  const all = await listPhotoIds()
  let removed = 0
  for (const id of all) {
    if (!keep.has(id)) {
      await deletePhoto(id)
      removed += 1
    }
  }
  return removed
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

/**
 * Downscale to `MAX_PHOTO_EDGE` on the longest side and re-encode as JPEG.
 * A 12MP phone photo (~4MB) comes back around 150–300KB.
 */
export async function compressImage(file: Blob, maxEdge = MAX_PHOTO_EDGE): Promise<Blob> {
  try {
    const dataUrl = await readAsDataUrl(file)
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', PHOTO_QUALITY)
    })
    return blob ?? file
  } catch {
    // Better to store the original than to lose the photo entirely.
    return file
  }
}

/** Compress and store a picked file; returns the id to save on the day record. */
export async function savePhotoForDay(dateKey: string, file: Blob): Promise<string> {
  const id = `photo_${dateKey}`
  const compressed = await compressImage(file)
  await putPhoto(id, compressed)
  return id
}

/** Blob → data URL, used for export and for the compare view. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return readAsDataUrl(blob)
}

/** data URL → Blob, used when importing a backup. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header = '', body = ''] = dataUrl.split(',')
  const mimeMatch = /data:([^;]+)/.exec(header)
  const mime = mimeMatch?.[1] ?? 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
