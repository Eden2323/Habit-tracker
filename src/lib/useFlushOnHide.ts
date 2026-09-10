import { useEffect } from 'react'

/**
 * Land a pending deferred write when the page is hidden or discarded.
 *
 * React effect cleanups run on unmount, but browsers do not run them when a tab
 * is closed, navigated away from, or evicted by the OS — backgrounding the app
 * on iOS can discard it outright. `pagehide` is the event that reliably fires
 * there; `beforeunload` is not. Without this, the last burst of typing inside a
 * debounce window is simply lost.
 */
export function useFlushOnHide(flush: () => void): void {
  useEffect(() => {
    const onPageHide = () => flush()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flush])
}
