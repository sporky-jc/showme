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

## The plan now: stages A to C (decided 2026-11-22)

A sense belongs to a word in a sentence, not to the word everywhere:
"sweet perfume" is a smell, "sweet cake" a taste, and "tree bark" isn't a
sound. So the main fix reads whole sentences, with two free models from
different families that must agree. Stage A covers highlights; stages B and
C, later and only on evidence, cover approving sentences.

### Stage A: highlights from two models (do now)

When a teacher approves a sentence, the backend sends it to two free
Workers AI models (Llama 3.3 70B and Mistral Small 3.1), on one Cloudflare
account. Each returns its sense words, each with a sense.
- **What lights up:** only words where both models give the same sense, and
  only if the word is really in the kid's sentence.
- **What never does:** telling and feeling words (`TELL_WORDS`, the
  feelings list, `NEVER_ADD`).
- **When they disagree:** the word list still lights what it knows, as
  today.
- **Saving:** the agreed words are saved on the sentence. An edit clears
  them, and the sentence is tagged again when it's re-approved.
- **When it runs:** the same scheduled function as Scribbles' queue, a few
  sentences each run.
- **Cost:** about 30 Neurons a sentence; there's room for about 300 a day,
  free. If the Neurons run out, a sentence waits for the next run with the
  word list's highlights.
- **Privacy:** sentences go only to Cloudflare (which keeps nothing and
  trains on nothing; see S3c). The rule checks' worrying and unsafe
  sentences are never approved, so they're never tagged.

- [x] **A1: The tagger** (`backend/tagger/`).
  - **The rules** (`senseTags.ts`): a word lights up only if it's in the
    kid's sentence, both models give it the same sense, and it isn't
    blocked (`blocked.ts`, kept the same as the website's lists by
    `client/src/taggerBlocked.test.ts`).
  - **The requests** (`tagger.ts`): Llama with a JSON schema, Mistral asked
    for JSON in its prompt. Neurons are counted from the token counts.
  - **The queue** (`queue.ts`), run first in the 10-minute scheduled
    function:
    - approved sentences, newest first, never test accounts';
    - 5 a run and 150 a day (about 4,500 Neurons);
    - it stops when the Neurons run out;
    - an unreadable answer is saved with no AI highlights, so it isn't
      retried every run;
    - it starts no new sentence after 45 seconds, and Scribbles gets the
      rest.
  - **Saved on the sentence:** `senseTags` and `taggedShow`. An edit, or a
    taken-back approval, clears them. Not sent to the website until A2.
  - **Switched on from the Owner settings** (A6). It uses Scribbles'
    Cloudflare secrets.
- [x] **A2: The Gallery uses the saved tags** (S5):
  - **The data:** GET /Collections sends `senseTags`, but only while
    `taggedShow` is still the sentence's words.
  - **The website:** the cards, Scribbles' pick and the sense finder light
    the agreed words, plus what the list finds. A tagged word counts for its
    tagged sense only ("sweet perfume" is a smell, not a taste).
  - QA Wolf on the PR.
- [x] **A6: Owner settings, on the Teacher page, that only the owner sees.**
  - **Who's the owner:** the account whose email is the GitHub secret
    `OWNER_EMAIL`, written to the backend's settings at deploy, so no email
    goes in the code. Test accounts never are. Other teachers get 403 from
    GET/PATCH `/Admin/owner`, and the panel doesn't show for them.
  - **"AI highlights":** on or off, stored in the database
    (`models/ownerSettings.ts`), read at each 10-minute run, so there's no
    deploy. It shows today's count against the 150 limit, and says when
    the Cloudflare keys aren't set.
  - **Replaces the variables:** the `STAGING_SENSE_TAGGER` and
    `PRODUCTION_SENSE_TAGGER` variables are gone.
  - **Later switches in the same panel:** Stage B's "Scribbles suggests" and
    Stage C's "Let Scribbles approve".
- [ ] **A3: Tag the sentences already approved** (S6), a few each run until
  done: about 3,300 Neurons for production's 113, spread over days.
- [x] **A4: The measure** (not on every PR): the workflow "Measure the sense
  tagger", run from the Actions tab.
  - It runs the two models on S2's 97 made-up sentences, about 3,000 free
    Neurons a run.
  - It reports three scores: the word list alone, the AI tags alone, and the
    Gallery with both. It also reports how often the models agree, any
    unreadable answers, and the Neurons used.
  - **Ready for production** means that with the AI, the Gallery finds more
    senses than the word list alone and is right at least as often.
- [ ] **A5: The weekly word job learns from the agreed tags** (S3, reworked):
  a word goes on the list for the Write page (which can't call an AI on
  every keystroke) when both models tagged it with the same sense in at
  least 3 sentences by 3 different kids. No bare-word questions. It keeps
  S3a's gates (blocked words, names, caps, rounded counts, alerts).

### Stage B: Scribbles suggests, teachers still decide (after A)

- Turn Scribbles on in **suggest** mode, in staging and then production.
  It changes nothing kids see.
- Add the second model to its review: one call per model returns a verdict
  and the sense words together, which is cheaper than two.
- The shadow report keeps score against teachers' real decisions.

Before turning it on, confirm with the owner; it changes "Scribbles stays
off".

### Stage C: auto-approval, only on evidence (after B)

A sentence is approved without a teacher only when all of these hold:
1. The rule checks pass: nothing worrying, sensitive, unsafe or personal.
   Anything they flag always goes to a person and is never sent to an AI.
2. The safety model and the welfare check pass.
3. Both models say approve.
4. The shadow report shows at least 100 real teacher decisions, and zero
   where Scribbles would have approved a sentence a teacher sent back for
   safety.

Everything else waits for a teacher, as today. Beyond that:
- **Approve only, never send back automatically.** A wrong "redo"
  discourages a kid.
- **Teachers can undo** any auto-approval from Recent decisions.
- **Switches:** an off switch, and a per-class "Let Scribbles approve"
  setting, off by default.
- **Cost:** about 60 to 70 Neurons a sentence; there's room for about 150
  a day, free.
- **The fail-safe is always "a person decides".** Out of Neurons, a model
  down, or answers that can't be read all mean the sentence waits for a
  teacher.
- **It takes time.** With today's volume, 100 teacher decisions will take a
  while. Stage C waits for them.

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

### S3: The weekly word job (fully automatic; reworked as A5)

> Since 2026-11-22: the job learns from the two models' agreed tags (Stage
> A5) instead of asking about bare words. S3a's gates carry over; S3d's
> bare-word checks are replaced by Stage A.

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

- [x] **S3a: Fix #164's holes, merged by hand.** Also done here: the
  first and second questions go to two model families (Llama, Mistral), with
  a Neuron count and a cap per run; at most 5 new words a run; a word's
  family goes in only when its bare base passed too; a run that only
  removes words opens a PR too; and the run keeps its own schedule on.
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
- [x] **S3c: Cloudflare's facts**, from developers.cloudflare.com, read
  2026-11-22:
  - **Data usage** (page updated Oct 16, 2026): "Zero data retention: ...
    Cloudflare does not retain inputs or outputs after they are no longer
    needed to process the request", and "No training: Cloudflare does not
    use Customer Content processed by Workers AI to train AI models." The
    content isn't shared with other customers. It covers third-party models
    on Workers AI; only stateful features (AI Gateway logging, storage,
    batch) keep anything, and the job uses none of them.
  - **Pricing** (page updated Nov 18, 2026): 10,000 free Neurons a day,
    reset at 00:00 UTC. On **Workers Free**, going over makes requests fail
    and is never billed. On **Workers Paid**, going over is billed at
    $0.011 per 1,000 Neurons. Llama 3.3 70B costs 26,668 Neurons per million
    input tokens and 204,805 per million output tokens; Mistral Small 3.1
    24B costs 31,876 and 50,488.
  - **JSON mode** (page updated Sep 14, 2026): Llama 3.3 70B supports a JSON
    schema. No current model from another family that supports it is on
    the pricing page, so the second family is
    `@cf/mistralai/mistral-small-3.1-24b-instruct`, told in its prompt to
    answer in JSON, and read leniently. If fewer than 90% of its answers can
    be read, the job opens the alert issue.
  - **Budget:** about 15 output tokens per word. Gate 2 on at most 200
    words a week (the most-used first, a different 200 each week) is about
    700 Neurons. Gate 3 on at most 15 words, one request per word per
    model, is about 500. The cap is 3,000 Neurons a run (30% of a day), on
    Sundays.
  - [x] **Confirmed by the owner, 2026-11-22:** the Cloudflare account is
    on **Workers Free** (the dashboard shows the free plan's 100,000 daily
    requests and an "Upgrade" button). Going over the free Neurons fails
    and is never billed. The owner checks that `CLOUDFLARE_ACCOUNT_ID` is
    this account.

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
- **The token expires** (at most a year). The job warns 14 days ahead.
  **Upgrade later:** swap SENSE_WORDS_TOKEN for a GitHub App installed on
  this repository only (Contents, Pull requests and Issues set to read and
  write). The workflow would mint a short-lived token each run with
  `actions/create-github-app-token`, from two secrets (the app ID and its
  private key). App tokens don't expire, aren't tied to a person, and still
  start CI and QA Wolf. Only the token step changes.
- **Staging's sentences are mostly made up**, so the staging runs only
  prove the machinery works. Real words come with S3g.
- **GitHub turns off scheduled runs in a public repo after 60 days with no
  commits.** Handled: every run, including runs that find nothing, ends by
  switching its own schedule back on through GitHub's API ("enable
  workflow", with the workflow's own token and `actions: write`), which
  restarts the 60 days. A weekly run keeps it well inside that. If it
  ever does get paused, GitHub emails the repo owner, and running it once
  from the Actions tab starts it again.
- **The feelings-words list is hand-made.** Gate 3's "is it about how
  someone feels inside?" question is the backstop.

### S4: The sense tagger (now Stage A1, with two models)
A job of its own (not Scribbles) that tags an approved sentence's sense
words, checks them against the sentence, and saves them. It runs after
approval, then retries any it missed when the free allowance ran out.

### S5: The Gallery uses the saved tags (now Stage A2)
The cards, Scribbles' pick and the sense finder light up list words plus
saved tags.

### S6: Tag the sentences already approved (now Stage A3)
A one-off script: a dry run on staging, then on
production with approval, spread over days if it needs more than one
day's free allowance.

## Decisions

- Scribbles stays off for now; the tagger doesn't depend on it. Stage B turns
  it on in suggest mode, after the owner confirms.
- Highlights come from two models reading each sentence and agreeing (Stage
  A); the word list stays for Write and as the fallback.
- Sentences may one day be approved automatically, only as Stage C sets out,
  never sent back automatically, with a teacher able to undo.
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
