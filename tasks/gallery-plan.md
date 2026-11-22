# Plan: a Gallery guests remember (design A)

Design: "Gallery A · Show-and-Tell wall" and "Gallery A · on a phone" on the
Show ME New Directions canvas. Each task is one small pull request into
`staging` with the `qa-wolf` label.

## Why

Guests see the Gallery first, but it never shows what Show ME does: the Tell
is a small red label, the photo is the biggest thing on each card, the same
photo repeats, Scribbles only says "Look what everyone made!", every frame
looks the same, and the page stops after 12 cards with nothing to do next.

## Decisions

- Design A: Scribbles' pick at the top, then a wall of sentence-first cards.
- Guests see no like counts (as today). Signed-in students keep likes.
- "Try one yourself" opens the About page for now. A try-it on the Gallery
  itself could come later.
- Names stay: the "Show ME gallery" heading (still a heading for screen
  readers), Shuffle, Newest, the like buttons, first name and last initial.
- The sense words come from `client/src/senses.ts`, the same list Write uses.
- The only big motion is the pick's Tell being crossed out and the Show
  writing in. It stops under `prefers-reduced-motion: reduce`.

## Tasks

### G1: Sentence-first cards

The Show sentence is the biggest text, the Tell is small and crossed out,
the photo is smaller, and each card shows its picked frame and its sense
words lit up in the sense colors, with a dot per sense.

- [ ] Same sentences, order and names as today
- [ ] Contrast passes (`contrast.test.ts`); 44px targets
- [ ] QA Wolf: all flows pass on the preview

Files: `client/src/components/Cards.tsx`, `client/src/theme/paper.css`

### G2: Scribbles' pick

One approved sentence, big, above the wall: its Tell crossed out, its Show,
the senses it uses, its framed photo, and Scribbles saying "Tell says it.
Show lets you see it!" Buttons: "Show me another" and, for guests, "Try one
yourself", which opens the About page.

- [ ] The pick isn't repeated in the wall below
- [ ] Focus stays on "Show me another"; the new sentence is announced
- [ ] Motion stops under reduced motion

Files: `client/src/pages/Collection.tsx`, a new `GalleryPick.tsx`,
`paper.css`

### G3: Sense finder

See, Hear, Feel, Smell and Taste buttons (`aria-pressed`) show only the
sentences that use that sense; a status line says how many.

- [ ] Works with Shuffle and Newest; pressing again shows all
- [ ] A sense with no sentences says so and offers Show all

Files: `Collection.tsx`, `paper.css`

### G4: The end of the wall

"Show more" after 12 cards, and for guests Scribbles' "I tape up the best
ones" with Sign in.

### G5: Phone layout

Short cards (photo thumbnail beside the words) and the pick stacked above
its photo; the sense buttons scroll sideways.

- [ ] No sideways page scroll at 375px

### G6: QA Wolf flows (Chi Sandbox)

Scribbles' pick and "Show me another", the sense finder, and the phone
layout. Activate after they pass on staging.

## Open questions


- Should "Show more" load more from the server, or show the rest of what
  the Gallery already has? (G4)
