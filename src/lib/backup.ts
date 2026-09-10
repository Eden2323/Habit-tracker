/**
 * Backup and restore.
 *
 * A backup is one self-contained JSON file: the whole AppState plus every photo
 * it references, inlined as a data URL. Photos normally live in IndexedDB and
 * state in localStorage, so nothing short of both is a real backup — and a
 * single file is the only thing a phone can reliably hand to a cloud drive.
 */
import { blobToDataUrl, dataUrlToBlob, getPhoto, putPhoto } from './photos'
import { migrate } from './storage'
import type { AppState } from './types'

export const BACKUP_FORMAT = 'hard75-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  /** ISO timestamp of when the file was written. */
  exportedAt: string
  state: AppState
  /** Photo id → data URL. */
  photos: Record<string, string>
}

export interface ParsedBackup {
  state: AppState
  /** When the file says it was written, or null if it did not say. */
  exportedAt: string | null
  photos: Record<string, string>
}

export interface RestoreResult extends ParsedBackup {
  photosRestored: number
  /** Referenced by a day but absent from the file — that day just loses its picture. */
  photosMissing: number
  days: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every photo id referenced by the current attempt or by history, deduped. */
export function photoIdsIn(state: AppState): string[] {
  const ids = new Set<string>()
  for (const attempt of [state.current, ...state.history]) {
    for (const day of Object.values(attempt.days)) {
      if (day.photoId) ids.add(day.photoId)
    }
  }
  return [...ids]
}

/** Day records stored across every attempt. */
export function countDays(state: AppState): number {
  return [state.current, ...state.history].reduce((total, a) => total + Object.keys(a.days).length, 0)
}

export async function buildBackup(state: AppState): Promise<BackupFile> {
  const photos: Record<string, string> = {}
  // Sequential on purpose: 75 photos decoded in parallel is a lot of base64 to
  // hold at once on a phone, and this runs on an explicit tap either way.
  for (const id of photoIdsIn(state)) {
    try {
      const blob = await getPhoto(id)
      if (blob) photos[id] = await blobToDataUrl(blob)
    } catch {
      // One unreadable photo must not cost the user the other 74 days.
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
    photos,
  }
}

export async function exportBackup(state: AppState): Promise<Blob> {
  const payload = await buildBackup(state)
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

async function readText(file: Blob): Promise<string> {
  // Safari only grew Blob.text() in 14; FileReader still covers older phones.
  if (typeof file.text === 'function') return file.text()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'))
    reader.readAsText(file)
  })
}

/**
 * Validate a backup file and hand back the state it carries. Touches no
 * storage, so a mistaken pick can still be waved off before anything is
 * overwritten.
 */
export async function parseBackup(file: File): Promise<ParsedBackup> {
  const text = await readText(file)

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON. Pick the .json file this app exported.')
  }

  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new Error('That is not a 75 Hard backup. Look for a file named 75hard-backup-….json.')
  }
  if (typeof raw.version === 'number' && raw.version > BACKUP_VERSION) {
    throw new Error('That backup was written by a newer version of the app, so it cannot be read here.')
  }

  const photos: Record<string, string> = {}
  if (isRecord(raw.photos)) {
    for (const [id, value] of Object.entries(raw.photos)) {
      if (typeof value === 'string' && value.startsWith('data:')) photos[id] = value
    }
  }

  return {
    // migrate() never throws and fills every gap, so a hand-edited or older
    // file degrades into a usable state rather than a white screen.
    state: migrate(raw.state),
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    photos,
  }
}

export interface PhotoRestoreResult {
  restored: number
  /** Referenced by the state but not carried in the file. */
  absentFromFile: number
  /** Present in the file but rejected by this device — usually no space left. */
  writeFailed: number
}

/**
 * Write the file's photos back into IndexedDB, keyed by their original ids.
 *
 * The two ways a photo can fail to land are counted separately: they mean very
 * different things to the user. "Not in the backup" says the file is thin;
 * "could not be saved" says this device is out of room, and the backup is still
 * good. Reporting the second as the first would talk someone into deleting a
 * backup that was never at fault.
 */
export async function restorePhotos(
  state: AppState,
  photos: Record<string, string>,
): Promise<PhotoRestoreResult> {
  let restored = 0
  let absentFromFile = 0
  let writeFailed = 0
  for (const id of photoIdsIn(state)) {
    const dataUrl = photos[id]
    if (!dataUrl) {
      absentFromFile += 1
      continue
    }
    try {
      await putPhoto(id, dataUrlToBlob(dataUrl))
      restored += 1
    } catch {
      // A photo that will not decode or store leaves the day picture-less,
      // which is a far smaller loss than abandoning the whole restore.
      writeFailed += 1
    }
  }
  return { restored, absentFromFile, writeFailed }
}

/** Parse, write the photos back, and report what landed. */
export async function restoreBackup(file: File): Promise<RestoreResult> {
  const parsed = await parseBackup(file)
  const { restored, absentFromFile, writeFailed } = await restorePhotos(parsed.state, parsed.photos)
  return {
    ...parsed,
    photosRestored: restored,
    photosMissing: absentFromFile + writeFailed,
    days: countDays(parsed.state),
  }
}

export async function importBackup(file: File): Promise<AppState> {
  const result = await restoreBackup(file)
  return result.state
}
