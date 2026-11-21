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
