# Capability Map: Scribbles on staging

Two pieces of work, each with its own spec, so each can be checked and
shipped on its own.

| Module id | What it is | Depends on |
|---|---|---|
| line-testing | Prove the whole review line works on staging, and measure how well it approves and flags | the merged line (#262–#267), the VM worker |
| teacher-suggestions | Show the line's decision on each Teacher page card, in small parts that are easy to add or remove | line-testing's first stage (the line must be filling) |

Build order: line-testing stage 1 → teacher-suggestions → line-testing stages 2–4.

The Teacher page part needs the line to be deciding real staging sentences
before it has anything to show, and the later test stages are easier to
read once teachers can see each decision.
