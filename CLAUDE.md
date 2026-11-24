# Show ME

A "show, don't tell" writing app for kids in grades 4–7. The client is in
`client/` (React, Vite, Vitest); the API is in `backend/`.

## QA Wolf

- Show ME's QA Wolf flows live in the **Chi Sandbox** workspace. Use only that
  workspace for Show ME, and never touch any other QA Wolf workspace.
- Add the `qa-wolf` label to a pull request to have QA Wolf test its Netlify
  preview.
- No QA Wolf pull request runs on weekdays from 8:30am to 5:30pm Pacific time.
  In those hours don't add the `qa-wolf` label, don't push to a pull request
  that already has it (a push starts a run too: take the label off first), and
  don't start a run by hand. Add the label after 5:30pm PT or on a weekend.
  Check the time first: `TZ=America/Los_Angeles date`. Only the owner can lift
  this, one pull request at a time.
- Flows find things by their names (headings, "Start showing", "Ask
  Scribbles", sense buttons, labels). Keep those names the same, or say in the
  pull request which ones changed.

## House rules

- Pull requests go into `staging`, one small change each. Don't promote to
  production.
- American spelling and short, plain words a 9-year-old can follow
  (`client/src/wording.test.ts` checks it).
- Colors come from the tokens in `client/src/theme/paper.css`
  (`client/src/theme/contrast.test.ts` checks contrast). Coral buttons have
  dark ink text, never white.
- Every animation stops under `prefers-reduced-motion: reduce`.
- Real `<button>`, `<a>` and `<label>` elements; touch targets of 44px or
  more.
- Never show surnames where kids see other kids' work (first name, or first
  name and initial).

## Explainer films

- Films are made with the Lemo Opuscar plugin (`lemo-opuscar@lemolab`). Use it
  only when asked for a film.
- Films live in their own repo, `sporky-jc/showme-films`, cloned next to this
  one (`../showme-films/<name>/`). Make them there, never inside this repo.
  Only the finished, compressed MP4, its captions and poster come into the
  app.
- Narration and on-screen words follow the house rules above: American
  spelling, short plain words, no surnames.
- In the app, a film never plays by itself: it has a real play `<button>`.
  Captions are there but off until the viewer turns them on.
- Don't use the Clawd character or the Mascot Screencast style (Anthropic's,
  not licensed), or the narration from Lemo Opuscar's own demo films.
