#!/bin/bash
# SessionEnd and Stop: write this session's draft row(s) to agent/HOURS.md describing its active time.
# Runs at every Stop as well as at SessionEnd so the row already sits in the working tree when the
# session commits (a cloud sandbox is thrown away, so a row written only at SessionEnd would be lost).
# Rows are keyed by session id and replaced on each run. Works without jq.
# Active time = sum of gaps between consecutive transcript events that are under 15 minutes.
# Times are recorded in Australia/Brisbane regardless of where the session ran. Always exits 0.
payload=$(cat 2>/dev/null)
jget() { if command -v jq >/dev/null 2>&1; then printf '%s' "$payload" | jq -r ".$1 // empty" 2>/dev/null
         else printf '%s' "$payload" | python3 -c 'import sys,json;print((json.load(sys.stdin).get(sys.argv[1]) or ""))' "$1" 2>/dev/null; fi; }
cwd=$(jget cwd); [ -z "$cwd" ] && cwd="${CLAUDE_PROJECT_DIR:-$PWD}"
transcript=$(jget transcript_path)
sid=$(jget session_id)
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
ledger="$root/agent/HOURS.md"
[ -f "$ledger" ] || exit 0
[ -f "$transcript" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)
python3 - "$transcript" "$ledger" "${sid:-unknown}" "${branch:-?}" <<'PY' 2>/dev/null
import sys, json, datetime, re
transcript, ledger, sid, branch = sys.argv[1:5]
try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Australia/Brisbane")
except Exception:  # no tz database on this image; Brisbane is UTC+10 all year
    TZ = datetime.timezone(datetime.timedelta(hours=10))
GAP = 15*60
ts = []
for line in open(transcript, errors="ignore"):
    if '"timestamp"' not in line: continue
    try: t = json.loads(line).get("timestamp")
    except Exception: continue
    if not t: continue
    try: ts.append(datetime.datetime.fromisoformat(t.replace("Z", "+00:00")))
    except Exception: pass
if len(ts) < 2: sys.exit(0)
ts.sort()
# one row per calendar day (a resumed session can span days); active = capped gaps attributed to the earlier event's day
days = {}
for a, b in zip(ts, ts[1:]):
    g = (b-a).total_seconds()
    if g <= 0 or g > GAP: continue   # same idle rule as reconstruct.py: only gaps under 15 min count
    la, lb = a.astimezone(TZ), b.astimezone(TZ)
    d = days.setdefault(la.date(), {"start": la, "end": lb, "active": 0.0})
    d["active"] += g; d["end"] = max(d["end"], lb) if lb.date() == la.date() else d["end"]
rows = []
for day, d in sorted(days.items()):
    mins = int(round(d["active"]/60))
    if mins >= 1:
        rows.append(f"| {day} | {d['start']:%H:%M} | {d['end']:%H:%M} | {mins} | {branch} | {sid[:8]} | session |")
if not rows: sys.exit(0)
text = open(ledger).read()
marker = "## Draft rows"
if marker not in text:
    text = text.rstrip("\n") + "\n\n## Draft rows\n\n| date | start | end | active_min | branch | session | source |\n|---|---|---|---|---|---|---|\n"
# drop any earlier rows for this session (it may have ended before and been resumed), then append the fresh set
pat = re.compile(r"^\|[^\n]*\| " + re.escape(sid[:8]) + r" \| session \|\n?", re.M)
text = pat.sub("", text)
head, sep, tail = text.partition(marker)
lines = tail.split("\n")
last = 0
for i, l in enumerate(lines):
    if l.startswith("|"): last = i
    elif l.startswith("## ") and i > 0: break
for j, r in enumerate(rows): lines.insert(last+1+j, r)
open(ledger, "w").write(head + sep + "\n".join(lines))
PY
exit 0
