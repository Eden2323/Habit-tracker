#!/bin/bash
# PreCompact: warn that context is about to be lost. Never blocks. Always exits 0. Works without jq.
payload=$(cat 2>/dev/null)
jget() { if command -v jq >/dev/null 2>&1; then printf '%s' "$payload" | jq -r ".$1 // empty" 2>/dev/null
         else printf '%s' "$payload" | python3 -c 'import sys,json;print((json.load(sys.stdin).get(sys.argv[1]) or ""))' "$1" 2>/dev/null; fi; }
cwd=$(jget cwd); [ -z "$cwd" ] && cwd="${CLAUDE_PROJECT_DIR:-$PWD}"
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$root/STATUS.md" ] || exit 0
status_sha=$(git -C "$root" log -1 --format=%H -- STATUS.md 2>/dev/null)
behind=""; [ -n "$status_sha" ] && behind=$(git -C "$root" rev-list --count "${status_sha}..HEAD" 2>/dev/null)
case "$behind" in
  ''|0) msg="Context is being compacted. STATUS.md is current, but if this session made decisions or hit dead ends since the last handoff, run /handoff now." ;;
  *)    msg="Context is being compacted and STATUS.md is ${behind} commit(s) behind HEAD. Run /handoff now so this session's reasoning survives." ;;
esac
if command -v jq >/dev/null 2>&1; then jq -n --arg m "$msg" '{systemMessage:$m}' 2>/dev/null
else python3 -c 'import sys,json;print(json.dumps({"systemMessage":sys.argv[1]}))' "$msg" 2>/dev/null; fi
exit 0
