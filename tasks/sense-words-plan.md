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
3. **A weekly job, read by AI, that grows the list.** A scheduled workflow,
   on the free GitHub Actions allowance, finds words in approved sentences
   that the list doesn't know. It asks the same free AI which sense each
   word is, if any. Then it checks every answer itself before anything
   changes:
   - the word is in at least 3 approved sentences, is a real English word
     (Scribbles' spelling list), and is on no unsafe-word or name list;
   - the AI says the same sense when asked twice in different ways;
   - the list's tests still pass with it, including the sentences that
     must light up nothing.
   Words that pass go into a PR the job opens itself, against `staging`,
   with the `qa-wolf` label, so QA Wolf tests Write and the Gallery with
   them. Nobody has to read a report; you only say "merge" (or not), as
   with every PR. Over time the list catches up, and the tagger is the
   safety net in between.

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
- **Production stays read-only for the weekly job.** It needs the
  production approval to read it, like the shadow report. The tagger only
  ever writes a sentence's own sense words, and only on a sentence that is
  already approved.
- **It stays free.** It uses Cloudflare's free daily allowance and GitHub
  Actions minutes only. If a day's allowance runs out, the tagger waits for
  the next day, and the list still works.

## Tasks (one small PR each, into `staging`, with `qa-wolf`)

### S1: Word families from base words
Add the forms engine (-s, -es, -ed, -ing with a dropped "e" or a doubled
letter, -ly, y to -ied or -ier) and change the list to base words. The list
also takes Scribbles' sound words (`backend/reviewer/soundWords.ts`) for
Hear.
- [ ] Every word the list matches today still matches (a test pins them)
- [ ] Made-up sentences that only tell still light up nothing
- [ ] QA Wolf: Write's sense flows pass

### S2: A made-up test set, and a score
About 100 made-up sentences, each with the senses a teacher would see in
it, including the kinds of words production missed. A test reports how
many the matcher finds (recall) and how often it is wrong (precision), and
fails if either gets worse.

### S3: The weekly word job (AI-read, opens a PR)
Finds unknown words, asks the free AI for each one's sense twice, runs
the checks above, and opens a PR with the words that pass. It is tried on
staging first, then pointed at production with its approval.

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
- AI reads the weekly report, not a person, and it must stay free. A person
  only merges the PR the job opens.
