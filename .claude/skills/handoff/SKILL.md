---
name: handoff
description: Write a cross-tool session handoff so a different agent (Codex, a fresh Claude session, a teammate) can resume cold from the repo alone, with nothing in local memory. Use when the user says "handoff", "checkpoint", "save state", "I'm out of context", "I'm switching to Codex", "before I hit my limit", or at the ~60% context checkpoint from the Agent Context Protocol. Subcommand: `/handoff check` audits staleness and reports without writing. Installing the layer into a new repo is done with `tools/sync-layer.sh` in the aianswers-workflow repo, not here.
---

# Handoff

Produce a repo-committed state snapshot that survives the death of this session and is readable by a tool that has **no access to `~/.agent/`**.

## The problem this exists to solve

Claude Code memory lives in `~/.agent/projects/<mangled-cwd>/memory/`. That path is:
- invisible to Codex, Cursor, Gemini, and any teammate
- invisible to Claude Code on another machine
- **orphaned if the project folder is ever renamed or moved**

Anything that matters must therefore end up **committed in the repo**. The repo is the only shared memory. Local memory is a cache, never the source of truth.

## The context layer

Five files. Do not invent more.

| File | Lifecycle | Purpose |
|---|---|---|
| `AGENTS.md` | slow | Tool-agnostic entry point. **Codex reads this automatically.** Points at everything else. |
| `CLAUDE.md` | slow | Must contain the line `@AGENTS.md` so Claude inherits the same brief. |
| `STATUS.md` | rewritten every handoff | One page. Where we are *right now*. The digest. |
| `agent/HANDOFF.md` | appended | Deep/durable context: architecture, data flow, why it's shaped this way. |
| `agent/DECISIONS.md` | **append-only, never edited** | Dated log of decisions + what was rejected and why. This is the durable memory. |

`STATUS.md` and `agent/HANDOFF.md` are the paths already specified in `~/.agent/agent-context-protocol.md`. Honour them. `AGENTS.md` is the bridge that makes the same content legible to Codex; `agent/DECISIONS.md` is what stops the next agent re-litigating settled questions.

---

## Mode: `/handoff` (default) — write the handoff

1. **Gather ground truth first.** Never write state from memory of the conversation; read it off the repo.
   ```
   git status --porcelain
   git log --oneline -15
   git rev-parse --abbrev-ref HEAD
   git diff --stat
   gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null
   ```
2. **Rewrite `STATUS.md`** in full, to the contract below. It is a digest, not a log — if it exceeds ~120 lines you are dumping, not summarising. Move detail into `agent/HANDOFF.md`.
3. **Append to `agent/DECISIONS.md`** one entry per real decision made this session. Never rewrite or delete prior entries. No decisions made → append nothing.
4. **Append to `agent/HANDOFF.md`** only if durable understanding changed (new subsystem mapped, data flow clarified). Routine progress does not belong here.
5. **Commit** with a greppable subject:
   ```
   chore(context): handoff — <short slug>
   ```
   This makes `git log --grep='chore(context)' --grep='^HANDOFF'` a session timeline, readable by any tool.
6. **Push.** On a feature branch, push. On `main`/`master`, ask the user first.
7. Report back in two or three lines: what you wrote, the commit sha, and the exact sentence to paste into Codex.

### `STATUS.md` contract — fixed sections, in this order

```markdown
# STATUS — <project>

_Last updated: YYYY-MM-DD HH:MM by <Claude Code | Codex> @ <commit sha>_

## Where we're at
Done, and what is in progress *right now*. Prose, not a changelog.

## Branch / uncommitted state
Current branch, PR link, uncommitted or unpushed files, deploy state.

## Next steps
Ordered. Each one concrete enough to start without asking a question.

## Tried & rejected
What was attempted this cycle that did NOT work, and why. One line each.

## Gotchas
Traps the next session must know. Include `file:line` wherever it helps.

## Verify with
The exact commands that prove the work is good — build, test, lint, typecheck.

## Do not touch
Files, services, or branches that are off-limits, and why.
```

`Tried & rejected` and `Verify with` are the two sections that matter most for a cross-tool handoff. Without the first, the next agent burns a session rediscovering your dead ends. Without the second, it guesses the test command and reports false success.

### `agent/DECISIONS.md` entry format

```markdown
## YYYY-MM-DD — <decision in one line>
**Context:** what forced the choice.
**Decision:** what we're doing.
**Rejected:** the alternatives, and why each lost.
**Touches:** `path/to/file.ts`, `path/to/other.ts`
```

---

## Mode: `/handoff check` — audit, write nothing

Report, and stop:
- Does each of the five files exist?
- Is `STATUS.md`'s `_Last updated_` commit behind `HEAD`? Compare
  `git log -1 --format=%h -- STATUS.md` against `git log -1 --format=%h`.
- How many commits have landed since `STATUS.md` was last touched?
  `git rev-list --count "$(git log -1 --format=%H -- STATUS.md)"..HEAD`
- Are there uncommitted changes that a fresh session would not be able to explain?
- Does `CLAUDE.md` contain `@AGENTS.md`?

---

## Rules

- **The repo is the memory.** If a fact only exists in this conversation or in `~/.agent/`, it is not saved.
- **`agent/DECISIONS.md` is append-only.** Rewriting history is how cross-session memory gets silently lost.
- **Read before you write.** State claims must come from `git`, not recollection. A handoff that is subtly wrong is worse than none — the next agent trusts it.
- **Write for a reader with zero context.** No "as discussed", no "the usual fix", no pronouns pointing at this conversation.
- **Never put secrets in the layer.** These files are committed. Reference `.env` keys by name only.
- Keep `STATUS.md` to one page. Volume is not fidelity.
