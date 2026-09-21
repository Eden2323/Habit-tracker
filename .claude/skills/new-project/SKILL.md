---
name: new-project
description: Create a new client or personal project the workflow way. Gathers the brief, sets up ClickUp, then runs tools/new-project.sh in the aianswers-workflow repo, which makes the folder in the right lane, the git repo with the right identity, the agent layer with the brief and hours config filled in, the Documents folder, the desktop map line and the private GitHub repo. Use when Eden says "new project", "set up a repo for", "onboard <client>", "start a project for", "we have a new client".
---

# New project

One conversation, one command, and the project is on GitHub with the same rules, hooks and recipes as every other repo. Local only: it creates folders on Eden's Desktop, so on a cloud session say so and stop.

## Steps

1. **Ask everything in one message.** Offer a default for each so Eden can answer in a line or two:
   - folder name (short, no spaces; becomes the GitHub repo name lower-cased)
   - client name as it appears in ClickUp, or "personal"
   - one-paragraph brief: what it does, who it is for, what "working" means
   - a sub-lane if the client already has one (`OptionX` holds Nexa and BusinessOS)
   - is there already a GitHub repo to start from (`owner/repo`), or is this new
   - contact first names for the calendar keywords (client projects only)
2. **ClickUp** (client projects only; skip for personal). Find the client's folder in the Development space with `clickup_get_workspace_hierarchy`. If there is none, ask, then `clickup_create_folder` and a list named after the project. Find the task that will take the weekly hours comment; if there is none, offer to create one called `Hours` in the project list and use its id. Never change any task's status.
3. **Run the script** from the workflow repo, all values on the command line:
   ```bash
   ~/Desktop/AIAnswers/aianswers-workflow/tools/new-project.sh <folder> \
     --client "<client>" --brief "<brief>" --keywords "<Client>, <name>, <name>" \
     --clickup-folder "<folder name>" --clickup-task <id> [--lane OptionX] [--clone owner/repo]
   ```
   Personal: `--personal` instead of the client, keywords and ClickUp flags. Add `--dry-run` first if anything about the inputs is unclear.
4. **Verify**: `git -C <path> log --oneline`, `gh repo view <owner>/<repo> --json isPrivate,deleteBranchOnMerge`, and that `.claude/hooks/*.sh` are executable. For a `--clone` start, the layer arrives on `chore/agent-layer` as a PR: watch `gh pr checks --watch` and merge it once green.
5. **Report** in four lines: the path, the GitHub URL, the ClickUp ids written into `agent/HOURS.md`, and "Open Claude in <path>; the session-start hook reads STATUS.md."

## Rules

- Client work goes to `AIANS-Tech` as `dev@aianswers.tech`; personal work goes to `Eden2323` as `edenhoward23@gmail.com`. Never the other way round.
- The repo exists on GitHub before the first working session. No project lives only on the laptop.
- Never put a secret in the scaffold. `.env` keys are referenced by name in `AGENTS.md`.
- The first working session confirms the brief, fills the Commands table in `AGENTS.md` and sets the first sprint in `STATUS.md`. This skill does not design the project.
