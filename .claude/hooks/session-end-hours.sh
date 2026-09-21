#!/bin/bash
# SessionEnd: append one draft row to agent/HOURS.md describing this session's active time.
# Active time = sum of gaps between consecutive transcript events that are under 15 minutes.
# Times are recorded in Australia/Brisbane regardless of where the session ran. Always exits 0.
payload=$(cat 2>/dev/null)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null); [ -z "$cwd" ] && cwd="$PWD"
transcript=$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null)
sid=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
ledger="$root/agent/HOURS.md"
[ -f "$ledger" ] || exit 0
[ -f "$transcript" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)
python3 - "$transcript" "$ledger" "${sid:-unknown}" "${branch:-?}" <<'PY' 2>/dev/null
import sys, json, datetime, re
from zoneinfo import ZoneInfo
transcript, ledger, sid, branch = sys.argv[1:5]
TZ = ZoneInfo("Australia/Brisbane"); GAP = 15*60
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
