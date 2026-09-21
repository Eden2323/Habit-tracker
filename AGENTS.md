# AGENTS.md — 75 Hard tracker

Personal project. Read `STATUS.md` first, then `agent/DECISIONS.md`. Claude Code reaches this file through `CLAUDE.md`.

## What this project is
An installable web app for the 75 Hard challenge. Five rules a day for 75 days, miss one and it restarts. No account, no server, no sync: the log lives in the browser's storage on the phone. Live at https://eden2323.github.io/Habit-tracker/ (GitHub Pages, deployed by the workflow on every push to `main`).

## Stack
React + TypeScript + Vite, vitest for tests. Gemini vision is used for photo checks (model `gemini-2.0-flash`, chosen from the live model list at runtime since 10 Sep 2026).

## Commands
| Task | Command |
|---|---|
| Install | `npm ci` |
| Dev | `npm run dev` |
| Test | `npm test` |
| Typecheck | `npm run typecheck` |
| Build | `npm run build` |

Never claim work is done without `npm test` and `npm run build`; the deploy workflow runs both and a red build leaves the live site on the previous version.

## Conventions
- Everything stays on-device. Do not add a backend, analytics or sync.
- The deploy copies `index.html` to `404.html` for SPA routing on Pages; keep routes client-side.

## Boundaries
- No secrets in the repo. The Gemini key is entered by the user in the app, never committed.
- Commits use the personal GitHub identity configured in this repo.

## Your obligation before the session ends
Run `/handoff`: it rewrites `STATUS.md`, appends to `agent/DECISIONS.md`, commits and pushes.

<!-- house-rules:start -->
## House rules (personal projects; synced from aianswers-workflow, edit there)

**Memory.** This repo is the only memory. Local Claude memory is disabled in `.claude/settings.json`. Anything worth remembering goes into `STATUS.md`, `agent/HANDOFF.md` or `agent/DECISIONS.md` via `/handoff`.

**Writing.** Australian spelling. No em dashes. No "simply", "just", "obviously".

**Subagents.** The main session plans, reviews every diff and runs the final gate. Implementation runs in subagents with `model` always set: `opus` for design-heavy work, `sonnet` for mechanical work; effort low or medium. Keep fan-outs under about five agents.

**Run, do not instruct.** Execute commands and report the result. Hand Eden a command only when the step genuinely needs a human.

**Docker on the laptop.** Ask before starting Docker.

**Secrets.** Never in the repo or in chat. Reference `.env` keys by name only.

**This is a personal project.** No ClickUp, no client rules, no hours ledger. Commits go to the personal GitHub account; the repo's git identity is set to it.

**Session discipline.** At about 60% context, run `/handoff` and stop.
<!-- house-rules:end -->
