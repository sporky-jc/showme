# Plan: finding sense words in new sentences, automatically

## The problem

The Gallery's sense finder and Write's sense buttons both use one hand-made
word list (`client/src/senses.ts`). In production it finds no sense at all in
40 of 113 approved sentences (35%), because kids write words it doesn't
know: "stench", "rotting", "roaring", "wailed", "snoring", "screaming",
"loudly", "trembling", "frigid", "scorching", "cozy", "vibrant". Every new
class will bring new words, so a list someone grows by hand will always be
behind.

## The idea: three layers, each catching what the one before misses

1. **Word families, worked out automatically.** The list keeps base words
   only ("scream", "loud", "tremble"), and the matcher works out their
   forms itself: screams, screamed, screaming, loudly, trembling, tasted,
   tastier. One base word then covers a whole family, and nobody has to
   type every form. Instant, offline and free, so Write keeps using only
   this layer as a student types.
2. **A free sense tagger for approved sentences.** Scribbles (the AI
   reviewer) is off in staging and production, so this doesn't ride on it.
   A small job of its own asks the AI that Scribbles would use (Cloudflare
   Workers AI, on its free daily allowance: a short sentence costs a few
   Neurons of the 10,000 a day) which words in an approved sentence use
   each sense. The server keeps only words that really are in the student's
   sentence (nothing a model writes is ever shown) and saves them on the
   sentence. The Gallery lights up what the list found plus what was
   tagged. It runs once per approved sentence, after approval, so a
   student never waits for it, and it works whether Scribbles is on or off.
3. **A weekly job that grows the list, with no person in the loop.** A
   scheduled workflow, on free GitHub Actions minutes and Cloudflare's free
   daily Neurons, finds words kids keep writing that the list doesn't know,
   puts each through the gates below, and opens a PR into `staging` that
   merges itself once CI passes. Production gets the words with the next
   "Promote to production", like every other change. Nobody reads a report
   or approves a word; a person only hears about it when something breaks
   (an issue the job opens). Over time the list catches up, and the tagger
   (layer 2) is the safety net in between.

## Rules that keep it safe

- **Only the student's own words are lit up.** Words from Scribbles must
  match words in the sentence, or they are dropped.
- **A word goes on the list only if it nearly always means that sense in kids' writing.**
  "Roaring" means a sound almost every time; "cool" ("a cool trick") doesn't,
  so "cool" stays off. A set of sentences that should light up nothing
  checks this.
- **No real student writing in the repo or in tests.** Test sentences are made up,
  modeled on the kinds of words production showed. The weekly job's PR adds
  single words only, a word only when it is in at least 3 sentences, and
  never a name.
- **Production's sentences stay in production's backend.** The weekly job
  never gets a database login: production's backend counts the words and
  checks them itself, behind a job key, and hands back single words and
  scores only. The tagger only ever writes a sentence's own sense words,
  and only on a sentence that is already approved.
- **No sentence in logs, PRs or summaries.** Only single words and rounded
  counts ("3-5 sentences") leave the backend, apart from the sentences the
  in-use check sends to Cloudflare (gate 3), and a test checks that.
- **It stays free.** It uses Cloudflare's free daily allowance and GitHub
  Actions minutes only. If a day's allowance runs out, the tagger waits for
  the next day, and the list still works.

## Tasks (one small PR each, into `staging`, with `qa-wolf`)

### S1: Word families from base words
Add the forms engine (-s, -es, -ed, -ing with a dropped "e" or a doubled
letter, -ly, y to -ied or -ier) and change the list to base words. The list
also takes Scribbles' sound words (`backend/reviewer/soundWords.ts`) for
Hear.
- [x] Every word the list matches today still matches (a test pins them)
- [x] Made-up sentences that only tell still light up nothing
- [x] QA Wolf: Write's sense flows pass

Done as: `exact` words (irregular forms, and words whose family means
something else: "feeling" is usually how someone feels inside, and
"licked" a cheek isn't a taste), doing `words` (-s, -es, -ed, -ing) and
`describing` words (-er, -est, -ly), so "singer" isn't a form of "sing".
Of Scribbles' sound words, the ones that are always a sound are Hear
words; a test lists why each other one isn't. On production's 113 approved
sentences, sentences with no sense found went from 40 to 35, and Hear from 8
to 13; every new match was checked by hand.

### S2: A made-up test set, and a score
About 100 made-up sentences, each with the senses a teacher would see in
it, including the kinds of words production missed. A test reports how
many the matcher finds (recall) and how often it is wrong (precision), and
fails if either gets worse.
- [x] 97 sentences in `client/src/test/senseSet.ts` (22 only tell), scored by
  `client/src/senseScore.test.ts`
- [x] First score: recall 84.2%, precision 93.0%. Misses are words like
  wailed, screeched, frigid, stench and slippery; wrong ones are mostly "bit"
  (wind that bit my cheeks) and "sweet" for a smell. S3 and S4 should raise
  recall, and the floors with it.

### S3: The weekly word job (fully automatic)

Re-planned after two rounds of adversarial review of the first version
(PR #164). Every word it adds must clear all of these gates, in this order.

1. **The word itself.** The backend checks what needs the sentences; the job
   checks the lists, so production's backend never has old lists.
   - In at least 3 approved sentences, by at least 3 different kids,
     answering at least 2 different Tells (so it isn't just one prompt's
     word).
   - A dictionary word, never capitalized mid-sentence, and not on
     Scribbles' first-names list (`FIRST_NAMES`), since kids write "my
     friend rose" in lower case.
   - Passes Scribbles' unsafe, worrying, sensitive and unkind checks.
   - The written word, its base and every form the base would match must
     not be in `NEVER_ADD`, the telling words (`TELL_WORDS`, exported from
     senses.ts) or a feelings-words list, and must not be on the list
     already. (In the job.)
2. **Two different model families agree** on the bare word, asked two
   different ways (Llama, plus a second family on Workers AI). Both must
   give the same sense.
3. **It means that sense in real use.** The job sends the backend each
   gate 2 survivor with its sense. The backend checks the word is one of
   its own gate 1 words (so the key can't be used to ask about any word,
   like a name). It picks up to 10 approved sentences at random that the
   word would light up, and asks both model families about each: "in this
   sentence, is 'roaring' about a sound?" and "is it about how someone
   feels inside?". Every answer must be yes to the first and no to the
   second, for at least 4 sentences. The backend answers with yes or no
   only.
4. **Family only with proof.** The base, with its whole family, goes in
   only when the bare base itself passed gate 3 in kids' sentences ("roar"
   as well as "roared"). Otherwise only the forms that passed go in, as
   `exact` words. So "barked" and "barking" can't make "tree bark" light
   up.
5. **Nothing gets worse:** every sense test still passes (the old list, the
   sentences that must light nothing, the S2 score floors).
6. **Slowly and cheaply:** at most 5 new words a week, on Sundays. Each
   run counts its Neurons from the token counts Workers AI reports (rates
   written down in S3c) and stops at about 2,000. If the free Neurons run
   out, it stops cleanly and tries next week.

What the job's PR can and can't do:
- **A required check, "Sense words PR"** (runs on every PR, and passes when
  a PR isn't the job's): a job PR may change only
  `client/src/senseWordsAdded.ts`.
- **It merges itself only after QA Wolf passes.** The PR has the `qa-wolf`
  label. The job waits for CI and QA Wolf's result on the PR (up to 45
  minutes), then merges it. If either fails, it leaves the PR open and opens
  the alert issue. QA Wolf isn't made a branch-protection check, since it
  only runs on labeled PRs; that way a word that breaks a sense flow can't
  reach staging and block other releases.
- **Branch protection on `staging` and `main`.** `staging` requires
  "Client checks", "Backend tests" and "Sense words PR". `main` takes no
  direct pushes. Both apply to admins too, because the token acts as its
  owner and Netlify builds the live site from `main`. It doesn't require
  branches to be up to date, so a merge during the QA Wolf wait doesn't
  fail.

To keep it running unattended for months:
- **Undo for good, in one line:** `NEVER_ADD` moves into
  `client/src/senses.ts`, and the matcher itself ignores any added word
  whose family touches it (blocking "barking" blocks an added "bark" too).
  So one line in one PR undoes a word on staging at once, and in
  production with the next promotion. The next run also tidies the word
  out of `senseWordsAdded.ts`.
- **One PR at a time:** if last week's PR is still open, the job rebuilds it
  from current `staging` on its own branch instead of opening another.
- **It says when it's broken, and only then.** It opens (or updates) one
  GitHub issue, "Weekly sense words needs attention", assigned to the repo
  owner so GitHub notifies them, using the workflow's own token
  (`issues: write`), so an expired token can still report it.
  That happens when:
  - a run fails;
  - fewer than 90% of the AI's answers can be read (a model changed);
  - a model is no longer served;
  - the token is within 14 days of expiring;
  - QA Wolf or CI fail on its PR.
- **Model names live in one place**, a config file that both the job and
  the backend read.
- **Off switch:** the repository variable `SENSE_WORDS_AUTO_MERGE`. Set to
  `false`, the PRs wait for a person.
- **It stays free:**
  - The Cloudflare account (one account for the job and both backends) is
    confirmed to be on the Workers Free plan, where running out stops
    requests and is never billed. That's a one-time check by a person in
    S3c, because the AI token can't read the plan.
  - It's one PR a week at most, rebuilt at most once a week.
  - Each PR costs one QA Wolf preview run, plus the staging run every merge
    already gets. QA Wolf is a paid service, so that's an open question
    for you.

Tasks (each one small PR into `staging`):

- [ ] **S3a: Fix #164's holes, merged by hand.**
  - Export `TELL_WORDS` and add a feelings-words list.
  - Apply `NEVER_ADD`, the telling words, the feelings words and
    `FIRST_NAMES` to the written word, its base and its family.
  - One word per line, with separate `exact` lists.
  - Rounded counts in the PR body.
  - A dry run without the token; a quota error stops cleanly.
  - A test that no sentence reaches the report, log or summary.
  - Verify: the client and backend tests pass; a stand-in AI run.
- [ ] **S3b: The "Sense words PR" check** (a job PR changes only
  `senseWordsAdded.ts`), and `NEVER_ADD` moved into senses.ts and applied
  by the matcher (blocking any word in the family).
- [ ] **S3c: Check Cloudflare's facts and write them down, with the date:**
  - the data policy (no keeping and no training, including on the free plan
    and for third-party models);
  - the free plan's limits;
  - a second model family that answers in JSON.

  developers.cloudflare.com is blocked from this environment, so this
  needs an allowed host or a person to paste the pages. No real sentence is
  sent before this is done.
- [ ] **S3d: The backend's gate 1 and gate 3**, behind a job key. Gate 3
  takes only words from its own gate 1 list. It's deployed to staging on
  merge, and to production with the next promotion.
- [ ] **S3e: The job runs the gates end to end** on staging data: gate 2 on
  two families, gates 4 to 6, one PR at a time, the alerts and the
  token-expiry check. It runs on Sundays, with a 60-minute timeout to
  cover the QA Wolf wait. A dry run first.
- [ ] **S3f: Auto-merge on:**
  - Branch protection on `staging` and `main`.
  - `SENSE_WORDS_AUTO_MERGE=true`.
  - The job merges after QA Wolf passes.
- **Checkpoint:** 2 runs on staging that merge themselves.
- [ ] **S3g: Point it at production's backend**, after a promotion carries
  S3d there.
- **Checkpoint:** 4 weekly runs on production words, merged by
  themselves, with QA Wolf green.

Risks, said plainly:
- **"Promote to production" isn't a review of words.** The words ride
  along with whatever else is promoted. The gates and the undo are the
  protection; a wrong word is a wrong highlight, not a wrong grade.
- **Gate 3 sends real sentences to Cloudflare**, from the backend, like
  Scribbles would. It waits for S3c.
- **The token expires** (at most a year). The job warns 14 days ahead. A
  GitHub App wouldn't expire, but is more setup.
- **Staging's sentences are mostly made up**, so the staging runs only
  prove the machinery works. Real words come with S3g.
- **GitHub turns off scheduled runs in a public repo after 60 days with no
  commits.** Staging gets commits most weeks, and the job's own merges
  count, but a long quiet break would stop it with no alert.
- **The feelings-words list is hand-made.** Gate 3's "is it about how
  someone feels inside?" question is the backstop.

### S4: The sense tagger
A job of its own (not Scribbles) that tags an approved sentence's sense
words, checks them against the sentence, and saves them. It runs after
approval, then retries any it missed when the free allowance ran out.

### S5: The Gallery uses the saved tags
The cards, Scribbles' pick and the sense finder light up list words plus
saved tags.

### S6: Tag the sentences already approved
A one-off script, like backfill-praise: a dry run on staging, then on
production with approval, spread over days if it needs more than one
day's free allowance.

## Decisions

- Scribbles stays off; the tagger doesn't depend on it.
- AI and the job's own gates decide, not a person, and it must stay free.
- The weekly job adds words with no person in the loop: its PR merges itself
  into `staging` once CI and QA Wolf pass. Production gets the words with
  the next promotion.
- Production's sentences never leave production's backend for the job,
  except gate 3's sentences sent to Cloudflare, and only after the data
  policy is checked (S3c).
- No second-model review of this plan: no free, automatic one is available
  here. The job does use two model families on every word (gate 2).
- Its PRs are opened with a fine-grained token (SENSE_WORDS_TOKEN), so CI
  and QA Wolf run on them.
