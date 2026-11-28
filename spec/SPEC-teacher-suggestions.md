# Spec: The line's suggestions on the Teacher page — V1

Status: proposed

## Objective

Show teachers what Scribbles' review line would do with each waiting
sentence, on the card they already use, so they can compare it with their
own decision. Still suggestions only: the teacher decides, as today.

It's built from small parts, so a part can be added, removed or reordered
by changing one list, without touching the others.

Who it's for: teachers on the Teacher page, and the owner judging the line
in a week of "suggest" (spec `SPEC-line-testing.md`, Stage 4).

## What the teacher sees

The card keeps Scribbles' note (`components/ScribblesNote.tsx`), with the
same five looks teachers know: **Check in**, **Please read**, **Ready!**,
**Try again**, **Your call**. Under it, a few small parts, each shown only
when it has something to say:

| Part id | Shows | Example | When |
|---|---|---|---|
| `outcome` | What Scribbles would do (the existing note) | "Ready for the gallery." | always |
| `tip` | The tip the student would get | "My tip: Add a smell you would notice." | a send-back |
| `teacher-note` | That he'd send it back and still tell the teacher | "I'd send this back, and I wanted you to know." | a send-back or approval with a note for the teacher |
| `waiting` | That it's still being read | "Still reading this one." | not decided yet |
| `trail` | What happened to the sentence, step by step, and which check or model put it here | see below | always, folded behind a "How Scribbles decided" button |

Rules for the words: plain, short, American spelling, the house rules
(`client/src/wording.test.ts`). A worry never gets a tip shown, only
**Check in**.

### The `trail` part

One line for each check that read the sentence, in the order they ran,
with the one that put it on the teacher's page marked. For example:

> **How Scribbles decided**
> 1. Word check: found nothing worrying.
> 2. Safety check, Llama Guard 3 8B (`llama-guard3:8b@46f211c3`): safe.
> 3. Helper Gemma 4 E4B (`gemma4:e4b@dc35e8d9`): **worried.** ← this is why it's here
> 4. Helper Qwen 3.5 9B (`qwen3.5:9b@56671c2a`): not worried.
> 5. Big helper Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`): **worried**, read with contact details hidden.

- **Names are never typed into the page.** Each line comes from the
  answer saved in the review line, which keeps the exact model and
  version that gave it (`models/reviewLine.ts`). A new model shows its own
  name and version the day it starts answering.
- **The friendly name** ("Gemma 4 E4B") is worked out from the model's id
  by one small function, with the raw id shown next to it. An id it
  doesn't know is shown as it is, so nothing breaks when a model changes.
- **The version** is the short digest after "@" that the worker sends
  for each local model. The hosted model has none (Cloudflare doesn't give
  one), so only its id shows.
- **"Helper"** is a local model on the VM, **"Big helper"** the hosted
  model, **"Safety check"** Llama Guard, **"Word check"** our own rules.
- What each answer means, in plain words: safe / not safe; worried / not
  worried; "really at risk" / "play or a story"; for the writing
  checklist, only what it found wrong ("says it doesn't show the Tell").
- The page also shows, once, which models the line uses now, with their
  versions, at the top of the Teacher page next to the Scribbles switch,
  so a change of model is easy to spot.

## Modular by design

- **Client:** one list decides the parts and their order:

  ```ts
  // components/suggestionParts.tsx
  export const SUGGESTION_PARTS: SuggestionPart[] = [outcome, tip, teacherNote, waiting, trail];
  ```

  Each part is `{ id, show(suggestion): boolean, Part: React component }`.
  Removing a line from the list removes that part everywhere; adding one is
  a new small component and one line. No part reads another's data.
- **Backend:** one function turns the line's decided step into the
  suggestion the card already reads (`ScribblesSuggestion` in
  `contract/api.ts`), plus a few new optional fields (`teacher`, `waiting`,
  `trail`). The card's existing contract is unchanged for the old
  reviewer.
- **Which suggestions the cards show** ("the source"): the old reviewer's
  (today), or the new line's. It's set in two places, like Scribbles'
  on/off today:
  - a GitHub variable, `STAGING_SUGGESTIONS_FROM` /
    `PRODUCTION_SUGGESTIONS_FROM` (`old` or `line`), read at deploy: the
    default;
  - a switch on the Teacher page, next to the pause switch, that changes
    it at once with no deploy, until it's switched back to the default.
  One place (`reviewQueueFor` in `controllers/routes.ts`) reads the
  result.

## How the line's steps map to the card

| Line's decision | Note | Parts |
|---|---|---|
| approve | Ready! | trail |
| approve, with a note for the teacher | Ready! | teacher-note, trail |
| send back with a tip | Try again | tip, trail |
| send back, with a note for the teacher | Try again | tip, teacher-note, trail |
| teacher: worrying words / a worry | Check in | trail |
| teacher: anything else (a model failing, a split it couldn't settle) | Your call | trail |
| still waiting | (no note) | waiting, trail (what's answered so far) |

## Commands

```
Client checks:   cd client && npm run lint && npx vitest run
Backend tests:   cd backend && npx vitest run
Wording check:   cd client && npx vitest run src/wording.test.ts
Contrast check:  cd client && npx vitest run src/theme/contrast.test.ts
```

## Project structure

- `backend/reviewer/lineSuggestion.ts`: a line record's decided step → a
  card suggestion (pure, no database).
- `backend/controllers/routes.ts`: `reviewQueueFor` reads from the chosen
  source.
- `backend/contract/api.ts`: three optional fields on `ScribblesSuggestion`,
  and the models in use now.
- `backend/models/suggestionSource.ts`: the Teacher page's source switch.
- `client/src/components/suggestionParts.tsx`: the list and the parts.
- `client/src/components/modelName.ts`: a model id → its friendly name.
- `client/src/components/ScribblesNote.tsx`: renders the list under the
  note.

## Code style

As the rest of the app: small components, real elements, colors from
`client/src/theme/paper.css`. For example:

```tsx
const tip: SuggestionPart = {
  id: "tip",
  show: (s) => s.verdict === "redo" && s.tip !== null,
  Part: ({ suggestion }) => <p className="paper-scribbles-note__said">My tip: “{suggestion.tip!.text}”</p>,
};
```

## Testing strategy

- Backend, vitest: every row of the mapping table above, from a made-up
  line record; the queue route with each source setting; a suggestion for
  old words is never shown.
- Client, vitest and Testing Library: each part shows only when it should;
  removing a part from the list removes it from the card; the folded `how`
  part opens with a real `<button>`; the wording check passes.
- A look at the page on staging (light, dark, a phone), as the house
  rules ask.

## Boundaries

- Always: suggestions only; first names only; real buttons, 44px targets;
  every animation stops under reduced motion; tokens from `paper.css`.
- Ask first: renaming anything QA Wolf flows find by name (headings,
  buttons, labels); changing the card's layout beyond the parts.
- Never: show a sentence's words anywhere new; type a model's name into
  the page (names come from the saved answers); act on a suggestion by
  itself.

## Success criteria

- With the source set to the line, each staging card shows the line's
  decision as the mapping table says.
- With the source set back to the old reviewer, the page looks exactly as
  it does today.
- Each part can be removed by deleting its one line in
  `SUGGESTION_PARTS`, with the tests still passing.
- Each trail line names the model and version that gave the answer, taken
  from the saved answer; a test with a made-up model id shows that id.
- The badge on the Teacher link counts the line's "Check in" sentences
  when the line is the source.

## Out of scope (deferred)

- Undo and auto-decisions ("decide" mode). A later spec.
- A "Look over" list for sentences Scribbles decided with a note for the
  teacher, once it decides by itself. In "suggest" they're on the card.
- Settings in the page to turn parts on and off. The list in code is
  enough for now.
- Per-teacher preferences.

## Decided

- The `trail` part, with each model's name and version from the saved
  answers, replaces the shorter `how` (the owner, Nov 28).
- "Helper", "Big helper": the owner's words.
- The source is set in both places: a GitHub variable as the default, and
  a Teacher page switch on top (the owner, Nov 28).

## Open questions

1. The `trail` part folded behind a button (proposed), or open on every
   card?
