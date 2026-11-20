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
// tips, verdicts, reasons and longest sentence) and the list of Tell
// sentences, none of which import anything but zod and types.
import { z } from "zod";
import { PRAISE, TIP_IDS, TIPS } from "../reviewer/tips.js";
import { MAX_CHARACTERS, REASONS, VERDICTS } from "../reviewer/contract.js";
import { MECHANICS } from "../reviewer/mechanics.js";
import { tellForTitle } from "../public/tellList.js";

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
// has: "day1", "day2", ... A `tell` in the request (older websites sent one)
// isn't listed here, so zod drops it: it's accepted, and never used.
// (`show` comes first, so a blank sentence is the problem reported first.)
export const NewSentenceBody = z.object({
  show: showSentence,
  title: z
    .string({ error: TITLE_NOT_TEXT })
    .refine((title) => tellForTitle(title) !== undefined, { error: UNKNOWN_DAY }),
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

// PUT and DELETE /Collections/:id/like: the sentence to like or unlike, from
// the address. It goes into a database query, so, like ReviewBody's, it
// must be a real id written as text.
export const SentenceIdParam = sentenceId;

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
});

// ---- Answers ---------------------------------------------------------------
// What each answer holds, and all it holds: the server sends every answer
// through these (utils/answer.ts), so a field a document has but the
// contract doesn't list (a profile's login details, a sentence's GID) never
// leaves the server.

// GET /: a day's tell sentence (backend/public/tellList.ts)
export const TellSentence = z.object({
  key: z.number(),
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

// Who wrote a sentence, as Collections (which anyone can see) and the review
// queue show it: only the name
export const Author = User.pick({ firstName: true, lastName: true });

// GET /Collections (approved sentences) and GET/PATCH /Admin (the queue)
export const SentenceWithAuthor = Sentence.extend({ author: Author });

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
export const SentencesWithAuthors = z.array(SentenceWithAuthor);
export const ReviewQueue = z.array(QueueSentence);
export const ReviewTips = z.array(ReviewTip);

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

// Any refused or failed request: why
export const ErrorAnswer = z.object({ message: z.string() });

// ---- TypeScript types, read from the definitions above ---------------------

export type NewSentenceBody = z.infer<typeof NewSentenceBody>;
export type EditSentenceBody = z.infer<typeof EditSentenceBody>;
export type ReviewBody = z.infer<typeof ReviewBody>;
export type LoginBody = z.infer<typeof LoginBody>;
export type TestLoginBody = z.infer<typeof TestLoginBody>;
export type TellSentence = z.infer<typeof TellSentence>;
export type User = z.infer<typeof User>;
export type LoginAnswer = z.infer<typeof LoginAnswer>;
export type Sentence = z.infer<typeof Sentence>;
export type OwnSentence = z.infer<typeof OwnSentence>;
export type ScribblesSuggestion = z.infer<typeof ScribblesSuggestion>;
export type QueueSentence = z.infer<typeof QueueSentence>;
export type ReviewTip = z.infer<typeof ReviewTip>;
export type Author = z.infer<typeof Author>;
export type SentenceWithAuthor = z.infer<typeof SentenceWithAuthor>;
export type SentenceLikes = z.infer<typeof SentenceLikes>;
export type ErrorAnswer = z.infer<typeof ErrorAnswer>;
