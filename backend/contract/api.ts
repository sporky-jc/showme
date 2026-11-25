// The API's contract: what each request to the backend may hold, and what
// each answer holds. One definition, used on both sides:
// - The server checks every request body against it (controllers/). Only
//   the fields listed here reach the code; zod drops anything else.
// - The website imports its types (client/src/api/types.ts), so TypeScript
//   checks that the website sends and reads these same shapes.
//
// The website only ever imports *types* from here (`import type`), and types
// disappear when it's built: neither this code nor zod is sent to browsers.
// So this file imports nothing but zod, the reviewer's fixed lists (its
// tips, verdicts, reasons, modes and longest sentence) and the list of Tell
// sentences, none of which import anything but zod and types.
import { z } from "zod";
import { PRAISE, TIP_IDS, TIPS } from "../reviewer/tips.js";
import { MAX_CHARACTERS, REASONS, REVIEWER_MODES, VERDICTS } from "../reviewer/contract.js";
import { MECHANICS } from "../reviewer/mechanics.js";
import { tellForTitle } from "../public/tellList.js";
import { SENSE_KEYS } from "../tagger/senseTags.js";
import { FEATURES } from "../config/features.js";

// ---- Requests --------------------------------------------------------------

// What a refused request is told. The website and the tests rely on these.
const BLANK_SHOW = "The show sentence can't be empty";
export const SHOW_TOO_LONG = `The show sentence can't be longer than ${MAX_CHARACTERS} characters`;
const TITLE_NOT_TEXT = "The title must be text";
export const UNKNOWN_DAY = "Unknown day";
const INVALID_ID = "Invalid sentence id";

// A show sentence must be text with something besides spaces and line breaks,
// so a blank one can't use up a day or wipe out a written one, and no longer
// than any Show sentence (the reviewer holds anything longer, see
// reviewer/rules.ts). (The website checks this too, but anyone can send
// requests straight to the server.) Spaces and line breaks at either end are
// trimmed before it's checked and saved.
const showSentence = z
  .string({ error: BLANK_SHOW })
  .trim()
  .min(1, { error: BLANK_SHOW })
  .max(MAX_CHARACTERS, { error: SHOW_TOO_LONG });

// POST /MyPage: a student's sentence for a new day. Who wrote it, when, and
// whether it's approved are set by the server, never taken from the request.
// So is its Tell sentence: the server looks it up from the day (see
// tellForTitle in public/tellList.ts), so the title must be a day the list
// has: "day1", "day2", ... The website still sends the `tell` it shows, so a
// website build can run against a backend from before this check (a pull
// request's preview runs against the staging backend), but the server never
// uses it.
// (`show` comes first, so a blank sentence is the problem reported first.)
export const NewSentenceBody = z.object({
  show: showSentence,
  title: z
    .string({ error: TITLE_NOT_TEXT })
    .refine((title) => tellForTitle(title) !== undefined, { error: UNKNOWN_DAY }),
  tell: z.string().optional(), // ignored: see above
});

// PATCH /MyPage: new text for one of the student's own sentences, picked by
// its title. The title goes into a database query, so it must be plain text:
// an object like {"$gt": ""} would be read by MongoDB as "any title". Only the
// show sentence changes: its Tell stays the one stored with it.
export const EditSentenceBody = z.object({
  title: z.string({ error: TITLE_NOT_TEXT }),
  show: showSentence,
});

// A sentence's id, sent as text: 24 hexadecimal digits. Ids from a request go
// into database queries, so anything else (like the object {"$ne": null},
// which MongoDB reads as "any sentence") is refused.
const sentenceId = z
  .string({ error: INVALID_ID })
  .regex(/^[0-9a-f]{24}$/i, { error: INVALID_ID });

// PATCH /Admin: an admin's decision on a sentence in the review queue. The id
// goes into a database query, so it must be a real id written as text (24
// hexadecimal digits): an object like {"$ne": null} would be read as "any
// sentence".
// createdAt is the sentence's date as the reviewer's page got it. Editing a
// sentence gives it a new date, so the decision only counts if the sentence
// still has this one: the reviewer approves the words they read, never words
// the student changed after their page loaded.
export const REVIEW_STALE =
  "This sentence changed or was already reviewed. Here is the latest list.";
export const ReviewBody = z.object({
  sentence: z.object(
    {
      _id: sentenceId,
      createdAt: z.iso.datetime({ error: "The sentence's date is missing" }),
    },
    { error: INVALID_ID }
  ),
  status: z.enum(["approve", "redo"], {
    error: "The status must be approve or redo",
  }),
  // With "redo": the tip the student sees with it, from Scribbles' list
  // (reviewer/tips.ts), or none. Only ever an id: the words a student reads
  // come from the list, never from a request. (An approval always gets the
  // praise tip, whatever is sent.)
  tip: z.enum(TIP_IDS, { error: "Unknown tip" }).nullable().optional(),
}).refine(({ status, tip }) => !(status === "redo" && tip === PRAISE), {
  error: "The praise tip only goes with an approval",
  path: ["tip"],
});

// PATCH /Admin/undo: an admin takes back a decision, so the sentence waits
// for review again: "approve" takes an approved sentence out of the gallery,
// "redo" takes back a "Try again". Like ReviewBody's, the id must be a real
// id written as text, and the date the one the teacher's page showed: the
// decision is taken back only if the sentence still has that decision and
// the words the teacher saw, never after the student has edited it.
export const UNDO_STALE =
  "This sentence changed or its decision was already taken back. Here is the latest list.";
export const UndoBody = z.object({
  sentence: z.object(
    {
      _id: sentenceId,
      createdAt: z.iso.datetime({ error: "The sentence's date is missing" }),
    },
    { error: INVALID_ID }
  ),
  // The decision being taken back
  status: z.enum(["approve", "redo"], {
    error: "The status must be approve or redo",
  }),
});

// PATCH /Admin/reviewer: pause Scribbles, the scheduled reviewer, or turn
// him back on, from the Teacher page (models/reviewerSwitch.ts). Only ever
// true or false: the switch can pause him, never switch on a mode the
// deploy didn't (REVIEWER_MODE).
export const ReviewerSwitchBody = z.object({
  paused: z.boolean({ error: "paused must be true or false" }),
});

// PATCH /Admin/owner (the site's owner only): turns the sense tagger on or
// off
export const OwnerSettingsBody = z
  .object({
    senseTagger: z.boolean({ error: "senseTagger must be true or false" }).optional(),
    showAiHighlights: z.boolean({ error: "showAiHighlights must be true or false" }).optional(),
  })
  .refine((body) => body.senseTagger !== undefined || body.showAiHighlights !== undefined, {
    error: "Say which setting to change",
  });

// PUT and DELETE /Collections/:id/like: the sentence to like or unlike, from
// the address. It goes into a database query, so, like ReviewBody's, it
// must be a real id written as text.
export const SentenceIdParam = sentenceId;

// A sentence's look in the gallery, picked by its author once it's approved
// (PUT /MyPage/:id/look): the color of the frame around its picture. Every
// card has a frame: one with no pick shows the first, DEFAULT_FRAME.
export const FRAMES = ["violet", "coral", "teal", "sun"] as const;
export const DEFAULT_FRAME: (typeof FRAMES)[number] = "violet";
const NOT_A_FRAME = "Pick one of the frames";
export const Look = z.object({
  frame: z.enum(FRAMES, { error: NOT_A_FRAME }),
});

// POST /auth: the ID token Google's sign-in button gave the website
export const LoginBody = z.object({
  token: z.string().min(1),
});

// POST /auth/test, the staging-only login for automated browser tests (see
// controllers/testLogin.ts). Anything but `fresh: true` means "keep the test
// account's sentences", as it always has.
export const TestLoginBody = z.object({
  secret: z.string().min(1),
  role: z.string(),
  fresh: z.boolean().optional().catch(undefined),
  // "new": the test student hasn't seen any refresher, so the first one
  // opens by itself (to test that). Anything else: they've seen them all,
  // so no refresher opens by itself over a test's page.
  refreshers: z.enum(["new", "seen"]).optional().catch(undefined),
});

// ---- Answers ---------------------------------------------------------------
// What each answer holds, and all it holds: the server sends every answer
// through these (utils/answer.ts), so a field a document has but the
// contract doesn't list (a profile's login details, a sentence's GID) never
// leaves the server.

// What a Tell sentence asks the student to use: the five senses, or a figure
// of speech (backend/public/tellList.ts)
export const TECHNIQUES = [
  "senses",
  "simile",
  "metaphor",
  "personification",
  "onomatopoeia",
  "hyperbole",
  "alliteration",
  "allusion",
] as const;

// PUT /Login/refreshers/:technique: the refresher the student just saw
export const TechniqueParam = z.enum(TECHNIQUES, { error: "Unknown technique" });

// GET /: a day's tell sentence (backend/public/tellList.ts)
export const TellSentence = z.object({
  key: z.number(),
  // Its permanent id: a student's sentence names its Tell by it (the
  // sentence's title). Classic's are "day1".."day35".
  id: z.string(),
  technique: z.enum(TECHNIQUES),
  title: z.string(), // "Day 1"
  tell: z.string(),
  image: z.string(), // its picture on the Collections page
});

// The signed-in user: GET /Login, and POST /auth as { user }
export const User = z.object({
  id: z.string(), // the Google account's id
  firstName: z.string(),
  // Not required by the database: accounts made before last names were
  // saved, or whose Google account has none, may not have one. An old
  // account might hold null instead; that's sent as no last name.
  lastName: z
    .string()
    .nullable()
    .transform((name) => name ?? undefined)
    .optional(),
  email: z.string(),
  isAdmin: z.boolean(),
  // The refreshers the student has seen (PUT /Login/refreshers/:technique):
  // each one opens by itself only the first time. This server always sends
  // it (older profiles: none), but a login saved by the website before it
  // existed has none, so it's optional to the website.
  seenRefreshers: z.array(z.enum(TECHNIQUES)).optional(),
});
export const LoginAnswer = z.object({ user: User });

// A student's sentence: GET /MyPage lists them, and POST and PATCH /MyPage
// send back the one saved
export const Sentence = z.object({
  _id: z.string(),
  title: z.string(), // the day it was written for: "day1", "day2", ...
  tell: z.string(),
  show: z.string(),
  approved: z.boolean(),
  toRedo: z.boolean(), // an admin sent it back to be rewritten
  createdAt: z.string(), // when it was written or last edited (an ISO date)
  // Its look in the gallery, once its author picks one (see Look). An
  // edit clears it, like its likes: it waits to be approved again.
  look: Look.nullish().transform((look) => look ?? undefined).optional(),
});

// A tip from Scribbles' list (reviewer/tips.ts), stored by its id and sent
// with its words
const tipWithWords = (id: (typeof TIP_IDS)[number]) => ({ id, text: TIPS[id] });

// A student's own sentence, with the tip their teacher chose for it (or the
// praise tip, once approved): GET /MyPage, and POST and PATCH /MyPage
export const OwnSentence = Sentence.extend({
  tip: z
    .enum(TIP_IDS)
    .nullish()
    .transform((id) => (id ? tipWithWords(id) : undefined))
    .optional(),
});

// Who wrote a sentence, as the Teacher page (admins only) shows it: only the
// name, but all of it, so a teacher knows which Mia it is
export const Author = User.pick({ firstName: true, lastName: true });

// The first letter of a last name, or none for no last name (or a blank one).
// Array.from splits by letter, not by UTF-16 code unit, so a name starting
// with a letter outside the basic set isn't cut in half.
const initialOf = (name: string | null | undefined) =>
  Array.from(name?.trim() ?? "")[0];

// Who wrote a sentence, as the gallery shows it: "Mia T.". Anyone can load
// the gallery without signing in, and anyone can read its whole answer, not
// just what the page shows, so the surname itself never leaves the server:
// only its first letter does. The field is still called lastName, holding
// just that letter, because the website that is live while a new backend
// deploys (the backend goes out a few minutes first, see
// promote-production.yml) shows the first letter of lastName: it shows the
// same "Mia T." from "T" as it did from "Torres". Every answer goes through
// the contract (utils/answer.ts), so the cut is made for every sentence the
// gallery sends, whatever the database query returned.
export const GalleryAuthor = z.object({
  firstName: z.string(),
  lastName: z.string().nullish().transform(initialOf).optional(),
});

// GET/PATCH /Admin (the queue) and GET /Admin/decisions: the whole name
export const SentenceWithAuthor = Sentence.extend({ author: Author });

// The words of an approved sentence that two AI models agree show a sense
// there, each with that sense (backend/tagger/, Stage A of
// tasks/sense-words-plan.md). Only words of the sentence itself.
export const SenseTag = z.object({ word: z.string(), sense: z.enum(SENSE_KEYS) });

// GET /Collections (approved sentences): only the author's first name and
// last initial, and the sentence's sense highlights, when it has some for
// its current words (the website lights them up with the word list's)
export const GallerySentence = Sentence.extend({
  author: GalleryAuthor,
  senseTags: z.array(SenseTag).optional(),
});

// What Scribbles suggests for a sentence waiting for review (reviewer/,
// saved by the scheduled reviewer), for the Teacher page only: never sent to
// students or the gallery
export const ScribblesSuggestion = z.object({
  verdict: z.enum(VERDICTS),
  tip: z
    .enum(TIP_IDS)
    .nullish()
    .transform((id) => (id ? tipWithWords(id) : null)),
  // Why: "worrying" means the student may need help
  reasons: z.array(z.enum(REASONS)),
  // Words not in the dictionary, and capitals and punctuation to fix
  misspelled: z.array(z.string()).optional(),
  mechanics: z.array(z.object({ kind: z.enum(MECHANICS), text: z.string() })).optional(),
});

// A sentence in the review queue, with Scribbles' suggestion for its
// current words when there is one: GET and PATCH /Admin
export const QueueSentence = SentenceWithAuthor.extend({
  suggestion: ScribblesSuggestion.optional(),
});

// The tips a teacher can send back with "Try again": GET /Admin/tips
export const ReviewTip = z.object({ id: z.enum(TIP_IDS), text: z.string() });

// The lists: GET / (tell sentences), GET /MyPage (a student's own
// sentences), GET /Collections, GET/PATCH /Admin and GET /Admin/tips
export const TellSentences = z.array(TellSentence);
export const Sentences = z.array(Sentence);
export const OwnSentences = z.array(OwnSentence);
export const GallerySentences = z.array(GallerySentence);
export const ReviewQueue = z.array(QueueSentence);

// GET /Admin/decisions: the sentences teachers approved or sent back most
// recently, newest decision first, so one can be taken back (approved and
// toRedo say which decision it was). PATCH /Admin/undo answers with the
// queue and this list as they are after the undo.
export const RecentDecisions = z.array(SentenceWithAuthor);
export const UndoAnswer = z.object({ queue: ReviewQueue, decisions: RecentDecisions });
export const ReviewTips = z.array(ReviewTip);

// GET /Admin/count: how many sentences wait in this teacher's queue, and how
// many of those Scribbles held as worrying ("Check in" on the Teacher page),
// for the badge on the Teacher link. Only counts: no words, no names.
export const ReviewCounts = z.object({
  checkIn: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});

// GET and PATCH /Admin/reviewer: Scribbles' mode as the deploy set it
// ("off": he never runs, and the switch can't change that), and whether a
// teacher has paused him, since when
export const ReviewerStatus = z.object({
  mode: z.enum(REVIEWER_MODES),
  paused: z.boolean(),
  pausedAt: z.iso.datetime().optional(),
});

// GET and PATCH /Admin/owner (the site's owner only): the Owner settings on
// the Teacher page. The sense tagger (tagger/queue.ts): whether it's on,
// whether the Cloudflare keys it needs are set (ready), when it was last
// turned on or off, and how many sentences it tagged today against its
// daily limit (perDay), and when it last tagged one.
export const OwnerSettings = z.object({
  senseTagger: z.object({
    on: z.boolean(),
    ready: z.boolean(),
    changedAt: z.iso.datetime().optional(),
    today: z.number().int().nonnegative(),
    perDay: z.number().int().positive(),
    lastTaggedAt: z.iso.datetime().optional(),
  }),
  // Whether kids see the tagger's highlights in the Gallery
  showAiHighlights: z.object({
    on: z.boolean(),
    changedAt: z.iso.datetime().optional(),
  }),
});

// An approved sentence's likes, as a signed-in student sees them: GET
// /Collections/likes lists every approved sentence's, and PUT and DELETE
// /Collections/:id/like send back the one changed. Likes are for signed-in
// users only, so they're kept out of GET /Collections, which anyone can load.
// Only the count is sent, never who liked a sentence.
export const SentenceLikes = z.object({
  _id: z.string(), // the sentence's id, as GET /Collections sends it
  // Every approved sentence starts with 1, from passing review, plus one for
  // each student who liked it
  likes: z.number(),
  likedByMe: z.boolean(), // the signed-in user liked it
  mine: z.boolean(), // the signed-in user wrote it (and so can't like it)
});
export const SentencesLikes = z.array(SentenceLikes);

// GET /features: which features being tried out are on here (see
// config/features.ts). Every flag is always sent, on or off.
export const Features = z.object(
  Object.fromEntries(FEATURES.map((name) => [name, z.boolean()])) as Record<(typeof FEATURES)[number], z.ZodBoolean>
);

// Any refused or failed request: why
export const ErrorAnswer = z.object({ message: z.string() });

// ---- TypeScript types, read from the definitions above ---------------------

export type NewSentenceBody = z.infer<typeof NewSentenceBody>;
export type EditSentenceBody = z.infer<typeof EditSentenceBody>;
export type ReviewBody = z.infer<typeof ReviewBody>;
export type LoginBody = z.infer<typeof LoginBody>;
export type TestLoginBody = z.infer<typeof TestLoginBody>;
export type TellSentence = z.infer<typeof TellSentence>;
export type Features = z.infer<typeof Features>;
export type Technique = (typeof TECHNIQUES)[number];
export type User = z.infer<typeof User>;
export type LoginAnswer = z.infer<typeof LoginAnswer>;
export type Sentence = z.infer<typeof Sentence>;
export type OwnSentence = z.infer<typeof OwnSentence>;
export type ScribblesSuggestion = z.infer<typeof ScribblesSuggestion>;
export type QueueSentence = z.infer<typeof QueueSentence>;
export type ReviewTip = z.infer<typeof ReviewTip>;
export type Author = z.infer<typeof Author>;
export type SentenceWithAuthor = z.infer<typeof SentenceWithAuthor>;
export type GalleryAuthor = z.infer<typeof GalleryAuthor>;
export type GallerySentence = z.infer<typeof GallerySentence>;
export type SenseTag = z.infer<typeof SenseTag>;
export type UndoBody = z.infer<typeof UndoBody>;
export type UndoAnswer = z.infer<typeof UndoAnswer>;
export type ReviewCounts = z.infer<typeof ReviewCounts>;
export type ReviewerSwitchBody = z.infer<typeof ReviewerSwitchBody>;
export type ReviewerStatus = z.infer<typeof ReviewerStatus>;
export type OwnerSettingsBody = z.infer<typeof OwnerSettingsBody>;
export type OwnerSettings = z.infer<typeof OwnerSettings>;
export type SentenceLikes = z.infer<typeof SentenceLikes>;
export type Look = z.infer<typeof Look>;
export type Frame = (typeof FRAMES)[number];
export type ErrorAnswer = z.infer<typeof ErrorAnswer>;
