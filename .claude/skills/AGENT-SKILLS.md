# Agent skills

The skills in this folder, and the files in `.claude/commands`, `.claude/agents`
and `.claude/references`, come from
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
at commit 8c99fa3 (v0.6.17), under the MIT license (AGENT-SKILLS-LICENSE).

They are committed here so every Claude Code session on this repo, local or
cloud, loads them. The one change from upstream: the plugin's
`agent-skills:<name>` skill names are plain `<name>`, since they are project
skills here, not a plugin.

To update: clone the repo again, copy `skills/*`, `.claude/commands/*`,
`agents/*` and `references/*` over these, and drop the `agent-skills:`
prefix again (`sed -i 's/agent-skills:\([a-z-]\)/\1/g'`).

## Also here: web-design-guidelines

`.claude/skills/web-design-guidelines` comes from
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) at commit
5a37a63 (MIT, per its README). Its rules file `references/command.md` is the
pinned snapshot the skill names (SHA-256 d246b026…e0234, checked on download).
The one change: a "Show ME house rules" section at the end of its SKILL.md.

## Also here: ponytail

`.claude/skills/ponytail` is the main skill file from
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) at commit
ebd8654 (v5.3.3), under the MIT license (PONYTAIL-LICENSE). It nudges a
session toward the smallest change that fully solves the task.

Only that one file is here, on purpose. The plugin's hooks (they run on every
session start and every message, keep a ledger in `~/.config/ponytail`, and can
post to a webhook) and its other skills are left out. Don't turn the plugin on
in `.claude/settings.json`.

The one change: a "Show ME house rules" section at the end of its SKILL.md,
which sets the level to `lite`.
