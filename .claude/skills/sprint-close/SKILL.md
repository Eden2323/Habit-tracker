---
name: sprint-close
description: Close a sprint or phase cleanly. Verifies STATUS.md is current, prunes merged branches and agent worktrees, mirrors as-built state to ClickUp task descriptions (never closes tasks), generates the client report when the repo has a report config, runs /hours week, then /handoff. Use when Eden says "close the sprint", "sprint close", "wrap up the sprint", "end of sprint".
---

# Sprint close

A checklist. Run every step, report each in one line, ask before anything that deletes on the remote or writes to ClickUp.

1. **Layer current?** Run the `/handoff check` logic. If STATUS.md is behind HEAD or the tree is dirty, stop and run `/handoff` first.
2. **Prune locally.**
   ```bash
   git fetch --prune
   git worktree prune
   git branch --merged main | grep -vE '^\*|main$'
   ```
   Delete the listed merged local branches. Remove `.claude/worktrees/<name>` folders whose branch is merged or gone, then `git worktree prune` again. Report what was removed and how much disk it freed.
3. **Prune the remote.** List `origin` branches whose PR is merged (`gh pr list --state merged --json headRefName`). Show the list and ask once; on yes delete them with `git push origin --delete`. Never delete `main` or a branch with an open PR.
4. **Mirror to ClickUp.** For each item in STATUS.md "Where we're at" that finished this sprint, find its task in the engagement folder, update the description with the as-built detail and add a dated comment. Do not change status. List tasks you could not match and leave them to Eden.
5. **Client report.** If `agent/report.yml` exists, run the shared generator and save under `~/Desktop/Documents/<Client>/reports/`. If it does not exist, say "no report config" and continue.
6. **Hours.** Run `/hours week` for the current week.
7. **Handoff.** Run `/handoff` with the slug `sprint <n> closed`.
8. **Report** in five lines: branches removed, disk freed, ClickUp tasks touched, report path or "none", hours confirmed or "pending".
