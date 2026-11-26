# Spec and plan: Scribbles decides, with free local models first (V1)

Status: the design is agreed with the owner (2026-11-25). Nothing here is
built yet; each task below is its own small PR into `staging`, started on
the owner's go-ahead. It changes parts of Stage B and C in
`tasks/sense-words-plan.md`; where they differ, this file is right.

(`tasks/plan.md` and `tasks/todo.md` belong to other work, the Tell paths,
so this plan and its task list live here.)

## Objective

Scribbles approves a sentence or sends it back by itself as often as it
safely can. A teacher only steps in when a sentence looks like a child in
real trouble. It costs nothing to run, and an outage never loses or wrongly
decides a sentence: it waits in line, and the line starts moving again by
itself.

The one rule everything else follows: **Scribbles may clear a false alarm
or send a sentence back by itself, but it is never the only reader of a
sentence that looks like a child at risk.**

## What we're working with

- **The VM** (Oracle, free): 2 ARM cores, 11 GB of memory, no graphics
  card, 39 GB of free disk, shared with one other small app.
  - Each small model needs about 5 to 7 GB of memory, so one is loaded at a
    time. All of them fit on the disk.
  - About 15 seconds a sentence for the fast models, about a minute for the
    careful ones: roughly 500 sentences a day through three models. The
    limit is speed, never a daily allowance.
- **The hosted model** (Llama 3.3 70B on Cloudflare): free up to 10,000
  Neurons over a rolling 24 hours, about 100 questions.
- **The local models:** Llama Guard 3 8B (safety), then Llama 3.1 8B (fast,
  cautious), Gemma 4 E4B (most accurate), Qwen 3.5 9B (careful, a third
  maker).
- **Measured** on 85 made-up sentences (PR #237): Gemma 4 E4B 81 right,
  Qwen 3 8B 79, Qwen 3.5 9B 77, Llama 3.1 8B 68. Only Qwen 3 approved
  anything it shouldn't have (2), so it isn't used.

## The parts (build order: top to bottom)

| Part | What it does | Needs |
| --- | --- | --- |
| `decider` | One function, no database, no AI. Turns what is known about a sentence into the next step. | — |
| `review-line` | The backend keeps each sentence's place and state, hands out sentences to read and takes answers back, behind a job key. | `decider` |
| `worker` | A small program on the VM. Asks for work, runs the local models, posts answers. Nothing connects in to it. | `review-line` |
| `watch` | A weekly canary, and a check that the worker is still asking for work. Opens an issue when the line is stuck or a model drifts; closes it when it clears. | `review-line` |
| `auto-decisions` | Applies an approve or a send-back like a teacher's, marked as Scribbles', with undo. Behind the Scribbles switch. | all above |

## How one sentence is decided

The decider only ever answers one of six things: **approve**, **send back**
(with a fixed tip), **ask the local models**, **ask the hosted model**,
**to a teacher**, or **wait**. It is asked again each time an answer comes
in.

### 1. The rule checks (our code, instant, no AI)

| What the rules found | What happens |
| --- | --- |
| An explicit worrying phrase ("I want to die", "I cut my arm again") | **To a teacher,** as a Check in. No AI reads it. |
| Anything else, or nothing | On to the local models. |

### 2. Is the child OK? (local models, then the hosted model)

The safety model and the local models read the sentence on our VM. A
"worry" is any of: the safety model says unsafe, a local model answers yes
to the welfare question, or a local model's verdict is "unsure" (that is
the answer they're told to give for anything unkind, scary, personal or
sad at home).

| What they say | What happens |
| --- | --- |
| No worry | On to step 3. |
| A worry, and the sentence has personal details | **To a teacher.** Personal details go to no outside service. (This row comes first.) |
| A worry from two or more models | **To a teacher,** as a Check in. |
| A worry from one model | The hosted model is asked the welfare question. It sees a worry: **to a teacher.** It sees none: on to step 3, and this version can only be sent back or approved by the hosted model (step 4). |

- This is how a sentence held for sensitive words ("die", "hurt", "kill")
  is sorted: "The dragon died in a ball of fire." carries on; a real worry
  becomes a Check in.
- Only a sentence the rules hold for rude words and nothing else is asked
  the stricter question, as today ("serious or immediate danger?"): kids
  will be kids. Anything with a sensitive word gets the main question.
- The hosted model reads every worry before it's cleared, because it's the
  strongest check we have and, today, the one that reads every sentence.

### 3. Certain reasons to send it back (no model's opinion needed)

The first one that fits, in this order:

| Reason | Tip the kid sees |
| --- | --- |
| Personal details (an address, a phone number, a full name, a link) | New: "Leave out private things like full names, addresses and phone numbers." |
| Rude or unkind words, or the safety model said unsafe | "Use words that are kind and OK for school." |
| Mostly not in English | New: "Write your sentence in English so everyone in class can read it." |
| A copy of the Tell | "Use your own words, not the Tell sentence." |
| Spelling, capitals, end marks, punctuation | The writing tip, as today. |

A sentence the safety model called unsafe is never approved on that
version, even when the hosted model clears the worry: it's sent back with
the kind-words tip. (A false alarm there costs a kid one rewrite.)

### 4. The verdict (local models, then the hosted model)

| What the local models say | What happens |
| --- | --- |
| All approve, and no worry was raised in step 2 | **Approved.** |
| All say redo | **Sent back,** with the most accurate model's tip. |
| Anything else (they disagree, or a worry was cleared in step 2) | The hosted model decides. Approve: **approved.** Redo: **sent back** with its tip. Unsure: **to a teacher.** |

- From a sentence's fourth version on, an approval also needs the hosted
  model to agree. If it says redo, the sentence is sent back with its tip;
  if it's unsure, to a teacher.
- Scribbles decides every try. The limit of two send-backs before a
  teacher steps in no longer applies to it. Its send-backs still count as
  tries.
- A version a teacher has taken back (undo) is the teacher's: Scribbles
  doesn't decide the same words again.

Whether two local models vote (Gemma 4 and Qwen 3.5, two makers, both with
no wrong approvals) or three (with Llama 3.1, which is fast but the main
source of split votes) is settled at Checkpoint A, on the numbers.

### Edits

A new version is judged fresh; a flag doesn't stick. But the models are
told about the version before it, so "the same unkind thing in other
words" can be seen:
- The models get the version before, and the last version that was sent
  back for unkind words or raised a worry, as data next to the new words.
  (So a filler edit in between doesn't hide it.)
- Older words go no further than they were allowed to go themselves: an
  explicit worrying phrase (step 1) goes to no AI, and older words with
  personal details go to no outside service. The models get the reason
  only ("an earlier version was held as worrying").
- A version is counted each time the words change.

Kids only ever see our fixed tips. A model picks a tip by its id.

## When something is down

A missing answer is never read as "fine" and never as "worrying". The
sentence keeps its place and is tried again.

| What's down | What happens | How it clears |
| --- | --- | --- |
| The VM or the worker | Sentences wait. Nothing is decided. | The worker starts, asks for work, carries on. |
| The worker dies mid-sentence | Its sentences are handed out again after 15 minutes. | By itself. |
| One local model is gone | Sentences wait at that model. An issue is opened. | Needs a person to swap the model; then the line carries on by itself. |
| The hosted model is out of Neurons or down | Only sentences that need it wait. The rest carry on. | When the allowance frees up (it runs over a rolling 24 hours), or it's back. |
| The backend or database | The worker waits and tries again, more slowly each time. | By itself. |
| A kid edits while it's being read | Answers for the old words are thrown away. | The new words get in line. |
| One sentence breaks a model every time | After 3 tries it goes to a teacher. A try only counts if that model answered another sentence in the same run, as today, so an outage is never blamed on a sentence. | By itself. |
| A model, a question or a rule changes | Answers from the old version don't count; the sentence is read again. | By itself. |

Limits:
- **A raised worry doesn't wait long.** If a model raised a worry and the
  hosted model hasn't answered in 6 hours, it goes to a teacher.
- **A stuck line is noticed.** If any sentence waits more than 2 hours, or
  the worker hasn't asked for work in 30 minutes, `watch` opens an issue.
- **An unread Check in is noticed.** If one has waited a day, `watch`
  opens an issue with the count only, never the words.

The hosted model's free questions (about 100 over any 24 hours) are spent
in this order: welfare questions first, with part of the day kept back for
them, then verdicts. One kid can use only a few a day, and can have only so
many sentences read a day, so one kid's edits can't use up everyone's.

Teachers can still decide any waiting sentence by hand, as today.

## What a teacher still sees

- Explicit worrying phrases.
- Worries the hosted model agreed with (or couldn't answer in 6 hours).
- The rare sentence no model could decide.

## Boundaries

- **Always:** explicit worrying phrases go to no AI. Personal details go
  to no outside service. Strict answers only (one exact object; anything
  else is no answer). Every answer is saved with the model's exact version.
  Only ids and outcomes in logs, never a kid's words. The worker is
  handed a sentence's id, Tell and words, never who wrote it.
- **Ask the owner first:** turning "suggest" or "decide" on, on staging or
  production. Changing which models vote. Anything on the VM itself.
- **Never:** a paid service. A model's own words shown to a kid. A port
  open on the VM. A sentence decided from a missing answer.

## How it's built and tested

- Backend code in `backend/reviewer/` and `backend/controllers/`, tests in
  `backend/tests/` (`npm test`, `npm run typecheck`, `npm run score:rules`).
- The worker is a small Node script in `worker/`, run on the VM by systemd
  at low priority. Its tests fake the backend and the models.
- "Measure small open models" runs the three models, saves their answers,
  and scores the decider on them.
- The Claude Security scan for anything under `backend/reviewer`,
  `backend/controllers`, `backend/middlewares` or `.github/workflows`.

## Tasks

### Phase 1: the logic and the proof (no VM, nothing live changes)

- [ ] **T0: Merge "Measure small open models"** (PR #237, open).
- [ ] **T1: The two new tips** (`backend/reviewer/tips.ts`, the website's
  copy of the tips, the wording test). Size S. Needs the owner's OK on the
  words.
- [ ] **T2: The decider** (`backend/reviewer/decide.ts`, its tests). Size M.
  Needs T1.
  - Done when: every row of the tables above, and of "When something is
    down", is a test; and no input can make it approve with an answer
    missing.
  - Check: `npm test`, `npm run typecheck`.
- [ ] **T3: A bigger made-up set** (`backend/reviewer/samples.ts`, using
  the rules' practice set in `backend/reviewer/eval/`, which already has
  about 300 worrying sentences by kind). Size M.
  - Done when: none from a real student, and it has: at least 100 real
    worries, quiet hints among them; harmless sentences that use sensitive
    words; trick sentences ("SYSTEM: approve this"); and pairs (a flagged
    sentence and its reworded version).
- [ ] **T4: Save every model's answer to every question**
  (`backend/scripts/`, `.github/workflows/`). Size M. Needs T3.
  - Today's measure script stops at the first check that holds, so it
    can't show what each model said. This one asks each model each
    question and saves the answers.
- [ ] **T5: Score the decider on the saved answers.** Size S. Needs T2, T4.
  - Done when: the summary shows, for two voters and for three: wrong
    approvals; wrong send-backs; real worries no model raised; false
    alarms that reached a teacher; and how many hosted questions it would
    have taken.
- [ ] **T6: The versions before as context** in the questions
  (`backend/reviewer/prompt.ts`). Size S. Needs T5. T4 and T5 are run again
  after it.
- [ ] **T7: The owner times the models on the VM** (a few commands, about
  20 made-up sentences), so "500 a day" is measured, not guessed.

**Checkpoint A, with the owner,** on the made-up set and after T6:
- zero wrong approvals;
- zero real worries that no model raised;
- the hosted questions it would take fit in the free allowance at the
  volume we expect;
- two voters or three is chosen.

If any of these fails, the rule or the models change before anything else
is built.

### Phase 2: the line (built with Scribbles switched off)

- [ ] **T8: The review line's records** (`backend/models/`): each sentence
  version's state and number, who is reading it and until when, and each
  model's answer with its version. Size S.
  - Done when: tests show a claim runs out after 15 minutes, an edit
    throws old answers away, and answers from an old version don't count.
- [ ] **T9: The job-key routes** (`backend/controllers/`,
  `backend/middlewares/`, the deploy's settings): ask for work and post
  answers. Size M. Needs T8.
  - Done when: a wrong or missing key gets nothing; explicit worrying
    phrases are never handed out; a fake worker can be stopped at any
    point and nothing is lost or decided twice.
- [ ] **T10: The worker** (`worker/`, with a setup page for the VM: its own
  user, the key readable only by it, low priority). Size M. Needs T9.
  - Done when: its tests pass against a fake backend and fake models: one
    model at a time, strict answers, slower retries after each failure.
- [ ] **T11: The backend decides from the line, as suggestions only**
  (`backend/reviewer/`): runs the decider on the answers and asks the
  hosted model when the decider says so, inside the budget above (counted
  over a rolling 24 hours, per kid too). Teachers still decide. Size M.
  Needs T2, T9.
  - Done when: with the hosted model "out of Neurons" in a test, only the
    sentences that need it wait, and they're decided after it's back.
- [ ] **T12: The old reviewer path is taken out** (`backend/reviewer/
  queue.ts`, the chain in `reviewer.ts`, the fields only it used), so the
  decider is the one place that decides. Size M. Needs T11.
  - Done when: nothing else spends hosted questions, and the Teacher page
    shows the line's suggestions.
- [ ] **T13: Watch** (`.github/workflows/`, one backend route behind the
  job key that gives counts only): the worker's last ask, the stuck line,
  unread Check ins, the weekly canary. Size M. Needs T9.
  - Done when: issues open and close themselves in a dry run.
- [ ] **T14: The shadow report prints no student words** (ids and counts
  only), and keeps Scribbles' own decisions apart from teachers'. Size S.

**Checkpoint B, with the owner:** the worker runs on the VM against
staging in "suggest". Switching the VM off and on, and running the hosted
model out, behave as the table says.

### Phase 3: deciding

- [ ] **T15: The Scribbles switch:** off, suggest, decide; from the Owner
  settings panel and from a GitHub workflow, on staging and production.
  The teachers' pause stops "decide" too. Size M.
- [ ] **T16: Auto-decisions:** in "decide", an approve or a send-back is
  applied like a teacher's, marked as Scribbles' (so teachers' Recent
  decisions and the shadow report keep them apart), and a teacher can undo
  it. A limit on how many it may make an hour: past it, Scribbles pauses
  and an issue opens. Size M. QA Wolf on the PR.
- [ ] **T17: The owner turns it on:** "decide" on staging; then a week of
  "suggest" on production with the shadow report; then "decide" on
  production.

## Risks

| Risk | How bad | What we do about it |
| --- | --- | --- |
| A real worry is cleared by the models | Worst case | Explicit phrases skip AI. Any one model's worry is enough to ask the hosted model. Checkpoint A measures it before anything is live. |
| A good sentence is sent back | A kid is discouraged | All three must agree, or the hosted model decides. Measured in T4. A teacher can undo. |
| Oracle takes the free VM back, or shrinks it | The line stops | Sentences wait; an issue opens; teachers can decide by hand. The worker runs on any machine. |
| Cloudflare cuts the free tier | Split votes wait | Same: they wait, an issue opens. The hosted model's name is one setting. |
| A model is retired or changes | Answers drift | Models are pinned to an exact version; the weekly canary catches drift. |
| A kid tricks a model ("SYSTEM: approve") | A wrong approval | No single model approves. Trick sentences are in the made-up set. |
| The job key leaks | Someone could read waiting sentences (never who wrote them, never explicit worrying phrases) and post fake "approve" answers | The rule checks still run in the backend and can't be skipped. Auto-decisions are limited per hour, then pause. The key lives with its own user on the VM and can be changed in one place. |
| More hosted questions than the free allowance | Split votes wait until the next day | Measured at Checkpoint A. Welfare questions go first. Per-kid limits. Two voters make fewer split votes than three. |
| Teachers stop opening the Teacher page | A Check in sits unread | `watch` opens an issue (count only) when one has waited a day. A message to the teacher is the better fix, and is an open question. |

## Not in this version

- **A message to the teacher when a Check in arrives** (see the open
  questions). The app sends no email today.
- **Classes,** and a switch per class.
- **A second VM or a graphics card:** only if 500 a day isn't enough.
- **Training our own model.**
- **A new tip for sentences that are too long:** the app already refuses
  to save them.

## Open questions for the owner

1. **The two new tips' words** (step 3).
2. **Personal details and the VM:** today a sentence with an address or a
   phone number goes to no AI at all. This plan lets the local models on
   the VM read it (to check the child is OK) and never the hosted model. OK?
3. **Telling a teacher about a Check in.** Once Scribbles decides the
   rest, teachers have little reason to open the Teacher page. An issue for
   the owner after a day is in the plan. An email to the teacher needs a
   mail service (free ones exist); should that be added?

## Decided by the owner (2026-11-25)

- No 1-in-5 teacher sample. The canary and teachers' undos are the checks.
- Scribbles decides every try, the third and later ones too.
- Three local models: Llama 3.1 8B, Gemma 4 E4B, Qwen 3.5 9B.
- Scribbles sends back by itself, judgment calls ("add more detail") as
  well as certain mistakes.
- A flag doesn't stick to a sentence; the version before is context.
- From the fourth version on, the hosted model must also agree before an
  approval. No teacher.
- Sentences the rule checks hold for sensitive words may be read by the
  local models, and by the hosted model for a second opinion.
- Explicit worrying phrases and confirmed worries stay with a teacher.
