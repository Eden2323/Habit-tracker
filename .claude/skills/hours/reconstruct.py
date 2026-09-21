#!/usr/bin/env python3
"""Reconstruct active hours for one ISO week from evidence in and around this repo.

Sources (each optional, reported as present or absent):
  ledger      draft rows in agent/HOURS.md written by the SessionEnd hook
  transcripts local Claude Code transcripts for this repo, including subagents (~/.claude/projects)
  git         commit author times on all branches

Idle rule: consecutive events closer than --gap minutes count as active time.
Ledger rows are trusted as-is (they already applied the rule at session end).
"""

import argparse
import collections
import datetime as dt
import glob
import json
import os
import re
import subprocess
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Australia/Brisbane")


def week_bounds(iso):
    y, w = iso.upper().split("-W")
    mon = dt.date.fromisocalendar(int(y), int(w), 1)
    return mon, mon + dt.timedelta(days=7)


def root():
    return (
        subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
        ).stdout.strip()
        or os.getcwd()
    )


def ledger_rows(r, lo, hi):
    p = os.path.join(r, "agent", "HOURS.md")
    out = collections.defaultdict(float)
    if not os.path.exists(p):
        return None
    for m in re.finditer(
        r"^\| (\d{4}-\d{2}-\d{2}) \| [^|]* \| [^|]* \| (\d+) \|[^\n]*\| (?:session|backfill) \|$",
        open(p).read(),
        re.M,
    ):
        d = dt.date.fromisoformat(m.group(1))
        if lo <= d < hi:
            out[d] += int(m.group(2)) / 60
    return out


def transcript_events(r):
    mangled = "-" + r.strip("/").replace("/", "-")
    base = os.path.expanduser("~/.claude/projects/" + mangled)
    if not os.path.isdir(base):
        return None
    ev = []
    for f in glob.glob(base + "/**/*.jsonl", recursive=True):
        for line in open(f, errors="ignore"):
            if '"timestamp"' not in line:
                continue
            try:
                t = json.loads(line).get("timestamp")
            except Exception:
                continue
            if t:
                try:
                    ev.append(dt.datetime.fromisoformat(t.replace("Z", "+00:00")))
                except Exception:
                    pass
    return ev


def git_events(r):
    out = subprocess.run(
        ["git", "-C", r, "log", "--all", "--format=%aI"], capture_output=True, text=True
    ).stdout.split()
    return [dt.datetime.fromisoformat(t) for t in out]


def active(events, lo, hi, gap):
    per = collections.defaultdict(float)
    ev = sorted(e for e in events if lo <= e.astimezone(TZ).date() < hi)
    for a, b in zip(ev, ev[1:]):
        g = (b - a).total_seconds()
        if 0 < g <= gap * 60:
            per[a.astimezone(TZ).date()] += g / 3600
    return per


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", default=dt.date.today().strftime("%G-W%V"))
    ap.add_argument("--gap", type=int, default=15)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    lo, hi = week_bounds(a.week)
    r = root()
    led = ledger_rows(r, lo, hi)
    tr = transcript_events(r)
    gi = git_events(r)
    sources = {"ledger": led is not None, "transcripts": tr is not None, "git": bool(gi)}
    # evidence union: transcripts + git under the idle rule; ledger rows only where
    # transcripts are absent (they measure the same thing)
    ev = (tr or []) + gi
    per = active(ev, lo, hi, a.gap)
    if tr is None and led:
        for d, h in led.items():
            per[d] = max(per.get(d, 0), h)
    days = [lo + dt.timedelta(i) for i in range(7)]
    if a.json:
        print(
            json.dumps(
                {
                    "week": a.week,
                    "sources": sources,
                    "days": {d.isoformat(): round(per.get(d, 0), 2) for d in days},
                    "total": round(sum(per.values()), 2),
                }
            )
        )
        return
    print(f"Week {a.week}  ({lo} to {hi - dt.timedelta(1)})  repo: {os.path.basename(r)}")
    print(
        "Sources: "
        + ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in sources.items())
        + f"   idle rule: {a.gap} min"
    )
    print("| day | date | hours |\n|---|---|---|")
    for d in days:
        print(f"| {d:%a} | {d} | {per.get(d, 0):.1f} |")
    print(f"| **total** | | **{sum(per.values()):.1f}** |")
    print(
        "\nThis is a floor. Sessions in other tools, meetings, email and document work "
        "are not in it."
    )


if __name__ == "__main__":
    main()
