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
- QA Wolf flows compare the Tell's text (`.paper-gallery__tell`) exactly:
  put nothing else inside it, not even hidden text.
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

- [x] Same sentences, order and names as today
- [x] Contrast passes (`contrast.test.ts`); 44px targets
- [x] QA Wolf: all flows pass on the preview

Files: `client/src/components/Cards.tsx`, `client/src/theme/paper.css`

### G2: Scribbles' pick

One approved sentence, big, above the wall: its Tell crossed out, its Show,
the senses it uses, its framed photo, and Scribbles saying "Tell says it.
Show lets you see it!" Buttons: "Show me another" and, for guests, "Try one
yourself", which opens the About page.

The pick comes from the sentences after the wall's 12, so the wall (and the
flows that read it) stays as it was. With 12 or fewer, it's the first, and
the wall shows the rest. Its classes are its own (`paper-pick__…`), since
flows find cards by `.paper-gallery__card`. Signed-in users can like it.

- [x] The pick isn't repeated in the wall below
- [x] Focus stays on "Show me another"; the new sentence is announced
- [x] Motion stops under reduced motion

Files: `client/src/pages/Collection.tsx`, a new `GalleryPick.tsx`,
`paper.css`

### G3: Sense finder

See, Hear, Feel, Smell and Taste buttons (`aria-pressed`) show only the
sentences that use that sense; a status line says how many.

It filters the wall only; Scribbles' pick stays. With no sense pressed, the
wall is exactly as before.

- [x] Works with Shuffle and Newest; pressing again shows all
- [x] A sense with no sentences says so and offers Show all

Files: `Collection.tsx`, `paper.css`

### G4: The end of the wall

"Show more" after 12 cards, and for guests Scribbles' "I tape up the best
ones" with Sign in.

Show more shows the rest of what the Gallery already loaded (the server
sends every approved sentence), 12 more at a time, and puts the keyboard on
the first new card. The invite's button is "Write one too" (it opens the
sign-in pop-up): a second button named with "Sign in" would match the
menu's in flows that find "Sign in" by name.

### G5: Phone layout

Short cards (photo thumbnail beside the words) and the pick stacked above
its photo; the sense buttons scroll sideways.

- [ ] No sideways page scroll at 375px

### G6: QA Wolf flows (Chi Sandbox)

Scribbles' pick and "Show me another", the sense finder, and the phone
layout. Activate after they pass on staging.

## Open questions

