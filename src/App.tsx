import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { CHALLENGE_LENGTH, addDays, dayNumber, formatLong, formatShort } from './lib/date'
import { useStore } from './lib/store'
import type { DateKey } from './lib/types'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RestartBanner } from './components/RestartBanner'
import DayView from './components/today/DayView'
import PhotosView from './components/photos/PhotosView'
import ProgressView from './components/progress/ProgressView'
import SettingsView from './components/settings/SettingsView'
import './components/AppShell.css'

type TabId = 'today' | 'progress' | 'photos' | 'settings'

const tabIcon = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
  className: 'sh-tab__icon',
} as const

function TodayIcon() {
  return (
    <svg {...tabIcon}>
      <rect x="3" y="5" width="18" height="16" rx="3.5" />
      <path d="M3 10h18M8 3v4M16 3v4M8.6 15.2l2.3 2.3 4.5-4.8" />
    </svg>
  )
}

function ProgressIcon() {
  return (
    <svg {...tabIcon} strokeWidth={2.1}>
      <path d="M6 20v-5.5M12 20V4M18 20v-9" />
    </svg>
  )
}

function PhotosIcon() {
  return (
    <svg {...tabIcon}>
      <path d="M4 8h2.6l1.6-2.6h7.6L17.4 8H20a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 8z" />
      <circle cx="12" cy="13.6" r="3.4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg {...tabIcon}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <circle cx="9" cy="6.5" r="2.2" />
      <circle cx="15.5" cy="12" r="2.2" />
      <circle cx="8" cy="17.5" r="2.2" />
    </svg>
  )
}

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: () => ReactElement }> = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
  { id: 'photos', label: 'Photos', Icon: PhotosIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
]

/** New screen, top of the page. Assigning scrollTop keeps jsdom quiet in tests. */
function scrollToTop() {
  document.documentElement.scrollTop = 0
}

function AppShell() {
  const { state, today, persisted } = useStore()
  const attempt = state.current
  const [tab, setTab] = useState<TabId>('today')
  const [selectedDate, setSelectedDate] = useState<DateKey>(today)
  const previousToday = useRef(today)
  const prevDayButton = useRef<HTMLButtonElement>(null)

  const theme = state.settings.theme
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  // Midnight rolled over while the app was open: follow the user along only if
  // they were still parked on what used to be today.
  useEffect(() => {
    if (previousToday.current === today) return
    const wasToday = previousToday.current
    previousToday.current = today
    setSelectedDate((current) => (current === wasToday ? today : current))
  }, [today])

  const goToDate = useCallback((date: DateKey) => {
    setSelectedDate(date)
    setTab('today')
    scrollToTop()
  }, [])

  const openTab = (next: TabId) => {
    setTab(next)
    scrollToTop()
  }

  const headerDay = Math.max(1, Math.min(dayNumber(attempt.startDate, today), CHALLENGE_LENGTH))
  const isToday = selectedDate === today
  const atStart = selectedDate <= attempt.startDate

  return (
    <div className="sh-app">
      <header className="sh-header">
        <div className="sh-header__inner">
          <div className="sh-brand">
            <h1 className="sh-brand__name">75 Hard</h1>
            <p className="sh-brand__day">
              Day <span className="sh-brand__num tabular">{headerDay}</span> / {CHALLENGE_LENGTH}
            </p>
          </div>

          <nav className="sh-nav" aria-label="Pick a day">
            {isToday ? null : (
              <button
                type="button"
                className="sh-nav__today"
                onClick={() => {
                  setSelectedDate(today)
                  // This button unmounts on the way back, so hand focus to a
                  // control that survives rather than dropping it on <body>.
                  prevDayButton.current?.focus()
                }}
                aria-label="Back to today"
              >
                Today
              </button>
            )}
            <button
              type="button"
              ref={prevDayButton}
              className="sh-nav__btn"
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              disabled={atStart}
              aria-label="Previous day"
            >
              <Chevron back />
            </button>
            <span className="sh-nav__label" aria-live="polite">
              <span aria-hidden="true">{isToday ? 'Today' : formatShort(selectedDate)}</span>
              <span className="visually-hidden">
                {formatLong(selectedDate)}
                {isToday ? ' (today)' : ''}
              </span>
            </span>
            <button
              type="button"
              className="sh-nav__btn"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              disabled={isToday || selectedDate > today}
              aria-label="Next day"
            >
              <Chevron />
            </button>
          </nav>
        </div>
      </header>

      {persisted ? null : (
        <div className="sh-strip" role="status">
          <p className="sh-strip__inner">
            <span className="sh-strip__icon" aria-hidden="true">
              ⚠
            </span>
            <span>
              <span className="sh-strip__lead">Nothing is being saved.</span> This browser is blocking storage, so
              anything you log will disappear when the app closes. Private browsing is the usual cause.
            </span>
          </p>
        </div>
      )}

      <div className="sh-banners">
        <RestartBanner />
      </div>

      <main className="sh-main">
        {tab === 'today' ? <DayView date={selectedDate} /> : null}
        {tab === 'progress' ? <ProgressView onSelectDate={goToDate} /> : null}
        {tab === 'photos' ? (
          <div className="sh-page">
            <PhotosView />
          </div>
        ) : null}
        {tab === 'settings' ? <SettingsView /> : null}
      </main>

      <nav className="sh-tabbar" aria-label="Sections">
        <div className="sh-tabbar__inner">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="sh-tab"
              onClick={() => openTab(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  )
}
