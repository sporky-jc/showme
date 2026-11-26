# Spec: Scribbles decides, with free local models first (V1)

Status: proposed, waiting for the owner's go-ahead. Nothing here is built.
It changes parts of Stage B and C in `tasks/sense-words-plan.md`; that plan
is updated once this is approved.

## Objective

Scribbles approves a sentence or sends it back by itself as often as it
safely can. A teacher only steps in when something is really worrying.
It costs nothing to run, and an outage never loses or wrongly decides a
sentence: it waits in line, and the line starts moving again by itself.

Who it's for: kids get an answer in minutes, not when a teacher next logs
in. Teachers only see Check ins.

## What we're working with

- **The VM** (Oracle, free): 2 ARM cores, 11 GB of memory, no graphics
  card, 39 GB of free disk, shared with one other small app.
  - Each small model needs about 5 to 7 GB of memory, so one is loaded at a
    time. All of them fit on the disk.
  - One model answers at a time on 2 cores: about 15 seconds a sentence for
    the fast models, about a minute for the careful ones.
  - So: roughly 500 sentences a day through three models. The limit is
    speed, never a daily allowance.
- **The hosted model** (Llama 3.3 70B on Cloudflare): free up to 10,000
  Neurons a day, about 100 questions. It resets at midnight UTC.
- **Measured** on 85 made-up sentences (PR #237): Gemma 4 E4B 81 right,
  Qwen 3 8B 79, Qwen 3.5 9B 77, Llama 3.1 8B 68. Only Qwen 3 approved
  anything it shouldn't have (2).

## The parts (build order: top to bottom)

| Part | What it does | Needs |
| --- | --- | --- |
| `review-line` | The backend hands out sentences to read and takes answers back, behind a job key. Keeps each sentence's place and state. | — |
| `worker` | A small program on the VM. Asks for work, runs the local models, posts answers. Nothing connects in to it. | `review-line` |
| `decider` | Our code in the backend. Turns the answers into: approve, send back, ask the hosted model, Check in, or keep waiting. | `review-line` |
| `auto-decisions` | Applies an approve or a send-back like a teacher's, marked as Scribbles', with undo. Behind the Scribbles switch. | `decider` |
| `watch` | A heartbeat and a weekly canary. Opens an issue when the line is stuck or a model drifts; closes it when it clears. | `review-line` |

## How one sentence is decided

Every step can stop a sentence. No single model can approve one.

1. **Rule checks** (our code, instant, no AI). Worrying, sensitive or
   personal: to a teacher, and to no AI. As today.
2. **Safety model** (Llama Guard, on the VM). Unsafe: Check in.
3. **Welfare question,** to each local model.
   - All say no concern: go on.
   - Any says concern: the hosted model is asked. It agrees: Check in. It
     says no concern: go on.
4. **Certain mistakes** (our code: spelling, capitals, end marks, a copy of
   the Tell, rude words). Sent back with the fixed tip. No model is asked.
5. **The verdict,** from each local model, fastest first.
   - All approve: **approved.**
   - All say redo: **sent back,** with the most careful model's tip.
   - They disagree, or one is unsure: the hosted model decides.
6. **Scribbles decides every try** (decided 2026-11-25). The limit of two
   send-backs before a teacher steps in no longer applies to Scribbles.

Local models, in order: Llama 3.1 8B (fast, cautious), Gemma 4 E4B (most
accurate), Qwen 3.5 9B (careful, a third maker). An approval always has
Google's and Alibaba's model in it, since the safety model and the hosted
model are both Meta's.

Kids only ever see our fixed tips. A model picks a tip by its id.

## When something is down

A missing answer is never read as "fine" and never as "worrying". The
sentence keeps its place and is tried again.

| What's down | What happens | How it clears |
| --- | --- | --- |
| The VM or the worker | Sentences wait. Nothing is decided. | The worker starts, asks for work, carries on. |
| The worker dies mid-sentence | Its sentences are handed out again after 15 minutes. | By itself. |
| One local model is gone | Sentences wait at that model. An issue is opened. | A person swaps the model; the line carries on. |
| The hosted model is out of Neurons or down | Only sentences that need it wait. The rest carry on. | Midnight UTC, or when it's back. |
| The backend or database | The worker waits and tries again, more slowly each time. | By itself. |
| A kid edits while it's being read | Answers for the old words are thrown away. | The new words get in line. |
| One sentence breaks a model every time | After 3 tries it skips that model and goes to the hosted model. | By itself. |

Two limits on waiting:
- **A raised concern doesn't wait long.** If a local model raised a
  concern and the hosted model hasn't answered in 6 hours, it's a Check in.
- **A stuck line is noticed.** If any sentence waits more than 2 hours, or
  the worker hasn't asked for work in 30 minutes, `watch` opens an issue.

Teachers can still decide any waiting sentence by hand, as today.

## Boundaries

- **Always:** rule-held sentences go to no AI. Strict answers only (one
  exact object, anything else is no answer). Every answer is saved with the
  model's exact version. Only ids and outcomes in logs, never a kid's words.
- **Ask the owner first:** turning auto-decisions on, on staging or
  production. Changing which models vote. Anything on the VM itself.
- **Never:** a paid service. A model's own words shown to a kid. A port
  open on the VM. A sentence decided from a missing answer.

## How it's built and tested

- Backend code in `backend/reviewer/` and `backend/controllers/`, with
  tests in `backend/tests/` (`npm test`, `npm run typecheck`).
- The worker is a small Node script in `worker/`, run on the VM by
  systemd at low priority. Its tests fake the backend and the models.
- "Measure small open models" saves each model's answers, and a script
  scores a voting rule on them before the rule is used.
- One small PR each into `staging`. The Claude Security scan for anything
  under `backend/reviewer`, `backend/controllers` or `.github/workflows`.

## Done means

- On the made-up set, the voting rule above makes zero wrong approvals.
- With the VM off, no sentence changes state; switched back on, every
  waiting sentence is decided with no one touching anything.
- With the hosted model out of Neurons, sentences that don't need it are
  still decided, and the rest are decided after the reset.
- A killed worker loses nothing and decides nothing twice.
- A teacher's queue holds only Check ins and rule holds.

## Not in this version

- **Classes,** and a switch per class: after this works for the whole site.
- **A second VM or a graphics card:** only if 500 a day isn't enough.
- **Training our own model:** the fixed tips and voting get us there first.
- **Local models approving with no made-up safety set:** the bigger set
  comes first (plan, B7).

## Open questions for the owner

1. **Sending back by itself** reverses "approve only, never send back
   automatically" in the plan. Confirm that's what you want.
2. **Edits:** should a sentence that was ever flagged always go to a
   teacher, and should only its first three versions be decided by Scribbles?

## Decided by the owner (2026-11-25)

- **No 1-in-5 teacher sample.** The weekly canary on the made-up set and
  teachers' undos are the checks.
- **Scribbles decides every try,** the third and later ones too.
- **Three local models:** Llama 3.1 8B, Gemma 4 E4B, Qwen 3.5 9B.
