---
name: retire-project
description: Retire or hand over the engagement this repo belongs to. Final handoff with STATUS.md marked RETIRED or HANDED OVER, last hours check and a closing hours summary posted to the ClickUp task, optional final client report, closing PR merged, then tools/retire-project.sh from the aianswers-workflow repo archives the GitHub repo, moves the folder to ~/Desktop/Archive/ with its Claude history and trust entry, and updates the desktop map. Use when Eden says "retire this project", "close the engagement", "archive this project", "hand this over", "we're done with <client>".
---

# Retire project

Everything the repo needs to say is written before anything moves. The folder move is the last step and closes the session with it.

## Steps

1. **Confirm the mode in one question.** *Retire* (we keep the repo, archived read-only on GitHub) or *handover* (the client takes the repo; nothing of ours stays on GitHub). List anything STATUS.md or `agent/HANDOFF.md` says is still live (hosts, cron jobs, tunnels, scheduled tasks) and ask what happens to each. Switch nothing off without a yes in this session.
2. **Layer current?** Run the `/handoff check` logic. If STATUS.md is behind HEAD or the tree is dirty, run `/handoff` first.
3. **Prune.** Steps 2 and 3 of `/sprint-close`: merged local branches, worktrees, then merged `origin` branches (show the list, ask once). Mirror anything that finished to its ClickUp task description with a dated comment; never change status.
4. **Hours.** If the current week has evidence and no confirmed row, run `/hours week`. Then build the closing summary from every row in `## Confirmed weeks`: a table of week and hours, and the total. Ask, then post it as a comment on `clickup_task`:
   `Engagement closed <date>. Confirmed hours: <total>h over <n> weeks (<week> <h>, ...). Source: agent/HOURS.md.`
   Hours only, never money.
5. **Final report.** If `agent/report.yml` exists, ask whether a closing report is wanted. If yes, refresh and render it as in `/sprint-close` step 5.
6. **Rewrite STATUS.md.** The first section after the title becomes `## Engagement status (<date>): RETIRED` (or `HANDED OVER`) and says: why; what is still running, where, and who owns it now; where the hours ledger and deliverables are; and what a future session must not do (deploy, restart, bill). Keep the remaining fixed sections. Append one entry to `agent/DECISIONS.md`: `<date> — engagement retired` with the context and what was rejected.
7. **Closing PR.** Commit as `chore(context): handoff — engagement retired` on `chore/retire`, push, open the PR, `gh pr checks --watch`, merge when green (merge straight away if the repo has no CI), then `git checkout main && git pull --ff-only`.
8. **Move it out.** Say that the folder is about to move and this session should be closed afterwards, then run:
   ```bash
   ~/Desktop/AIAnswers/aianswers-workflow/tools/retire-project.sh "$(git rev-parse --show-toplevel)" --reason "<one line>" [--handover]
   ```
   It refuses on a dirty tree, an unpushed main, an open PR, or a STATUS.md that does not say RETIRED or HANDED OVER. On a cloud session stop before this step and leave it for a local one: it moves folders on the laptop.
9. **Report** in five lines: archive path, GitHub state (archived, or "transfer to the client" with the settings path), the ClickUp comment and the reminder that the folder moves to Retired in the UI, the Documents folder left in place, and "close this session".

## Rules

- Nothing moves until main is pushed and the closing PR is merged. The repo is the memory; the move must not lose any of it.
- Retired hosts are the client's or Andrew's call. Record who owns each in STATUS.md; do not switch anything off on your own.
- Hours only in the closing comment. Fees, rates and invoices are Andrew's.
- A retired repo is never deleted, on GitHub or on disk. Archive means read-only and findable.
