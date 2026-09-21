# STATUS — 75 Hard tracker

_Last updated: 2026-09-21 by Claude Code (layer install)_

## Where we're at
Live and in personal use. Last change (10 Sep 2026) switched the Gemini vision call to `gemini-2.0-flash` with the active model discovered at runtime, after the previous model id was retired.

## Branch / uncommitted state
- **Branch:** `main`, in sync with `origin/main`
- **Deployed:** GitHub Pages from `main`

## Next steps
1. None scheduled. Use it; fix what annoys you.

## Tried & rejected
- Nothing recorded yet.

## Gotchas
- A hardcoded Gemini model id will break again when Google retires it; the runtime discovery exists for that reason.

## Verify with
```bash
npm test
npm run build
```
