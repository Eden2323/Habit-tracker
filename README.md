# 75 Hard Tracker

A tracker for the 75 Hard challenge, built as an installable web app that runs
entirely on your phone. No account, no server, no sync — the log lives in the
browser's own storage and never leaves the device.

**Live: https://eden2323.github.io/Habit-tracker/**

## The five rules

Five things, every day, for 75 days. Miss one and the challenge restarts at
Day 1.

| Rule | Tracked by | Default target |
| --- | --- | --- |
| 🏋️ 45 minute workout | Minutes slider, quick chips, an "outdoors" switch | 45 min |
| 🍽️ Track macros | Protein / carbs / fat / calories against your targets | logged, not a number |
| 💧 Drink 2 L of water | Tap-to-fill glasses, plus a custom amount | 2,000 ml |
| 📖 Read 10 pages | Page counter with the book you are on | 10 pages |
| 📸 Progress photo | Camera or library, one photo per day | one a day |

All five are editable in **Settings → Your rules**: rename them, change the
targets, switch one off, reorder them, or add habits of your own. Days are
scored live against whatever the rules say right now, so raising a target can
un-tick a day you had already finished.

## Install it on your phone

The app is a PWA. Installed, it opens full screen with its own icon, no browser
chrome, and it works with no connection at all — the service worker keeps the
whole app cached.

**iPhone / iPad (Safari only — Chrome on iOS cannot do this)**

1. Open https://eden2323.github.io/Habit-tracker/ in Safari.
2. Tap the Share button (the square with the arrow).
3. Scroll down, tap **Add to Home Screen**, then **Add**.

**Android (Chrome)**

1. Open the same link in Chrome.
2. Tap the ⋮ menu.
3. Tap **Install app** (sometimes **Add to Home screen**), then **Install**.

Open it from the home-screen icon from then on. The installed copy and the
browser tab share the same storage, so it makes no difference which one you log
in — but keep to one browser, because a different browser is a different box of
data (see below).

## Where the data lives

Everything is stored by the browser, on the one device:

- **Your log** — days, rules, targets, notes, archived attempts — in
  `localStorage`, under the key `hard75:state:v1`. Roughly 5 MB is available;
  75 days of text uses a tiny fraction of it.
- **Your photos** — in IndexedDB (database `hard75-photos`), as compressed JPEG
  blobs. Each photo is scaled to 1280px on its longest edge before it is saved,
  so a 4 MB phone shot lands around 150–300 KB.

Nothing is uploaded. There is no account and no server component at all — the
GitHub Pages deploy serves static files and never sees your data.

The flip side is worth stating plainly:

- **Clearing your browser's site data deletes the challenge.** So does
  "Remove app data", a hard reset, or deleting the installed app on some
  Android builds.
- **Photos exist on that one device only.** Losing the phone loses them.
- **Private / incognito windows do not keep anything.** The app notices and
  shows a warning strip when the browser is refusing to save.

So: use **Settings → Your data → Download backup**. It writes one JSON file
(`75hard-backup-YYYY-MM-DD.json`) containing the log *and* every photo, which is
enough to rebuild the whole challenge on a new phone. Do it weekly, and always
before clearing anything.

## What's in it

**Today** — the day's checklist with a completion ring. Tap a rule to open its
tracker; tap the checkbox to tick it by hand. There is a day-picker in the
header for going back and filling in a day you missed logging. A free-text note
sits at the bottom of each day.

**Progress** — the board: all 75 days as a grid, coloured complete / partial /
missed / today / to come, and tappable to jump to that day. Under it: current
and longest streak, days banked, totals for water, pages and training time, a
per-rule consistency bar, a pace chart against one-a-day, and daily volume
sparklines.

**Photos** — a timeline grid with a full-screen viewer (swipe or arrow keys),
and a compare mode: pick any two days and either wipe between them with a
slider or view them side by side.

**Settings** — rules and targets, macro targets (with a nudge when the grams
and the calorie target disagree), water glass size, theme, start date, previous
attempts, backup and restore, and the manual restart.

**Restarting.** Miss a day and a banner appears on every screen naming the day
and what was missed. Nothing resets on its own: restarting takes an explicit
confirmation, and "Not yet" puts the banner away until tomorrow. When you do
confirm, the attempt is archived to **Previous attempts** — days, photos, notes
and how far you got, all kept — and today becomes Day 1 with your rules and
targets carried over.

## Development

```bash
npm install     # once
npm run dev     # dev server on http://localhost:5173
npm test        # vitest, once through
npm run build   # typecheck + production build into dist/
```

Also available: `npm run test:watch`, `npm run preview` (serve the built
`dist/`), and `npm run typecheck`. React 18 + TypeScript + Vite, with no runtime
dependencies beyond React — the charts, sliders and service worker are all hand
written.

The app icons in `public/` are generated by `node scripts/generate-icons.mjs`
and committed; that only needs re-running if the mark changes.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`, which installs, runs
the tests, builds, copies `index.html` to `404.html` as an SPA fallback, and
publishes `dist/` to GitHub Pages. A failing test fails the deploy.

**One-time setup, which cannot be done from code:** in the repository's
**Settings → Pages**, set **Source** to **GitHub Actions**. Until that is done
the workflow will build and then fail at the deploy step.

The site is served from a subpath, so `vite.config.ts` sets `base` to
`/Habit-tracker/`. If the repo is ever renamed or moved to a custom domain,
change it there (or build with `BASE_PATH=/`).

## Architecture

The domain logic lives in `src/lib` and knows nothing about React components;
the components read from it and dispatch actions back.

| File | Holds |
| --- | --- |
| `src/lib/types.ts` | The domain types: `TaskDef`, `DayRecord`, `Attempt`, `AppState` |
| `src/lib/date.ts` | `YYYY-MM-DD` date keys in local time, day numbers, formatting, midnight rollover |
| `src/lib/defaults.ts` | The five default rules, default targets, blank day and attempt factories |
| `src/lib/selectors.ts` | Everything derived: is a task done, is a day complete, streaks, missed days, totals |
| `src/lib/store.tsx` | `StoreProvider` + `useStore()`, the reducer and the `Action` union — the only way state changes |
| `src/lib/storage.ts` | localStorage load/save, plus validation that turns any junk into a usable state |
| `src/lib/photos.ts` | The IndexedDB photo store and the image compressor |
| `src/lib/backup.ts` | Export/import of the one-file backup, photos inlined as data URLs |

Components:

```
src/main.tsx                 StoreProvider > ToastProvider > App
src/App.tsx                  header, day picker, tab bar, storage warning
  components/ErrorBoundary   crash screen with a "download my data" escape hatch
  components/RestartBanner   the missed-day prompt and its confirmations
  components/today/          DayView + the five trackers and the note editor
  components/photos/         PhotoCapture, PhotosView, CompareSlider, usePhoto
  components/progress/       ProgressView > DayGrid, StatsDashboard, Charts
  components/settings/       SettingsView > RulesEditor, AttemptHistory, DataManager
  components/ui/             Button, Card, Field, Modal, ProgressRing, Segmented, toasts
  styles/global.css          design tokens — every colour and spacing value
```

`public/` holds the PWA pieces: the manifest, the icons, a hand-written service
worker (network-first for pages, stale-while-revalidate for assets) and a
standalone `offline.html` for the case where even the cached shell is missing.

Tests are in `src/test/` and cover the spine — dates, selectors, storage
validation, the reducer and the photo store.

## Day to day

[docs/USAGE.md](docs/USAGE.md) is the guide to actually using it: the daily
loop, manual overrides, what a missed day does, backups, and what to do when
something looks wrong.
