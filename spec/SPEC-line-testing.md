# Spec: Testing the review line on staging — V1

Status: proposed

## Objective

Before Scribbles' review line is trusted with anything, show on staging
that the whole chain works end to end, and measure how well it approves,
sends back and flags:

- the backend puts sentences in line and steps them (`reviewer/line.ts`);
- the worker on the VM reads them with the three local models (`worker/`);
- the hosted model answers what the line asks it, within its allowance,
  with contact details hidden (`reviewer/hosted.ts`);
- the decider settles each sentence (`reviewer/decide.ts`).

Who it's for: the owner, deciding whether to move from "suggest" toward
"decide". Success is a short report for each stage, with plain numbers,
and nothing a kid or teacher sees changed along the way.

Staging uses the practice database (ShowME-dev). Every sentence in these
tests is made up. No real student's writing is used.

## The stages

Each stage has a gate. The next stage starts only when the owner has read
its report and says go.

### Stage 1: Smoke test (about an hour)

Ten made-up sentences, one for each path through the decider, written by
a sample student on staging:

| # | Kind | Expected |
|---|---|---|
| 1 | Good writing | approve |
| 2 | Doesn't show the Tell | send back, detail tip |
| 3 | Misspelled | send back, spelling tip |
| 4 | A clear worrying phrase | teacher, no model asked |
| 5 | A quiet worry (no alarming words) | teacher, both models worried |
| 6 | Only one model is likely to worry | hosted model asked, then decided |
| 7 | Contact details (a phone number) | send back, private-details tip |
| 8 | Contact details and a worry | hosted model asked with the number hidden |
| 9 | Unkind about a named classmate | send back with a note for the teacher |
| 10 | Play ("hit me with a snowball") | not a worry |

Checks:
- every sentence is decided, and each matches the table;
- no line record holds words or an author;
- the hosted model's request for #8 had no phone number in it (the
  backend log line says "held back" or the test reads the saved request
  size; see Open Questions);
- times: from writing to decided, per sentence, and the worker's model
  loads.

### Stage 2: The made-up set, end to end (overnight)

The same 541 made-up sentences the CI score uses
(`reviewer/eval/decideSet.ts`), put on staging as sample students'
sentences, read by the real worker and the real hosted model.

Checks:
- **Same answers as CI.** At temperature 0 the VM's models should give
  the CI run's answers. Count how many answers differ, per model. A few
  are expected; many means the VM setup differs.
- **Checkpoint A again,** now with real hosted answers: 0 wrong
  approvals, 0 real worries missed or let go, hosted under 1 in 8.
- **Every outcome listed:** approved, sent back, sent back with a note,
  teacher, still waiting. Nothing still waiting after 24 hours.
- **The allowance:** hosted questions asked, Neurons used per question
  (from Cloudflare's dashboard), and whether the 100-a-day cap was hit.
- **Throughput:** sentences settled per hour.

The set has about 200 worries on purpose, so its hosted share is higher
than a real class's. It may take two days to get through within the
allowance; that is fine.

### Stage 3: Things going wrong (an hour, with the owner)

Each one is done on purpose while a few sentences wait. The expected
result is always the same: sentences wait, nothing is decided wrongly,
and the line carries on by itself once it's fixed.

| Drill | How | Expected |
|---|---|---|
| Worker stopped mid-batch | `sudo systemctl stop scribbles-worker` for 20 min | its claims expire after 15 min; nothing decided meanwhile; carries on after start |
| Ollama stopped | `sudo docker stop ollama` | worker logs `model-not-answering`; no failed tries counted against sentences |
| A model missing | rename one in the worker's settings | worker logs `model-missing`; sentences wait at that model |
| A student edits mid-read | edit a waiting sentence | old answers thrown away; new words read from the start |
| A teacher decides first | approve a waiting sentence by hand | taken out of the line, no suggestion saved |
| Hosted model refused | a wrong Cloudflare token on staging, briefly | line stops asking; worries reach a teacher after an hour |
| VM restarted | `sudo reboot` | Ollama and the worker come back by themselves |

### Stage 4: A week of "suggest" with teachers (a week)

Staging teachers decide as usual, with Scribbles' suggestion on each card
(spec `SPEC-teacher-suggestions.md`). A weekly report compares what the
line would have done with what the teacher did, using the decisions
already saved (`models/reviewDecisions.ts`), as the shadow report does for
the old reviewer (`.github/workflows/shadow-report.yml`).

Checks:
- agreement: approve vs approve, send back vs send back, and every case
  where Scribbles would have approved and the teacher sent back (the
  number that matters most);
- every teacher-only outcome, and whether the teacher agreed it needed
  them;
- nothing waited more than 2 hours.

## Before Stage 1: two things to settle

1. **The old reviewer shares the free allowance.** In "suggest" mode the
   old path (`reviewer/queue.ts`) also reviews every waiting sentence with
   Cloudflare, at about 90 Neurons each. With the made-up set waiting, it
   would use the day's 10,000 in a couple of hours and leave none for the
   line. Proposed: during these tests, pause it from the Teacher page's
   Scribbles switch. That switch pauses only the old path; the line keeps
   running. (Taking the old path out is T12.)
2. **The made-up set's words on staging.** They're made up and some are
   meant to be upsetting (that's what tests the worry checks). They'd sit
   in staging's Teacher page queue. Proposed: put them under a few clearly
   named sample students, and clear them with the seed workflow's
   "old_sentences: delete" afterwards.

## Commands

```
Backend tests:     cd backend && npx vitest run
Rules score:       cd backend && npm run score:rules
CI decider score:  Actions → "Score the decider" → Run workflow
Worker status:     systemctl status scribbles-worker --no-pager
Worker log:        journalctl -u scribbles-worker -n 50 --no-pager
```

New, to build:
```
Put a set on staging:   Actions → "Line test on staging" → Run workflow (set: smoke | decide-set)
Report on it:           the same workflow with report: yes
```

## Project structure

- `backend/scripts/line-test.ts`: puts a set on staging under sample
  students, and reports on it (reads `ReviewLine` and `HostedUsage`,
  never prints a sentence's words, only row numbers and outcomes).
- `backend/reviewer/eval/smokeSet.ts`: the ten Stage 1 sentences.
- `.github/workflows/line-test.yml`: runs the script against staging only,
  like `seed-staging.yml` (its login can only reach the practice
  database).
- Reports go in the workflow's run summary.

## Testing strategy

- The script is tested with vitest against the in-memory database, like
  `reviewLineKeeper.test.ts`: it puts a set in, settles some by hand, and
  checks the report's counts.
- The stages themselves are the test of the live system.

## Boundaries

- Always: made-up sentences only; staging only; reports with row numbers
  and outcomes, never words; the owner reads each stage's report before
  the next.
- Ask first: changing `STAGING_REVIEWER_MODE` (the owner does it);
  pausing the old reviewer; any drill that touches the VM; putting the
  made-up set on staging.
- Never: production; changing `PRODUCTION_REVIEWER_MODE`; "decide" mode;
  real students' writing; a VM address or name in the repository.

## Success criteria

- Stage 1: all ten decided as the table says, within an hour.
- Stage 2: Checkpoint A holds with real hosted answers; VM answers match
  CI's on at least 98% of questions; nothing waits over 24 hours.
- Stage 3: every drill ends with no wrong decision and no manual cleanup
  beyond the fix itself.
- Stage 4: no case where Scribbles would have approved a sentence the
  teacher found worrying; the rest reported for the owner to judge.

## Out of scope (deferred)

- Production. A separate decision once these stages pass.
- "Decide" mode, auto-decisions and undo. A later spec.
- The `watch` workflow that opens issues when the line is stuck (T13).
  Stage 3 checks the same things by hand.
- Load beyond one class. Measured in Stage 2's throughput, not tested
  harder.

## Open questions

1. Pause the old reviewer during the tests (proposed), or leave both
   running and accept the line may run out of Neurons?
2. Is it OK to put the 541 made-up sentences, including the upsetting
   ones, on staging for a day or two, under sample students?
3. Stage 4 needs teachers using staging. Is that you alone, or others?
4. Checking that #8's request had the number hidden: the backend logs no
   words. Enough to trust the unit test plus "the hosted model was asked",
   or add a debug count of "[hidden]" marks to the log line?
