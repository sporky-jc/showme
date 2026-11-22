# Implementation Plan: Tell paths and refreshers

## Overview

Make Tell sentences safe to change and extend without moving any current
student's sentences, then use that to show refresher pop-ups when a Tell
asks for a technique. Later, give new students a path picked by a short
placement quiz (Starter, Classic or Stretch).

Today the 35 Tells are one list in `backend/public/tellList.ts`. A student's
sentence stores its Tell's place as its title ("day7") and a copy of the
Tell's words. The app uses that place in five spots:
- the next Tell is "highest day + 1" (`client/src/days.ts`, used by Today,
  Write and My sentences);
- the gallery photo is `tellSentences[day - 1]` (`Cards.tsx`);
- Write's Tell and photo for a day (`Write.tsx`);
- an edit puts back the Tell for its title (`tellForTitle`, `routes.ts`);
- one sentence per student per day (`dayKey` = student + title).

## Architecture decisions

- **Classic's titles are the permanent IDs.** "day1" to "day35" already sit
  on every Classic sentence, so they become Tell IDs as they are: no
  backfill, and no change to production data. Classic is frozen from now on:
  its 35 entries never change order, words or meaning.
- **New Tells get IDs that don't name a place** (for example
  `t-snow-day`). A Tell is never edited or deleted once students may have
  written for it, only retired from paths.
- **A path is an ordered list of Tell IDs.** Classic is `day1`…`day35`.
  Paths can share Tells. The student's next Tell is the first one on their
  path they haven't written, so a path can change without moving anything
  already written.
- **Tags live on the Tell:** `technique` (senses, simile, metaphor,
  personification, hyperbole, onomatopoeia, alliteration, allusion).
  Refreshers are triggered by the tag, never by a day number. A `level` tag
  comes with paths (Task 7), when something reads it.
- **Classic's asks stay in its words.** "(Use a Simile)" is still in the
  stored Tell, so the reviewer reads it as before, and old sentences keep
  their words. On screen, the website hides it and shows the badge "This
  Tell asks for a simile" instead (Tasks 2 and 4).
- **Content stays in code for now** (Tells, paths, refresher words), so
  every change is a reviewed pull request that QA Wolf tests. Move it to the
  database only when teachers need to write their own.
- **"Seen this refresher" is saved on the student's profile, not in the
  browser.** Students share school devices, so browser storage would show
  one student's refresher as already seen to the next.

## Task list

The tasks with acceptance criteria are in `tasks/todo.md`.

### Phase 1: Tell IDs and tags (nothing changes on screen)
- [x] Task 1: Backend Tell catalog with IDs and tags
- [x] Task 2: Website finds Tells by ID, not by position

### Checkpoint: Foundation
- [ ] Backend and client tests pass, `tsc` clean
- [ ] QA Wolf: all flows pass on the preview
- [ ] Gallery photos, Write and Today unchanged for an existing student

### Phase 2: Refreshers
- [x] Task 3: Refresher content as data
- [x] Task 4: Refresher pop-up, opened from "What's a …?"
- [x] Task 5: Remember which refreshers a student has seen (backend)
- [x] Task 6: Open a refresher by itself the first time (senses on Day 1)

### Checkpoint: Refreshers
- [ ] A new student sees the senses refresher once on Day 1, then only from
  its button, on any device
- [ ] New QA Wolf flows for the refresher are added and pass
- [ ] Review with a person before Phase 3

### Phase 3: Paths and placement (later)
- [ ] Task 7: Paths on the backend; every student on Classic
- [ ] Task 8: Next Tell comes from the student's path
- [ ] Task 9: Starter and Stretch paths (content)
- [ ] Task 10: Placement quiz for new students
- [ ] Task 11: Teacher can change a student's path

### Checkpoint: Complete
- [ ] A new student takes the quiz and gets the matching path
- [ ] Existing students are still on Classic, with nothing moved

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A browser still holds the old Tell list (saved by redux-persist) without IDs | High | Task 2 treats a list without IDs as missing and fetches it again; test it |
| Someone later edits a Classic Tell's words or order | High | A backend test pins all 35 Classic IDs to today's words |
| QA Wolf flows depend on day numbers or Tell words | Med | Tasks 1–2 change no names or words on screen; run the full suite on each preview |
| Older sentences with titles that aren't days | Low | They already have no day; keep them out of paths and next-Tell logic, as today |
| Seen-refresher state lost on shared devices | Med | Stored on the profile (Task 5), not in the browser |
| Allusion is hard for young or new writers | Med | Starter and Stretch paths put it late, as Classic does on Day 35 (Task 9) |

## Decisions (from review)

1. **Classic gets no new nudges.** Days 1–30 are tagged senses; Days 31–35
   are tagged the figure of speech their words already ask for. Onomatopoeia
   and alliteration wait for the new paths.
2. **"(Use a Simile)" moves into the badge** on screen; the stored words
   don't change.
3. **Allusion gets a refresher** with examples kids know (Pinocchio,
   Sleeping Beauty, the Flash, the Hulk). New paths put it late, like
   Classic's Day 35.
4. Refresher wording approved as on the canvas content sheet. Senses opens
   by itself on Day 1.

## Open questions

- **Placement quiz:** how many questions, and should a teacher see the
  result? (Task 10)
