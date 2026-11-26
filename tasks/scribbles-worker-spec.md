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

Two rules everything else follows:
- **The local models do the reading.** When they agree, that's the answer.
  The hosted model is only asked when they disagree, and then it has the
  last word.
- **A teacher is only asked about a child who may be in trouble:** an
  explicit worrying phrase, or a worry every reader shares or the hosted
  model confirms.

## What we're working with

- **The VM** (Oracle, free): 2 ARM cores, 11 GB of memory, no graphics
  card, 39 GB of free disk, shared with one other small app.
  - Each small model needs about 5 to 7 GB of memory, so one is loaded at a
    time. All of them fit on the disk.
  - About 15 seconds a sentence for the fast models, about a minute for the
    careful ones: roughly 700 sentences a day through the two reading
    models (a guess until T7 times it). The
    limit is speed, never a daily allowance.
- **The hosted model** (Llama 3.3 70B on Cloudflare): free up to 10,000
  Neurons over a rolling 24 hours, about 100 questions.
- **The local models:** Llama Guard 3 8B (safety only), Gemma 4 E4B
  (Google, the most accurate) and Qwen 3.5 9B (Alibaba, careful). The last
  two each answer the welfare question and give a verdict.
- **Measured** on 85 made-up sentences (PR #237):

  | | Right | Wrong approvals | Harmless ones held as worrying | No answer |
  | --- | --- | --- | --- | --- |
  | Gemma 4 E4B | 81 | 0 | 2 | 0 |
  | Qwen 3.5 9B | 77 | 0 | 4 | 0 |
  | Qwen 3 8B | 79 | 2 | 2 | 0 |
  | Llama 3.1 8B | 68 | 0 | 9 | 4 |

  (A hold there came from that model's welfare answer or from the safety
  model, which ran with each; T4 will tell them apart.)

  - **Llama 3.1 8B is out.** It had 9 harmless sentences held as worrying and
    gave no usable answer on 4, so it would start most of the
    disagreements, and each one costs a hosted question. It's also Meta's,
    like the safety model and the hosted model.
  - **Qwen 3 8B is out:** the only one that approved what it shouldn't.
  - Gemma 4 and Qwen 3.5 gave different answers on about 7 of the 63
    sentences that reached them: about 1 in 9. That is the share the hosted
    model would be asked about. T5 measures it properly.

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

### 2. Is the child OK? (three local readers)

Three readers on our VM each say worry or no worry: the safety model
("unsafe" is a worry), and Gemma 4 and Qwen 3.5 on the welfare question.

| What the three say | What happens |
| --- | --- |
| None sees a worry | On to step 3. |
| All three see a worry | **To a teacher,** as a Check in. |
| They disagree | The hosted model has the last word (see "When the hosted model is asked"). |

- This is how a sentence held for sensitive words ("die", "hurt", "kill")
  is sorted: "The dragon died in a ball of fire." carries on; a real worry
  becomes a Check in.
- Only a sentence the rules hold for rude words and nothing else is asked
  the stricter question, as today ("serious or immediate danger?"): kids
  will be kids. Anything with a sensitive word gets the main question.

### 3. Certain reasons to send it back (no model's opinion needed)

The first one that fits, in this order:

| Reason | Tip the kid sees |
| --- | --- |
| Personal details (an address, a phone number, a full name, a link) | New: "Leave out private things like full names, addresses and phone numbers." |
| Rude or unkind words | "Use words that are kind and OK for school." |
| Mostly not in English | New: "Write your sentence in English so everyone in class can read it." |
| A copy of the Tell | "Use your own words, not the Tell sentence." |
| Spelling, capitals, end marks, punctuation | The writing tip, as today. |

(An "unsafe" from the safety model is a worry, so it's settled in step 2,
by all three readers or by the hosted model.)

### 4. The verdict (two local models)

Gemma 4 and Qwen 3.5 each say approve, redo (with a tip) or unsure. For
them "unsure" means "not for the gallery": unkind, scary, about romance,
and so on.

| What the two say | What happens |
| --- | --- |
| Both approve | **Approved.** |
| Both say redo | **Sent back,** with Gemma 4's tip. |
| Both are unsure | **Sent back** with "Use words that are kind and OK for school." |
| They disagree | The hosted model has the last word. |

- Scribbles decides every try. The limit of two send-backs before a
  teacher steps in no longer applies to it. Its send-backs still count as
  tries.
- A version a teacher has taken back (undo) is the teacher's: Scribbles
  doesn't decide the same words again.

### When the hosted model is asked

Only on a disagreement in step 2 or step 4, and from a sentence's fourth
version on before an approval. It is asked both questions about that
sentence, and what it says is final:

| The hosted model says | What happens |
| --- | --- |
| A worry about the child | **To a teacher,** as a Check in. |
| No worry, approve | **Approved.** |
| No worry, redo | **Sent back** with its tip. |
| No worry, unsure | **Sent back** with the kind-words tip. |

- A sentence with personal details is never sent to it. If the local
  readers disagree about a worry on one of those: **to a teacher.**
- If it can't answer, the sentence waits (see below).

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
- **A raised worry doesn't wait long.** If the local readers disagreed
  about a worry and the hosted model hasn't answered in 6 hours, it goes to
  a teacher.
- **A stuck line is noticed.** If any sentence waits more than 2 hours, or
  the worker hasn't asked for work in 30 minutes, `watch` opens an issue.
- **An unread Check in is noticed.** If one has waited a day, `watch`
  opens an issue with the count only, never the words.

The hosted model's free questions (about 100 over any 24 hours, so about
50 sentences) go to worry disagreements first, with part of the day kept
back for them, then to verdict disagreements. One kid can use only a few a day, and can have only so
many sentences read a day, so one kid's edits can't use up everyone's.

Teachers can still decide any waiting sentence by hand, as today.

## What a teacher still sees

- Explicit worrying phrases.
- Worries all three local readers share.
- Worries the hosted model confirms (or couldn't answer in 6 hours).
- The rare sentence that breaks a model every time.

Nothing else. "Not sure it's OK for the gallery" is always a send-back,
never a teacher.

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
- "Measure small open models" runs the local models, saves their answers,
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
  - Done when: the summary shows wrong approvals; wrong send-backs; real
    worries no local reader raised; how many sentences went to a teacher
    that didn't need to; and how many went to the hosted model.
- [ ] **T6: The versions before as context** in the questions
  (`backend/reviewer/prompt.ts`). Size S. Needs T5. T4 and T5 are run again
  after it.
- [ ] **T7: The owner times the models on the VM** (a few commands, about
  20 made-up sentences), so "500 a day" is measured, not guessed.

**Checkpoint A, with the owner,** on the made-up set and after T6:
- zero wrong approvals;
- zero real worries that no local reader raised;
- no more than about 1 sentence in 8 goes to the hosted model;
- almost nothing harmless goes to a teacher.

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
| A real worry is missed: all three local readers say "no worry" | Worst case. Today the hosted model reads every sentence for this; here it only reads disagreements. | Explicit phrases skip AI and go to a teacher. One reader's worry is enough to bring in the hosted model. Checkpoint A must show no made-up worry gets past all three before anything is live, and the weekly canary keeps checking. |
| A good sentence is sent back | A kid is discouraged | Both models must agree, or the hosted model decides. Measured in T5. A teacher can undo. |
| Oracle takes the free VM back, or shrinks it | The line stops | Sentences wait; an issue opens; teachers can decide by hand. The worker runs on any machine. |
| Cloudflare cuts the free tier | Split votes wait | Same: they wait, an issue opens. The hosted model's name is one setting. |
| A model is retired or changes | Answers drift | Models are pinned to an exact version; the weekly canary catches drift. |
| A kid tricks a model ("SYSTEM: approve") | A wrong approval | No single model approves. Trick sentences are in the made-up set. |
| The job key leaks | Someone could read waiting sentences (never who wrote them, never explicit worrying phrases) and post fake "approve" answers | The rule checks still run in the backend and can't be skipped. Auto-decisions are limited per hour, then pause. The key lives with its own user on the VM and can be changed in one place. |
| More disagreements than the free allowance covers | Those sentences wait until the next day | Measured at Checkpoint A. Worries go first. Per-kid limits. If it's too many, a third local model can break ties (T5 can score that from the saved answers). |
| Teachers stop opening the Teacher page | A Check in sits unread | `watch` opens an issue (count only) when one has waited a day. A message to the teacher is the better fix, and is an open question. |

## Not in this version

- **A message to the teacher when a Check in arrives** (see the open
  questions). The app sends no email today.
- **Classes,** and a switch per class.
- **A second VM or a graphics card:** only if the VM is too slow.
- **Training our own model.**
- **A new tip for sentences that are too long:** the app already refuses
  to save them.

## Decided by the owner (2026-11-25)

- No 1-in-5 teacher sample. The canary and teachers' undos are the checks.
- Scribbles decides every try, the third and later ones too.
- Two local models give verdicts: Gemma 4 E4B and Qwen 3.5 9B. Llama 3.1
  8B is out (too many false worries and unusable answers).
- The hosted model is only asked when the local readers disagree, and a
  teacher only about a child who may be in trouble.
- The two new tips' words are agreed.
- Sentences with personal details may be read by the local models on the
  VM, never by the hosted model.
- No message to teachers about a Check in for now.
- Scribbles sends back by itself, judgment calls ("add more detail") as
  well as certain mistakes.
- A flag doesn't stick to a sentence; the version before is context.
- From the fourth version on, the hosted model must also agree before an
  approval.
- Sentences the rule checks hold for sensitive words may be read by the
  local models, and by the hosted model for a second opinion.
- Explicit worrying phrases and confirmed worries stay with a teacher.
