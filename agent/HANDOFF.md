# HANDOFF — 75 Hard tracker

## System shape
Single-page React app. State is the day log in browser storage; there is no server component. The Gemini vision call goes straight from the browser to Google's API with a key the user enters in the app.

## Why it's built this way
The point is zero friction and zero accounts: the phone is the only device that matters, and the log never leaves it. That rules out sync, analytics and any backend.

## Invariants
- No network dependency for the core loop; the app must work offline as an installed PWA.
- The challenge restarts at day 1 on any missed rule; do not add "forgiveness" without a decision entry.

## Known debt
- The Gemini model id retires periodically; runtime discovery mitigates it but the feature still breaks if Google changes the API surface.

## External dependencies
- GitHub Pages (deploy on push to `main`), Google Gemini API (user-supplied key).
