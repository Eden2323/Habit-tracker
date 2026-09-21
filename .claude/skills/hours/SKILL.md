---
name: hours
description: Weekly hours for this engagement. `/hours week` (or `/hours week 2026-W38`) reconciles the automatic session rows in agent/HOURS.md with git commits and calendar meetings, shows a per-day table for Eden to correct, writes the confirmed week, and posts it to the ClickUp task as a comment. `/hours invoice <month>` sums confirmed weeks for invoicing. Use when Eden says "hours", "timesheet", "how long did I spend", "invoice", or on the Friday reminder.
---

# Hours

Eden forgets to track time and estimates the whole week at invoice time. This skill turns evidence into a draft, gets a two-minute correction, and records the confirmed number where it can be found again.

## `/hours week [ISO week]`

Default week: the current one (Monday to Sunday, Australia/Brisbane). `2026-W38` selects another.

1. **Read the config** at the top of `agent/HOURS.md` (client, ClickUp task, calendar keywords).
2. **Reconstruct from evidence.** Run:
   ```bash
   python3 .claude/skills/hours/reconstruct.py --week <ISO week>
   ```
   It unions three sources and applies a fifteen-minute idle rule: the draft rows in `agent/HOURS.md`, this repo's local Claude transcripts including subagents when `~/.claude/projects` is present, and git commit times on all branches. It prints a per-day table and says which sources were available. On a cloud session only the ledger and git are available; say so.
3. **Add meetings.** If a calendar connector is available, list events for the week and keep those whose title or attendees match `calendar_keywords`. Add each as its own line (date, duration, title). If no calendar connector is present, say so and ask Eden for meetings in one line.
4. **Show the table** per day with a total and the sentence: "This is a floor. Sessions in other tools, email and document work are not in it. Correct any day." Then wait.
5. **Write the confirmed row** once Eden confirms or corrects: append to the `## Confirmed weeks` table (`week | hours | per-day breakdown | note | today`). Do not delete draft rows; they are the evidence.
6. **Mirror to ClickUp** with a comment on `clickup_task` (ask which task if blank, and offer to store the answer in the config): `Hours week <ISO>: <total>h (<per-day>). Source: agent/HOURS.md.` Never change task status.
7. **Commit** `chore(hours): week <ISO> confirmed` and push on the current branch if it is not `main`; on `main` ask first.

## `/hours invoice <month>`

Sum the confirmed weeks whose Monday falls in the month. Print total hours for this client, the weekly lines, and any week in the month with no confirmed row, flagged as "unconfirmed". Do not invent a number for an unconfirmed week.

## Rules

- Evidence is a floor, never the truth. Always ask before writing a confirmed row.
- Never record fees, rates or money. Hours only.
- Never edit an existing confirmed row silently. Add a new row with a note that supersedes it.
