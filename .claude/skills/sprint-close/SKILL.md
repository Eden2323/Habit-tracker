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
5. **Client report.** If `agent/report.yml` exists, refresh its content from STATUS.md first (progress units, the stage table, what remains, what we are waiting on, watch items, next two weeks, and the date), then render it with the shared generator:
   ```bash
   python3 ~/Desktop/AIAnswers/aianswers-workflow/tools/report.py .
   ```
   On a cloud session or a machine without the workflow repo, fetch it first: `gh repo clone AIANS-Tech/aianswers-workflow /tmp/aianswers-workflow` and run `/tmp/aianswers-workflow/tools/report.py .` (`uv run` supplies python-docx and PyYAML when they are missing). A client-audience config lands in `deliverables/` and is committed; an internal one lands in `~/Desktop/Documents/<client_folder>/reports/` and is never tracked. The generator refuses to save on an em dash, a banned word, or hours and money in a client document; fix the config, not the check. If there is no config, say "no report config" and continue.
6. **Hours.** Run `/hours week` for the current week.
7. **Handoff.** Run `/handoff` with the slug `sprint <n> closed`.
8. **Report** in five lines: branches removed, disk freed, ClickUp tasks touched, report path or "none", hours confirmed or "pending".
