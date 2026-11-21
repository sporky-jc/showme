import type { Request, Response } from "express";
import {
  EditSentenceBody,
  GallerySentences,
  NewSentenceBody,
  OwnSentence,
  OwnSentences,
  RecentDecisions,
  REVIEW_STALE,
  ReviewBody,
  ReviewCounts,
  ReviewQueue,
  ReviewTips,
  TellSentences,
  UNDO_STALE,
  UndoAnswer,
  UndoBody,
  UNKNOWN_DAY,
  User,
} from "../contract/api.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { ReviewDecision } from "../models/reviewDecisions.js";
import { logger } from "firebase-functions/logger";
import { PRAISE, TIP_IDS, TIPS } from "../reviewer/tips.js";
import { Types } from "mongoose";
import { dayKeyOf, Sentence } from "../models/sentences.js";
import Profile from "../models/profile.js";
import tellList, { tellForTitle } from "../public/tellList.js";
import { readSession } from "../middlewares/auth.js";
import { SESSION_COOKIE, sessionCookieOptions } from "../config/session.js";
import { answer } from "../utils/answer.js";
import { firstProblem, messageOf } from "../utils/errors.js";
import { isTestAccount, TEST_SENTENCES } from "./testLogin.js";

// Route for getting the Tell Sentences. The list lives in the code
// (public/tellList.ts), so it's sent straight from memory with no database
// round trips.
export const getTellSentences = (req: Request, res: Response) => {
  answer(res, 200, TellSentences, tellList);
};

export const getUserSentences = async (req: Request, res: Response) => {
  try {
    const userSentences = await Sentence.find({ GID: req.userId });

    answer(res, 200, OwnSentences, userSentences);
  } catch (error) {
    // Saved for this request's log line (see middlewares/requestLog.ts)
    res.locals.error = error;
    res.status(404).json({ message: messageOf(error) });
  }
};

// Newest first, to the millisecond. Not sorted by the database: some early
// sentences hold their date as text, and the database puts every text date
// after every real one. new Date() reads both kinds, keeping milliseconds
// (unlike Date.parse on a Date, which drops them).
const newestFirst = <T extends { createdAt: Date }>(sentences: T[]) =>
  sentences.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

// Sentences matching `filter`, newest first, with each author's name filled
// in. Used by the review queue (/Admin, admins only) and Collections (anyone,
// no login needed). Both pages show only the author's name, so only the name
// is sent (and to Collections only the last name's first letter: its
// contract, GalleryAuthor, cuts the rest off before it's sent): the rest of a profile holds the student's email, their Google
// account id and their login details. A sentence's own GID is that same
// Google account id, so it's left out too, as is who liked it (likes are
// only for signed-in users, through their own routes).
const sentencesWithAuthorNames = async (filter: {
  approved: boolean;
  toRedo?: boolean;
  GID?: RegExp | { $not: RegExp };
}) =>
  newestFirst(
    await Sentence.find(filter, "-GID -likedBy").populate(
      "author",
      "firstName lastName -_id"
    )
  );

// MongoDB's answer when a unique index already holds the value
const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

// What a second sentence for the same day is told (POST /MyPage)
export const DAY_ALREADY_WRITTEN =
  "You already wrote a sentence for this day. Edit that one instead.";

export const createNewUserSentence = async (req: Request, res: Response) => {
  try {
    // Only the sentence text comes from the browser. Who wrote it comes from
    // the verified token (req.userId), never from the request body, which
    // anyone can edit. (Express 5 leaves req.body undefined when a request
    // has no body.)
    const body = NewSentenceBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    const { show, title } = body.data;
    // The day's Tell, from the list: never one from the request, which could
    // say anything (and would be shown in the gallery and sent to the AI
    // reviewer). The contract has checked the day is on the list.
    const tell = tellForTitle(title);
    if (tell === undefined) {
      return res.status(400).json({ message: UNKNOWN_DAY });
    }

    const user = await Profile.findOne({ id: req.userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // One sentence per student per day: a second one for the same day is
    // refused, so a student changes a day's sentence by editing it (PATCH).
    // The website only ever asks for the next day it hasn't written, and
    // never sends a sentence twice. This finds older sentences too, which
    // have no dayKey (see models/sentences.ts).
    // ($eq: the title is already a checked day, and this says so to the query)
    if (await Sentence.exists({ GID: user.id, title: { $eq: title } })) {
      return res.status(409).json({ message: DAY_ALREADY_WRITTEN });
    }

    // When User creates a new show sentence. Two requests for the same day
    // arriving together could both pass the check above; the unique dayKey
    // lets only one be saved, and the other is refused the same way.
    const newSentence = new Sentence({
      title,
      tell,
      show,
      author: user._id,
      GID: user.id,
      dayKey: dayKeyOf(user.id, title),
    });
    try {
      await newSentence.save();
    } catch (error) {
      if (isDuplicateKey(error)) {
        return res.status(409).json({ message: DAY_ALREADY_WRITTEN });
      }
      throw error;
    }
    user.ownSentences.push(newSentence._id);
    await user.save();
    answer(res, 201, OwnSentence, newSentence);
  } catch (error) {
    res.locals.error = error;
    res.status(409).json({ message: messageOf(error) });
  }
};

export const editUserSentence = async (req: Request, res: Response) => {
  try {
    // The title must be plain text and the sentence not blank (see the
    // contract): an object title would pick out a sentence the request
    // never named.
    const body = EditSentenceBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    const { title, show } = body.data;
    // A sentence for a day on the list gets that day's Tell back, mending
    // any Tell a request supplied before the server looked it up itself.
    // (An older sentence whose title isn't a day keeps the Tell it has.)
    const tell = tellForTitle(title);
    // Replace it in one write: reading it, changing it and saving it would
    // leave a gap in which a reviewer's approval could land and then stay on
    // the new words (Mongoose saves only the fields it sees change). It goes
    // back to waiting, with a new date (so a reviewer's page showing the old
    // words is now out of date, see ReviewBody), and its likes start again
    // from the 1 like for passing review once approved (see
    // controllers/likes.ts): they were for the old text. So does its tip:
    // it was about the old words.
    const updateSentence = await Sentence.findOneAndUpdate(
      { GID: req.userId, title: title },
      {
        $set: {
          show,
          ...(tell === undefined ? {} : { tell }),
          createdAt: new Date(),
          toRedo: false,
          approved: false,
          likedBy: [],
        },
        // ... and when the reviewer last tried and failed (its new words go
        // in line with the other new sentences, reviewer/queue.ts)
        // ... and when a teacher decided it: it's waiting again
        $unset: { tip: "", lastTriedAt: "", decidedAt: "" },
      },
      { new: true }
    );

    if (!updateSentence) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    answer(res, 201, OwnSentence, updateSentence);
  } catch (error) {
    res.locals.error = error;
    res.status(409).json({ message: messageOf(error) });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    // If the request carries a valid login, bump the user's token version so
    // that token, and every copy of it, stops working.
    const session = readSession(req);
    if (session) {
      await Profile.updateOne({ id: session.id }, { $inc: { tokenVersion: 1 } });
    }

    // Always tell the browser to delete its cookie, even if the token was
    // missing or already expired. The options must match the ones it was set with.
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// Route for register/Retrieve/signout user
export const getUserInfo = async (req: Request, res: Response) => {
  // Register/Retrieve user
  try {
    // Only the profile: the student's sentences come from GET /MyPage
    const user = await Profile.findOne({ id: req.userId });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    answer(res, 200, User, user);
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// The sentences awaiting review that this admin sees. The test admin
// (signed in through the staging test login, see testLogin.ts) gets only
// test accounts' sentences: if the test login's secret ever leaked, whoever
// used it still couldn't touch a real person's sentence. A real teacher gets
// everyone's but the test accounts', so the automated tests' leftovers on
// staging never crowd their queue (production has no test accounts).
const reviewQueue = (adminId: string | undefined) => ({
  approved: false,
  toRedo: false,
  GID: isTestAccount(adminId) ? TEST_SENTENCES : { $not: TEST_SENTENCES },
});

// The review queue for this admin, each sentence with Scribbles' suggestion
// for its current words (saved by the scheduled reviewer, reviewer/queue.ts),
// when there is one. A suggestion for words the student has since changed
// isn't shown: it's about the old words.
const reviewQueueFor = async (adminId: string | undefined) => {
  const queue = await sentencesWithAuthorNames(reviewQueue(adminId));
  const suggestions = await ReviewSuggestion.find(
    { sentence: { $in: queue.map((sentence) => sentence._id) } },
    // Not who decided, when, or what each provider answered (`attempts`, the
    // audit trail): those are for the logs, never a browser
    "-_id -decidedBy -createdAt -attempts"
  ).lean<{ sentence: Types.ObjectId; show: string }[]>();
  const forWords = new Map(suggestions.map((s) => [`${String(s.sentence)} ${s.show}`, s]));
  return queue.map((sentence) => ({
    ...sentence.toObject(),
    suggestion: forWords.get(`${String(sentence._id)} ${sentence.show}`),
  }));
};

// How many sentences wait in this admin's queue, and how many of them
// Scribbles held as worrying ("Check in" on the Teacher page, the first
// cards there), for the badge on the site's Teacher link. The same queue as
// the Teacher page (reviewQueue, so the same test-account rule), and the
// same rule for which suggestion counts: only one for a sentence's current
// words. Only each waiting sentence's id and words are read, with no
// authors, so it's much lighter than loading the queue: the waiting
// sentences come through the index on approved and toRedo
// (models/sentences.ts), and their suggestions through the one on sentence
// and show (models/reviewSuggestions.ts).
const reviewCountsFor = async (adminId: string | undefined) => {
  const queue = await Sentence.find(reviewQueue(adminId), { _id: 1, show: 1 }).lean<
    { _id: Types.ObjectId; show: string }[]
  >();
  if (queue.length === 0) return { checkIn: 0, waiting: 0 };
  const worrying = await ReviewSuggestion.find(
    { sentence: { $in: queue.map((s) => s._id) }, reasons: { $eq: "worrying" } },
    { _id: 0, sentence: 1, show: 1 }
  ).lean<{ sentence: Types.ObjectId; show: string }[]>();
  // A suggestion about words the student has since changed doesn't count
  const current = new Set(queue.map((s) => `${String(s._id)} ${s.show}`));
  return {
    checkIn: worrying.filter((s) => current.has(`${String(s.sentence)} ${s.show}`)).length,
    waiting: queue.length,
  };
};

// Route for the badge on the Teacher link (admins only)
export const getReviewCounts = async (req: Request, res: Response) => {
  try {
    answer(res, 200, ReviewCounts, await reviewCountsFor(req.userId));
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// Route for the tips a teacher can send back with "Try again": every tip
// but the praise, which only goes with an approval
export const getReviewTips = (req: Request, res: Response) => {
  answer(
    res,
    200,
    ReviewTips,
    TIP_IDS.filter((id) => id !== PRAISE).map((id) => ({ id, text: TIPS[id] }))
  );
};

// Route for fetching all sentences awaiting approval
export const getPendingApprovalSentences = async (
  req: Request,
  res: Response
) => {
  try {
    // fetch all sentences that are not approved, newest (last edited) first
    answer(res, 200, ReviewQueue, await reviewQueueFor(req.userId));
  } catch (error) {
    res.locals.error = error;
    res.status(409).json({ message: messageOf(error) });
  }
};

// Route for approving or rejecting sentences
export const updatePendingApprovalSentences = async (
  req: Request,
  res: Response
) => {
  try {
    // The admin middleware on this route has already checked isAdmin.
    // The id must be a real id written as text, and the decision approve or
    // redo (see the contract): an object id would pick out a sentence nobody
    // chose.
    const body = ReviewBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    const { status, sentence, tip } = body.data;

    // The test admin may only review test accounts' sentences (see reviewQueue)
    const which = {
      _id: sentence._id,
      ...(isTestAccount(req.userId) ? { GID: TEST_SENTENCES } : {}),
    };

    // The sentence as it is stored, without Mongoose's conversions: some early
    // sentences hold their date as text (see newestFirst), and a few have none
    const stored = await Sentence.findOne(which, {
      approved: 1,
      toRedo: 1,
      createdAt: 1,
      show: 1,
    }).lean<{ approved?: boolean; toRedo?: boolean; createdAt?: Date | string; show: string }>();
    if (!stored) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    // The decision counts only if the sentence is still waiting and still has
    // the date the reviewer's page showed (see ReviewBody): otherwise a stale
    // page could undo another decision, or approve words the reviewer never
    // read. A sentence with no stored date gets a new one each time it's read,
    // so its page can't send it back: only its state is checked (editing it
    // gives it a real date, so an edit still makes the page stale).
    const sameDate =
      stored.createdAt === undefined ||
      new Date(stored.createdAt).getTime() === new Date(sentence.createdAt).getTime();
    if (stored.approved || stored.toRedo || !sameDate) {
      return res.status(409).json({ message: REVIEW_STALE });
    }

    // One write, matching the stored date exactly as stored (the database
    // driver, unlike Mongoose, doesn't turn text dates into real ones), so
    // nothing can change the sentence between the check above and the update
    const { matchedCount } = await Sentence.collection.updateOne(
      {
        _id: new Types.ObjectId(sentence._id),
        ...(isTestAccount(req.userId) ? { GID: TEST_SENTENCES } : {}),
        approved: false,
        toRedo: false,
        createdAt: stored.createdAt ?? { $exists: false },
        // The words read above are the words decided on (recorded below)
        show: stored.show,
      },
      // approve (with the praise tip), or "redo" (with the tip the reviewer
      // chose, or none), the only other decision the contract allows
      // (and when, for the Teacher page's recent decisions). A "redo" counts
      // one more send-back for this sentence (redoCount, models/sentences.ts).
      status === "approve"
        ? { $set: { approved: true, toRedo: false, tip: PRAISE, decidedAt: new Date() } }
        : tip
          ? { $set: { approved: false, toRedo: true, tip, decidedAt: new Date() }, $inc: { redoCount: 1 } }
          : {
              $set: { approved: false, toRedo: true, decidedAt: new Date() },
              $unset: { tip: "" },
              $inc: { redoCount: 1 },
            }
    );
    if (matchedCount === 0) {
      // It changed between the check and the update
      return res.status(409).json({ message: REVIEW_STALE });
    }

    // Kept for the shadow report (models/reviewDecisions.ts). The decision
    // has already been made, so a failure here is only logged.
    try {
      await ReviewDecision.create({
        sentence: sentence._id,
        show: stored.show,
        status,
        tip: status === "approve" ? PRAISE : (tip ?? null),
      });
    } catch (error) {
      logger.warn(`Could not record a teacher's decision: ${messageOf(error)}`, { sentence: sentence._id });
    }

    // send back the updated queue, newest first
    answer(res, 201, ReviewQueue, await reviewQueueFor(req.userId));
  } catch (error) {
    res.locals.error = error;
    // 500, not 409: the page reads 409 as "changed or already reviewed"
    res.status(500).json({ message: messageOf(error) });
  }
};

// fetch approved sentences from database
export const fetchApprovedSentences = async (req: Request, res: Response) => {
  try {
    // find all approved sentences, newest first
    const approvedSentences = await sentencesWithAuthorNames({
      approved: true,
    });

    // GallerySentences, not the Teacher page's SentencesWithAuthor: anyone
    // can read this answer, so each author goes out as a first name and a
    // last initial only (see GalleryAuthor)
    answer(res, 200, GallerySentences, approvedSentences);
  } catch (error) {
    res.locals.error = error;
    res.status(409).json({ message: messageOf(error) });
  }
};

// How many decisions the Teacher page lists to take back: a few days of a
// class's sentences. Older ones can't be taken back from the page.
export const RECENT_DECISIONS = 50;

// The sentences teachers approved or sent back most recently, newest
// decision first, each with its author's whole name (admins only, like the
// queue). The same test-account rule as the queue (see reviewQueue): the
// test admin sees only test accounts' decisions, a real teacher everyone's
// but theirs. Sentences decided before decisions were dated have no
// decidedAt; the database puts those after every dated one, newest written
// first among themselves.
const recentDecisionsFor = (adminId: string | undefined) =>
  Sentence.find(
    {
      $or: [{ approved: true }, { toRedo: true }],
      GID: isTestAccount(adminId) ? TEST_SENTENCES : { $not: TEST_SENTENCES },
    },
    "-GID -likedBy"
  )
    .sort({ decidedAt: -1, createdAt: -1 })
    .limit(RECENT_DECISIONS)
    .populate("author", "firstName lastName -_id");

// Route for the Teacher page's recent decisions
export const getRecentDecisions = async (req: Request, res: Response) => {
  try {
    answer(res, 200, RecentDecisions, await recentDecisionsFor(req.userId));
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// Route for taking back a decision: an approved sentence comes out of the
// gallery, or one sent back with "Try again" stops asking the student to,
// and either way it waits in the Teacher page's queue again, with its words,
// date and likes as they were. Admins only, like the review itself. Who took
// it back, and when, is in the request's log line (its userId, see
// middlewares/requestLog.ts), as it is for the decision itself.
export const undoDecision = async (req: Request, res: Response) => {
  try {
    // The admin middleware on this route has already checked isAdmin. As
    // with a decision, the id must be a real id written as text (see the
    // contract), and $eq says so to the query as well.
    const body = UndoBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    const { status, sentence } = body.data;
    const id = new Types.ObjectId(sentence._id);
    // The test admin may only touch test accounts' sentences (see reviewQueue)
    const testOnly = isTestAccount(req.userId) ? { GID: TEST_SENTENCES } : {};

    // As stored, without Mongoose's conversions (see
    // updatePendingApprovalSentences: some early dates are text)
    const stored = await Sentence.findOne(
      { _id: { $eq: id }, ...testOnly },
      { approved: 1, toRedo: 1, createdAt: 1, show: 1 }
    ).lean<{ approved?: boolean; toRedo?: boolean; createdAt?: Date | string; show: string }>();
    if (!stored) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    // Only the decision the teacher's page showed, on the words it showed: a
    // sentence the student has edited since is already waiting (and may say
    // something new), and one already taken back has nothing to undo
    const decided =
      status === "approve" ? stored.approved === true : stored.toRedo === true && !stored.approved;
    const sameDate =
      stored.createdAt === undefined ||
      new Date(stored.createdAt).getTime() === new Date(sentence.createdAt).getTime();
    if (!decided || !sameDate) {
      return res.status(409).json({ message: UNDO_STALE });
    }

    // One write, matching what was just checked, so nothing can change the
    // sentence in between. Its tip goes too: it came with the decision.
    const { matchedCount } = await Sentence.collection.updateOne(
      {
        _id: { $eq: id },
        ...testOnly,
        ...(status === "approve" ? { approved: true } : { approved: false, toRedo: true }),
        createdAt: stored.createdAt ?? { $exists: false },
        // The words read above are the words whose decision is taken back
        // (marked below)
        show: { $eq: stored.show },
      },
      { $set: { approved: false, toRedo: false }, $unset: { tip: "", decidedAt: "" } }
    );
    if (matchedCount === 0) {
      return res.status(409).json({ message: UNDO_STALE });
    }

    // A send-back taken back doesn't count towards the sentence's limit
    // (redoCount, models/sentences.ts): the teacher changed their mind. Never
    // below 0, for a sentence sent back before the count was kept.
    if (status === "redo") {
      await Sentence.collection.updateOne({ _id: { $eq: id }, redoCount: { $gt: 0 } }, { $inc: { redoCount: -1 } });
    }

    // The shadow report (models/reviewDecisions.ts) mustn't count a decision
    // the teacher took back: the latest one recorded for these words, if it
    // was recorded, is marked undone. The undo has already happened, so a
    // failure here is only logged, as when a decision is recorded.
    try {
      await ReviewDecision.findOneAndUpdate(
        {
          sentence: { $eq: id },
          show: { $eq: stored.show },
          status: { $eq: status },
          undoneAt: { $exists: false },
        },
        { $set: { undoneAt: new Date() } },
        { sort: { decidedAt: -1 } }
      );
    } catch (error) {
      logger.warn(`Could not mark a teacher's decision undone: ${messageOf(error)}`, { sentence: sentence._id });
    }

    // Both lists as they are now: the sentence is back in the queue, and no
    // longer among the decisions
    answer(res, 201, UndoAnswer, {
      queue: await reviewQueueFor(req.userId),
      decisions: await recentDecisionsFor(req.userId),
    });
  } catch (error) {
    res.locals.error = error;
    // 500, not 409: the page reads 409 as "changed or already taken back"
    res.status(500).json({ message: messageOf(error) });
  }
};
