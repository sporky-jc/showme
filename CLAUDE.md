# Show ME

A "show, don't tell" writing app for kids in grades 4–7. The client is in
`client/` (React, Vite, Vitest); the API is in `backend/`.

## QA Wolf

- Show ME's QA Wolf flows live in the **Chi Sandbox** workspace. Use only that
  workspace for Show ME, and never touch any other QA Wolf workspace.
- Add the `qa-wolf` label to a pull request to have QA Wolf test its Netlify
  preview.
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
