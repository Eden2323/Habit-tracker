---
name: catchup
description: Orient yourself at the start of a session by reading the repo's committed context layer (AGENTS.md, STATUS.md, agent/DECISIONS.md, agent/HANDOFF.md) plus recent git history and open PRs, then report where the project stands and what's next. Use when the user says "catch up", "where were we", "what's the state", "resume", "pick up where the last session left off", or opens a session on unfamiliar work. The read-side counterpart to `/handoff`.
---

# Catchup

Reconstruct project state from the repo, then report. **Read-only — change no code.**

## Steps

1. **Locate the layer.** From the repo root, read whichever of these exist:
   - `AGENTS.md` (or `CLAUDE.md`)
   - `STATUS.md`
   - `agent/DECISIONS.md`
   - `agent/HANDOFF.md`

   If none exist, say so and offer `/handoff init`. Do not invent state.

2. **Check the layer is trustworthy before believing it.** A stale `STATUS.md` confidently describing old reality is the main failure mode here.
   ```bash
   git log -1 --format='%h %ad %s' --date=short -- STATUS.md
   git rev-list --count "$(git log -1 --format=%H -- STATUS.md)"..HEAD
   ```
   If commits have landed since `STATUS.md` was last written, **say so explicitly and flag it as possibly stale** rather than reporting it as fact.

3. **Read the ground truth.**
   ```bash
   git rev-parse --abbrev-ref HEAD
   git status --porcelain
   git log --oneline -15
   git log --grep='chore(context)' --grep='^HANDOFF' --oneline -10
   gh pr list 2>/dev/null
   ```
   `git log --grep='chore(context)' --grep='^HANDOFF'` is the session timeline — each entry is one prior handoff.

4. **Reconcile.** Where `STATUS.md` and `git` disagree, git wins. Name the discrepancy.

5. **Report**, in this shape, and nothing longer:
   - **Where it stands** — 2–4 sentences.
   - **Branch / working tree** — branch, PR, uncommitted files.
   - **Next steps** — from `STATUS.md`, re-checked against the code.
   - **Don't re-tread** — from `Tried & rejected` and `agent/DECISIONS.md`.
   - **Staleness** — whether the layer is current, and if not, by how many commits.
   - **Open questions for you** — anything the layer flags for the human.

6. If the layer is stale, offer `/handoff` to bring it current before starting work.

## Rules

- Never write code or docs in this mode.
- Never present `STATUS.md` claims as verified fact without the git cross-check.
- Don't dump file contents at the user — synthesise. They want orientation, not a re-read.
- If `agent/DECISIONS.md` names a file, function or flag, verify it still exists before repeating it as current.
