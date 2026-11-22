# Tasks: Tell paths and refreshers

See `tasks/plan.md` for the decisions, risks and open questions. Each task
is one small pull request into `staging` with the `qa-wolf` label.

## Phase 1: Tell IDs and tags

## Task 1: Backend Tell catalog with IDs and tags

**Description:** Give every Tell an `id`, a `technique` and a `level` in
`backend/public/tellList.ts`. Classic keeps its order and words, and its IDs
are its existing titles, `day1`…`day35`. `tellForTitle` looks a Tell up by ID.
`GET /` sends `id` and `technique` as well (an addition: older websites
ignore them).

**Acceptance criteria:**
- [x] A test pins all 35 Classic IDs to today's exact words and order
- [x] Days 1–30 are tagged `senses`; Days 31–35 are tagged simile, metaphor,
  personification, hyperbole and allusion
- [x] Saving and editing a sentence store the same Tell as before

**Verification:**
- [x] `cd backend && npx vitest run` and `npx tsc` pass
- [x] `cd client && npx tsc --noEmit -p tsconfig.app.json` still passes

**Dependencies:** None

**Files likely touched:** `backend/public/tellList.ts`,
`backend/contract/api.ts`, `backend/tests/public.test.ts`

**Estimated scope:** Small

## Task 2: Website finds Tells by ID, not by position

**Description:** Replace every `tellSentences[day - 1]` with a lookup by
the sentence's title (its Tell ID): gallery photos, Write's Tell and photo,
and Today's next Tell. The next Tell is still Classic's next day. Show a
Tell without its "(Use a …)" ask, wherever a Tell appears (Today, Write, My
sentences, gallery), since the badge says it instead.

**Acceptance criteria:**
- [x] The gallery, Write and Today show the same Tells and photos as before
- [x] A Tell list saved in the browser without IDs is fetched again
- [x] No screen names change; the only wording change is the "(Use a …)"
  ask leaving the Tell (check QA Wolf flows that read Days 31–35)

**Verification:**
- [x] `cd client && npx vitest run`, `npx eslint src`, `tsc` pass
- [x] Manual: fake-API screenshots of Today, Write and Gallery match the
  current ones
- [x] QA Wolf: all flows pass on the preview

**Dependencies:** Task 1

**Files likely touched:** `client/src/tells.ts` (new),
`client/src/components/Cards.tsx`, `client/src/pages/Write.tsx`,
`client/src/pages/Today.tsx`, `client/src/actions/tellsentences.ts`

**Estimated scope:** Medium

## Checkpoint: Foundation
- [ ] All tests pass, builds clean
- [ ] QA Wolf green on staging after both merge
- [ ] Review with a person

## Phase 2: Refreshers

## Task 3: Refresher content as data

**Description:** Put the approved refresher words in
`client/src/refreshers.ts`, keyed by technique: senses, simile, metaphor,
personification, hyperbole and allusion (what Classic asks for), plus
onomatopoeia for the new paths.

**Acceptance criteria:**
- [x] The words match the canvas content sheet exactly
- [x] Every refresher has a meaning, a clue, an example, and spot, finish
  and check steps, each with a right answer that exists
- [x] `wording.test.ts` still passes

**Verification:**
- [x] `cd client && npx vitest run src/refreshers.test.ts src/wording.test.ts`

**Dependencies:** None (can run alongside Phase 1)

**Files likely touched:** `client/src/refreshers.ts`,
`client/src/refreshers.test.ts`

**Estimated scope:** Small

## Task 4: Refresher pop-up, opened from "What's a …?"

**Description:** On Write, a Tell tagged with a technique that has a
refresher shows its badge and a "What's a …?" button that opens the 5-step
pop-up from the canvas design. Nothing opens by itself yet.

**Acceptance criteria:**
- [x] A real dialog: focus goes to its heading, Esc and Close shut it, and
  focus returns to the button; every target is 44px or more
- [x] A wrong pick says "Not quite" with the clue; Next unlocks on the right
  answer; motion stops under reduced motion
- [x] Existing Write names ("Now show it", sense buttons, Send) unchanged

**Verification:**
- [x] `cd client && npx vitest run src/components/Refresher.test.tsx
  src/pages/Write.test.tsx`
- [x] Manual: desktop and phone screenshots match the canvas

**Dependencies:** Tasks 2 and 3

**Files likely touched:** `client/src/components/Refresher.tsx`,
`client/src/components/Refresher.test.tsx`, `client/src/pages/Write.tsx`,
`client/src/theme/paper.css`

**Estimated scope:** Medium

## Task 5: Remember which refreshers a student has seen (backend)

**Description:** Add `seenRefreshers` (a list of techniques) to the profile.
`GET /Login` sends it, and `PUT /Login/refreshers/:technique` adds one. It
gets its own per-minute limit, like looks.

**Acceptance criteria:**
- [ ] Only the signed-in student's own profile changes; unknown techniques
  are refused (400)
- [ ] Adding the same technique twice keeps it once
- [ ] Old profiles without the field read as none seen

**Verification:**
- [ ] `cd backend && npx vitest run tests/refreshers.test.ts` and the full
  suite; `npx tsc`

**Dependencies:** None

**Files likely touched:** `backend/models/profile.ts`,
`backend/contract/api.ts`, `backend/controllers/routes.ts`,
`backend/routes/routes.ts`, `backend/tests/refreshers.test.ts`

**Estimated scope:** Medium

## Task 6: Open a refresher by itself the first time

**Description:** The first time a student meets a Tell whose technique they
haven't seen, its refresher opens by itself and is marked seen. The senses
refresher opens on Day 1.

**Acceptance criteria:**
- [ ] It opens once per technique per student, on any device
- [ ] If marking it seen fails, the student can still write (nothing blocks)
- [ ] Later visits only open it from the button

**Verification:**
- [ ] `cd client && npx vitest run`
- [ ] New QA Wolf flows (Chi Sandbox): first-time senses refresher on Day 1,
  and reopening from the button; both pass on the preview

**Dependencies:** Tasks 4 and 5

**Files likely touched:** `client/src/pages/Write.tsx`,
`client/src/api/index.ts`, `client/src/actions/user.ts`,
`client/src/pages/Write.test.tsx`

**Estimated scope:** Medium

## Checkpoint: Refreshers
- [ ] All tests pass, QA Wolf green including the new flows
- [ ] Review with a person before Phase 3

## Phase 3: Paths and placement (later)

## Task 7: Paths on the backend; every student on Classic

**Description:** Add a path list (`classic` = `day1`…`day35`) and a `path`
on the profile (none means Classic). `GET /Login` sends the student's path
and `GET /` sends the Tells it uses.

**Acceptance criteria:**
- [ ] Every current student reads as Classic, with no data change
- [ ] A test proves Classic's order is unchanged

**Verification:** backend suite and `tsc`

**Dependencies:** Task 1

**Estimated scope:** Medium

## Task 8: Next Tell comes from the student's path

**Description:** The next Tell is the first ID on the student's path that
they haven't written, replacing "highest day + 1".

**Acceptance criteria:**
- [ ] Classic students get exactly the same next Tell as before, including
  students with gaps in their days
- [ ] "All done" shows when every Tell on the path is written

**Verification:** client suite; QA Wolf green on the preview

**Dependencies:** Tasks 2 and 7

**Estimated scope:** Medium

## Task 9: Starter and Stretch paths (content)

**Description:** Write the new Tells (with photos) and the Starter and
Stretch orders, reusing Classic Tells where they fit. Allusion comes late on
both, as on Classic's Day 35.

**Acceptance criteria:**
- [ ] Every new Tell has an ID, tags and a photo
- [ ] A person has reviewed every word

**Dependencies:** Task 7. Needs the content from a person.

**Estimated scope:** Small (code) plus content

## Task 10: Placement quiz for new students

**Description:** 4–5 questions on first sign-in, built from refresher
steps; the score picks Starter, Classic or Stretch. A student can skip it
and gets Classic.

**Dependencies:** Tasks 4, 7 and 9

**Estimated scope:** Medium. Split again when it's next.

## Task 11: Teacher can change a student's path

**Dependencies:** Task 7

**Estimated scope:** Medium. Split again when it's next.

## Checkpoint: Complete
- [ ] A new student takes the quiz and gets the matching path
- [ ] Existing students are still on Classic, with nothing moved
