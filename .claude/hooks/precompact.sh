#!/bin/bash
# PreCompact: warn that context is about to be lost. Never blocks. Always exits 0.
payload=$(cat 2>/dev/null)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null); [ -z "$cwd" ] && cwd="$PWD"
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/STATUS.md" ] || exit 0
status_sha=$(git -C "$root" log -1 --format=%H -- STATUS.md 2>/dev/null)
behind=""; [ -n "$status_sha" ] && behind=$(git -C "$root" rev-list --count "${status_sha}..HEAD" 2>/dev/null)
case "$behind" in
  ''|0) msg="Context is being compacted. STATUS.md is current, but if this session made decisions or hit dead ends since the last handoff, run /handoff now." ;;
  *)    msg="Context is being compacted and STATUS.md is ${behind} commit(s) behind HEAD. Run /handoff now so this session's reasoning survives." ;;
esac
jq -n --arg m "$msg" '{systemMessage:$m}' 2>/dev/null
exit 0
