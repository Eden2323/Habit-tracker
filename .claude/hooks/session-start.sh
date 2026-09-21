#!/bin/bash
# SessionStart: inject this repo's committed context layer. Silent no-op without STATUS.md. Always exits 0.
payload=$(cat 2>/dev/null)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null); [ -z "$cwd" ] && cwd="$PWD"
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
status="$root/STATUS.md"; [ -f "$status" ] || exit 0
status_sha=$(git -C "$root" log -1 --format=%H -- STATUS.md 2>/dev/null)
if [ -n "$status_sha" ]; then
  behind=$(git -C "$root" rev-list --count "${status_sha}..HEAD" 2>/dev/null)
  case "$behind" in ''|0) note="STATUS.md is current with HEAD." ;; *) note="STALE: ${behind} commit(s) since STATUS.md was written. Verify against git before relying on it." ;; esac
else note="STATUS.md is not committed yet."; fi
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)
dirty=$(git -C "$root" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
out="## Committed context layer (auto-loaded from ${root##*/}/STATUS.md)

Branch \`${branch}\`, ${dirty} uncommitted file(s). ${note}

This repo is the only shared memory. Deep context: \`agent/HANDOFF.md\`. Settled decisions: \`agent/DECISIONS.md\` (do not re-litigate). Hours ledger: \`agent/HOURS.md\`. Run \`/catchup\` to reconcile, \`/handoff\` before you stop, \`/sprint-close\` at a sprint boundary.

---

$(head -c 12000 "$status")
"
jq -n --arg ctx "$out" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}' 2>/dev/null
exit 0
