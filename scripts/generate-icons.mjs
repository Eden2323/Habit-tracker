#!/usr/bin/env node
/**
 * Generates the PNG app icons from the same geometry as public/icon.svg:
 *
 *   public/icon-192.png           rounded square, install prompts
 *   public/icon-512.png           rounded square, splash screens
 *   public/icon-512-maskable.png  full bleed, mark inside the 80% safe circle
 *   public/apple-touch-icon.png   full bleed, iOS applies its own mask
 *
 * Node ships no image encoder, so this does the whole job by hand: rasterise
 * the mark into an RGBA buffer, filter the scanlines, then emit IHDR/IDAT/IEND
 * with zlib.deflateSync and a CRC32 computed here. Run with `node
 * scripts/generate-icons.mjs`; the PNGs are committed, so this only needs
 * re-running when the mark changes.
 */
import { deflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/* ------------------------------------------------------------------ colours */

const GROUND_TOP = [30, 28, 26] // #1e1c1a
const GROUND_BOTTOM = [14, 14, 13] // #0e0e0d
const TRACK = [48, 47, 44] // #302f2c
const ACCENT_A = [244, 112, 63] // #f4703f
const ACCENT_B = [224, 86, 42] // #e0562a
const INK = [242, 240, 236] // #f2f0ec

/* ----------------------------------------------------------------- geometry */
/* All of this is in the SVG's 512x512 space and is transformed on the way out. */

const CENTER = 256
const RING_RADIUS = 178
const RING_WIDTH = 30
const DIGIT_WIDTH = 26
const DIGIT_SCALE = 0.9
/* Visual centre of the two numerals in their own coordinate space. */
const DIGIT_ORIGIN = [116, 78]

/** `M`/`L`/`C` commands, matching the two <path>s in icon.svg exactly. */
const SEVEN = [
  ['M', 6, 8],
  ['L', 90, 8],
  ['L', 44, 148],
]
const FIVE = [
  ['M', 226, 8],
  ['L', 146, 8],
  ['L', 142, 66],
  ['C', 166, 54, 226, 58, 226, 102],
  ['C', 226, 130, 200, 148, 172, 148],
  ['C', 157, 148, 146, 143, 138, 134],
]

const CURVE_STEPS = 28

/** Flattens a command list into a polyline. */
function flatten(commands) {
  const points = []
  let cursor = [0, 0]
  for (const command of commands) {
    const [kind] = command
    if (kind === 'M' || kind === 'L') {
      cursor = [command[1], command[2]]
      points.push(cursor)
    } else {
      const [, x1, y1, x2, y2, x3, y3] = command
      const [x0, y0] = cursor
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS
        const u = 1 - t
        points.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ])
      }
      cursor = [x3, y3]
    }
  }
  return points
}

/** Points along an arc, `sweep` degrees clockwise from `start` (0 = 3 o'clock). */
function arcPoints(cx, cy, radius, start, sweep) {
  const steps = Math.max(8, Math.round(Math.abs(sweep)))
  const points = []
  for (let i = 0; i <= steps; i++) {
    const angle = ((start + (sweep * i) / steps) * Math.PI) / 180
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points
}

function mapPoints(points, fn) {
  return points.map(fn)
}

/**
 * Builds every stroked shape for one icon variant. `markScale` shrinks the mark
 * about the centre (maskable icons need headroom); `size` is the output edge.
 */
function buildMark(size, markScale) {
  const k = size / 512
  const place = ([x, y]) => [(x - CENTER) * markScale * k + CENTER * k, (y - CENTER) * markScale * k + CENTER * k]
  const digit = ([x, y]) =>
    place([CENTER + (x - DIGIT_ORIGIN[0]) * DIGIT_SCALE, CENTER + (y - DIGIT_ORIGIN[1]) * DIGIT_SCALE])
  const stroke = markScale * k

  return {
    track: { points: mapPoints(arcPoints(CENTER, CENTER, RING_RADIUS, 0, 360), place), width: RING_WIDTH * stroke },
    arc: { points: mapPoints(arcPoints(CENTER, CENTER, RING_RADIUS, -90, 270), place), width: RING_WIDTH * stroke },
    digits: {
      points: [mapPoints(flatten(SEVEN), digit), mapPoints(flatten(FIVE), digit)],
      width: DIGIT_WIDTH * DIGIT_SCALE * stroke,
    },
  }
}

/* --------------------------------------------------------------- rasterising */

/** Straight-alpha RGBA canvas, one float per channel in 0..1 (alpha) / 0..255. */
function createCanvas(size) {
  return { size, rgb: new Float32Array(size * size * 3), alpha: new Float32Array(size * size) }
}

/**
 * Paints `coverage` onto the canvas with a per-pixel colour, source-over.
 * Coverage doubles as the source alpha, which is what gives us antialiasing.
 */
function composite(canvas, coverage, colorAt) {
  const { size, rgb, alpha } = canvas
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const a = coverage[i]
      if (a <= 0) continue
      const [sr, sg, sb] = colorAt(x, y)
      const da = alpha[i]
      const out = a + da * (1 - a)
      const j = i * 3
      // Straight alpha, so unmix the destination before blending.
      rgb[j] = (sr * a + rgb[j] * da * (1 - a)) / out
      rgb[j + 1] = (sg * a + rgb[j + 1] * da * (1 - a)) / out
      rgb[j + 2] = (sb * a + rgb[j + 2] * da * (1 - a)) / out
      alpha[i] = out
    }
  }
}

/** Coverage for a rounded square filling the canvas. `radius` 0 means full bleed. */
function roundedSquareCoverage(size, radius) {
  const coverage = new Float32Array(size * size)
  if (radius <= 0) {
    coverage.fill(1)
    return coverage
  }
  const half = size / 2
  const inner = half - radius
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(Math.abs(x + 0.5 - half) - inner, 0)
      const dy = Math.max(Math.abs(y + 0.5 - half) - inner, 0)
      // Signed distance to the rounded rect: negative inside.
      const distance = Math.hypot(dx, dy) - radius
      coverage[y * size + x] = Math.min(Math.max(0.5 - distance, 0), 1)
    }
  }
  return coverage
}

/**
 * Coverage for polylines stroked with round caps and joins. A round-capped
 * segment is a capsule, so the stroke is the union of per-segment distance
 * fields — and a union is a per-pixel max, which also stops joins from
 * double-blending. Only each segment's bounding box is visited.
 */
function strokeCoverage(size, polylines, width) {
  const coverage = new Float32Array(size * size)
  const half = width / 2
  const pad = half + 1

  for (const points of polylines) {
    for (let s = 0; s < points.length - 1; s++) {
      const [ax, ay] = points[s]
      const [bx, by] = points[s + 1]
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad))
      const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + pad))
      const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad))
      const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + pad))
      const vx = bx - ax
      const vy = by - ay
      const lengthSq = vx * vx + vy * vy

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5 - ax
          const py = y + 0.5 - ay
          const t = lengthSq > 0 ? Math.min(Math.max((px * vx + py * vy) / lengthSq, 0), 1) : 0
          const distance = Math.hypot(px - vx * t, py - vy * t)
          const value = Math.min(Math.max(half + 0.5 - distance, 0), 1)
          const i = y * size + x
          if (value > coverage[i]) coverage[i] = value
        }
      }
    }
  }
  return coverage
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function renderIcon(size, { radius, markScale }) {
  const canvas = createCanvas(size)
  const mark = buildMark(size, markScale)

  composite(canvas, roundedSquareCoverage(size, radius), (_x, y) => lerp(GROUND_TOP, GROUND_BOTTOM, y / (size - 1)))
  composite(canvas, strokeCoverage(size, [mark.track.points], mark.track.width), () => TRACK)
  composite(canvas, strokeCoverage(size, [mark.arc.points], mark.arc.width), (x, y) =>
    lerp(ACCENT_A, ACCENT_B, (x / (size - 1) + y / (size - 1)) / 2),
  )
  composite(canvas, strokeCoverage(size, mark.digits.points, mark.digits.width), () => INK)

  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = Math.round(canvas.rgb[i * 3])
    rgba[i * 4 + 1] = Math.round(canvas.rgb[i * 3 + 1])
    rgba[i * 4 + 2] = Math.round(canvas.rgb[i * 3 + 2])
    rgba[i * 4 + 3] = Math.round(canvas.alpha[i] * 255)
  }
  return rgba
}

/* -------------------------------------------------------------- PNG encoding */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** 8-bit RGBA (colour type 6), every scanline Paeth-filtered before deflate. */
function encodePng(size, rgba) {
  const bpp = 4
  const stride = size * bpp
  const raw = Buffer.alloc(size * (stride + 1))

  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 4 // filter type: Paeth
    for (let i = 0; i < stride; i++) {
      const value = rgba[y * stride + i]
      const left = i >= bpp ? rgba[y * stride + i - bpp] : 0
      const up = y > 0 ? rgba[(y - 1) * stride + i] : 0
      const upLeft = y > 0 && i >= bpp ? rgba[(y - 1) * stride + i - bpp] : 0
      raw[rowStart + 1 + i] = (value - paeth(left, up, upLeft)) & 0xff
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------- verification */

/** Re-reads a written file and walks its chunks, so a bad encoder cannot pass. */
function verifyPng(path, expectedSize) {
  const buffer = readFileSync(path)
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path}: bad PNG signature`)

  let offset = 8
  let header = null
  let sawEnd = false
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 4, offset + 8 + length)
    const expected = buffer.readUInt32BE(offset + 8 + length)
    if (crc32(body) !== expected) throw new Error(`${path}: CRC mismatch in ${type} chunk`)
    if (type === 'IHDR') {
      header = {
        width: buffer.readUInt32BE(offset + 8),
        height: buffer.readUInt32BE(offset + 12),
        depth: buffer[offset + 16],
        color: buffer[offset + 17],
      }
    }
    if (type === 'IEND') sawEnd = true
    offset += 12 + length
  }

  if (!header) throw new Error(`${path}: no IHDR`)
  if (!sawEnd) throw new Error(`${path}: no IEND`)
  if (offset !== buffer.length) throw new Error(`${path}: trailing bytes after IEND`)
  if (header.width !== expectedSize || header.height !== expectedSize) {
    throw new Error(`${path}: IHDR says ${header.width}x${header.height}, expected ${expectedSize}`)
  }
  if (header.depth !== 8 || header.color !== 6) throw new Error(`${path}: expected 8-bit RGBA`)
  return { bytes: buffer.length, ...header }
}

/* --------------------------------------------------------------------- main */

const TARGETS = [
  { file: 'icon-192.png', size: 192, radius: 192 * (112 / 512), markScale: 1 },
  { file: 'icon-512.png', size: 512, radius: 112, markScale: 1 },
  // Maskable icons get cropped to an unknown shape; keep the mark inside the
  // 80%-of-width safe circle and let the ground bleed to the edges.
  { file: 'icon-512-maskable.png', size: 512, radius: 0, markScale: 0.8 },
  // iOS applies its own squircle, so this one bleeds too.
  { file: 'apple-touch-icon.png', size: 180, radius: 0, markScale: 1 },
]

for (const target of TARGETS) {
  const path = join(PUBLIC_DIR, target.file)
  writeFileSync(path, encodePng(target.size, renderIcon(target.size, target)))
  const info = verifyPng(path, target.size)
  process.stdout.write(`${target.file.padEnd(24)} ${info.width}x${info.height}  ${(info.bytes / 1024).toFixed(1)} kB\n`)
}
