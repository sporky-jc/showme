# Handoff: Show ME (sporky-jc/showme)

Read this first. It carries over the previous Claude Code session (session_0151A3A5Upb6Vf5ZEwtbdkTz, Nov 16–19 2026). It lives only on the work branch `claude/vibrant-carson-huj9jm`; leave it out of PRs to staging.

## How the owner works (standing rules)

- Ask before pushing, merging, promoting or changing settings, unless the owner already approved that step.
- Open PRs against `staging` (the default branch) with the `qa-wolf` label. Production is `main`.
- "merge it once QA Wolf passes" means: a workflow-started QA Wolf run on the PR's head commit with every flow passed and **zero failed attempts** (a pass on retry does not count), plus all GitHub checks green. Then squash-merge with the expected head SHA, follow the staging deploy, reset the work branch.
- A clean run after a failure needs a new push with real content. Never an empty commit. Re-running the workflow does not make a new QA Wolf run.
- "promote to production": run `promote-production.yml` (workflow_dispatch, ref `staging`) only after the staging deploy and its QA Wolf run are clean. The owner approves the deployment in GitHub, then says "approved, follow the deploy". Verify `https://show-me-not-tell.netlify.app/version.txt`, `main`, pages load, and that `POST /api/auth/test` answers 404 in production.
- Prove each deploy or infra step with evidence.
- The owner's terminal is PowerShell. Copy uses American spelling (color, favorite, gray, center).
- Design: ask design questions first, recommend an option; keep it FUN and clean. Orange (#ff8a3d) always gets dark ink text (#2d2a32), never white. Headings never set a color in paper.css. Animations stop under prefers-reduced-motion.
- Run an independent review (subagent) right after opening a PR.
- Work branch: `claude/vibrant-carson-huj9jm`. After each merge: `git fetch origin staging && git checkout -B claude/vibrant-carson-huj9jm origin/staging && git push -f -u origin claude/vibrant-carson-huj9jm`.

## Where things stand

- Production = staging = `34041e9` (Nov 19 04:37 UTC). Includes the redesign steps 3a gallery, 3b Write + My sentences, 3c nav bar, 4a Teacher review page (#110), six staging-only test accounts, and the per-tool QA Wolf allow rules (#111).
- Next redesign step: **4b, the About page** (`client/src/pages/About.tsx`, still the old dark Bootstrap look). Ask its design questions first. Likely the point to drop MDB's stylesheet (`mdb-react-ui-kit/dist/css/mdb.min.css` in `client/src/index.tsx`) if the sign-in pop-up no longer needs it. Design canvas: https://claude.ai/artifact/9GRFw7tMaqSN84FJSfGSXN ("Final design" page; read with the Artifact tool's read action, path `project/<Name>.dc.html`).

## App facts worth knowing

- Client: React 19 + Redux (redux-persist), Vite, react-bootstrap (Login pop-up), paper theme in `client/src/theme/paper.css`. Production build runs PurgeCSS (`client/vite.config.ts`): only class names written literally in source survive.
- Checks: `cd client && npm run typecheck && npm run lint && npx vitest run && npm run build`; `cd backend && npm run typecheck && npx vitest run`.
- Routes: `/` Today/Welcome, `/Write/:id?`, `/MySentences`, `/Gallery`, `/admin` (Teacher), `/about`. Old `/Collections` and `/MyPage` forward.
- Staging test login (`backend/controllers/testLogin.ts`): fixed roles, each wiping test gets its own account. Logging out ends **every** session of that account (token version bump in `backend/controllers/routes.ts`), so a test that logs out needs its own account. Teacher roles: `admin`, `admin-menu`.
- PR previews use the **staging backend** and cannot do Google sign-in.
- Known gap, not fixed: two teachers can silently undo each other's decision (PATCH /Admin re-applies). iPhone safe-area for the phone bottom bar untested.

## QA Wolf

- Workspace `xoniuprcn2am5nh63rx8fn6cotea`; Staging environment `mpfj5fxvb9okt8zi0s7upakaoenv`. Each PR gets its own environment; flows tagged `PR preview` run there, `CI` on staging.
- Don't start PR-environment runs with `run_create` (they lack the preview URL/pass variables). On staging, `run_create` with flowIds works.
- In flight when this session ended: QA Wolf session https://app.qawolf.com/chi-sandbox/environments/mpfj5fxvb9okt8zi0s7upakaoenv/map?chatSessionId=jwzyo7xhl3aj63yib10ajnwzocht (sessionId `jwzyo7xhl3aj63yib10ajnwzocht`) is building four approved new flows plus one fix, published as drafts to Staging:
  1. A failed send keeps the student's sentence, and trying again saves it exactly once (`student-retry`) — validated
  2. Today leads the student into writing and shows their latest sentences (`student-today`) — validated
  3. On a shared device, the next student cannot see or change the last student's sentence (`student-tablet-a`/`-b`) — in progress
  4. Sense tips help without touching the draft, and a short sentence still sends (`student-senses`) — in progress; corrected: pressing the same sense twice in a row rotates its tip, coming back after another sense restarts at the first tip (intended, not a bug)
  5. "Teacher uses the redesigned navigation and account menu" switched to role `admin-menu` — validated; flow is draft with no tags until verified
- When published: confirm with `flow_list` (includeDrafts), run each new flow on Staging with `run_create`, then activate and tag **CI** and **PR preview** only those passing with zero failed attempts. Then skip suggestions `8457bc736b0e38f856d53bc5ocsg` ("Reject an Empty Show Sentence") and `5562517d3d79b23ae1c620b6ocsg` ("End a Student Session") as already-covered.
- "Visitor uses phone navigation and sign-in dialog" is CI-only on purpose (Google sign-in fails on previews). Don't re-add PR preview.
- "Message-only pages retain accessible headings" is a stale draft (skipped suggestion); leave it.

## Open items for the owner

- Permission prompts: QA Wolf calls still asked in the old session despite connector "allow all" and per-tool allow rules. Check whether this new session still asks; if it does, it's Auto mode's own check (report with `/feedback`).
- The owner must send the QA Wolf security report themselves: QA Wolf's public PR comments keep showing a short-lived staging test-login pass in their "run tests" link (seen on #108–#111). Never repeat the pass values. The old draft was in a temporary scratchpad and is likely gone; rewrite it on request.
- Unanswered QA Wolf question from an old run: "Should the verified MyPage login setup repair be marked complete?" (recommend yes; not answered on the owner's behalf).
- Whether to queue the two-teachers backend issue as its own task.
