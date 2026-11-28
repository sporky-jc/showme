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
| `how` | Who decided, in a line | "Both helpers agreed." / "I asked my big helper." | always, folded by default |

Rules for the words: plain, short, American spelling, the house rules
(`client/src/wording.test.ts`). The note never names a model. "Helpers"
are the local models; "my big helper" is the hosted model. A worry never
gets a tip shown, only **Check in**.

## Modular by design

- **Client:** one list decides the parts and their order:

  ```ts
  // components/suggestionParts.tsx
  export const SUGGESTION_PARTS: SuggestionPart[] = [outcome, tip, teacherNote, waiting, how];
  ```

  Each part is `{ id, show(suggestion): boolean, Part: React component }`.
  Removing a line from the list removes that part everywhere; adding one is
  a new small component and one line. No part reads another's data.
- **Backend:** one function turns the line's decided step into the
  suggestion the card already reads (`ScribblesSuggestion` in
  `contract/api.ts`), plus a few new optional fields (`teacher`, `waiting`,
  `how`). The card's existing contract is unchanged for the old reviewer.
- **Which source:** a setting picks where suggestions come from: the old
  reviewer (today), or the line. One place (`reviewQueueFor` in
  `controllers/routes.ts`) reads it. Switching back is one setting, no
  code.

## How the line's steps map to the card

| Line's decision | Note | Parts |
|---|---|---|
| approve | Ready! | how |
| approve, with a note for the teacher | Ready! | teacher-note, how |
| send back with a tip | Try again | tip, how |
| send back, with a note for the teacher | Try again | tip, teacher-note, how |
| teacher: worrying words / a worry | Check in | how |
| teacher: anything else (a model failing, a split it couldn't settle) | Your call | how |
| still waiting | (no note) | waiting |

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
- `backend/contract/api.ts`: three optional fields on `ScribblesSuggestion`.
- `client/src/components/suggestionParts.tsx`: the list and the parts.
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
- Never: show a sentence's words anywhere new; show which model said what
  by its name; act on a suggestion by itself.

## Success criteria

- With the source set to the line, each staging card shows the line's
  decision as the mapping table says.
- With the source set back to the old reviewer, the page looks exactly as
  it does today.
- Each part can be removed by deleting its one line in
  `SUGGESTION_PARTS`, with the tests still passing.
- The badge on the Teacher link counts the line's "Check in" sentences
  when the line is the source.

## Out of scope (deferred)

- Undo and auto-decisions ("decide" mode). A later spec.
- A "Look over" list for sentences Scribbles decided with a note for the
  teacher, once it decides by itself. In "suggest" they're on the card.
- Settings in the page to turn parts on and off. The list in code is
  enough for now.
- Per-teacher preferences.

## Open questions

1. The `how` part: useful to you, or noise? It could start removed.
2. The words "helpers" and "big helper" for the models: OK, or plainer
   ("Scribbles' checks")?
3. The source setting: a GitHub variable read at deploy (simple), or a
   switch on the Teacher page next to the pause switch (no deploy)?
