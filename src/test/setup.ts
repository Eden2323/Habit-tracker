import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom does not implement canvas encoding, which the photo compressor uses.
// Tests that need a photo stub it directly; this keeps the import side-effect free.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.toBlob) {
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) {
    callback(new Blob(['stub'], { type: 'image/jpeg' }))
  }
}

if (typeof globalThis.matchMedia !== 'function') {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
