import { Component, type ErrorInfo, type ReactNode } from 'react'
import './AppShell.css'

/*
 * Deliberately duplicated from storage.ts rather than imported: if a module in
 * src/lib is what broke the render, the escape hatch has to keep working
 * without it. Same reason there is no backup.ts import here.
 */
const STORAGE_KEY = 'hard75:state:v1'

type Rescue = 'idle' | 'saved' | 'empty' | 'failed'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  rescue: Rescue
}

const RESCUE_MESSAGE: Record<Exclude<Rescue, 'idle'>, string> = {
  saved: 'Saved to your downloads — keep that file safe.',
  empty: 'There was nothing stored on this device to save.',
  failed: 'This browser would not let the file download.',
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, rescue: 'idle' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('75 Hard crashed while rendering', error, info.componentStack)
  }

  private reload = () => {
    window.location.reload()
  }

  private download = () => {
    let url: string | null = null
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        this.setState({ rescue: 'empty' })
        return
      }
      const stamp = new Date().toISOString().slice(0, 10)
      url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `75-hard-rescue-${stamp}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      this.setState({ rescue: 'saved' })
    } catch {
      this.setState({ rescue: 'failed' })
    } finally {
      // Revoking in the same tick can cancel the download in some browsers.
      const created = url
      if (created) setTimeout(() => URL.revokeObjectURL(created), 1000)
    }
  }

  render() {
    const { error, rescue } = this.state
    if (!error) return this.props.children

    return (
      <div className="sh-crash">
        <div className="sh-crash__panel" role="alert">
          <div className="sh-crash__icon" aria-hidden="true">
            🩹
          </div>
          <h1 className="sh-crash__title">Something broke</h1>
          <p className="sh-crash__body">
            The app hit an error and stopped drawing the screen. Your streak is not affected — everything is still
            stored on this device. Reloading usually clears it.
          </p>
          {error.message ? <p className="sh-crash__detail">{error.message}</p> : null}

          <div className="sh-crash__actions">
            <button type="button" className="sh-crash__btn sh-crash__btn--primary" onClick={this.reload}>
              Reload the app
            </button>
            <button type="button" className="sh-crash__btn sh-crash__btn--secondary" onClick={this.download}>
              Download my data
            </button>
          </div>

          <p className="sh-crash__note" role="status" aria-live="polite">
            {rescue === 'idle'
              ? 'The download is a plain JSON copy of everything you have logged.'
              : RESCUE_MESSAGE[rescue]}
          </p>
        </div>
      </div>
    )
  }
}
