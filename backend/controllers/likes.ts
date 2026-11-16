import type { Request, Response } from "express";
import type { Types } from "mongoose";
import {
  SentenceIdParam,
  SentenceLikes,
  SentencesLikes,
} from "../contract/api.js";
import { Sentence } from "../models/sentences.js";
import Profile from "../models/profile.js";
import { firstProblem, messageOf } from "../utils/errors.js";
import { answer } from "../utils/answer.js";

// Likes on the Collections page. Only signed-in users see or give them (the
// routes all sit behind the auth middleware), so they have routes of their
// own: GET /Collections, which anyone can load, never sends them.
//
// Every approved sentence has 1 like for passing review, plus one per student
// who liked it (its likedBy list). That first like is counted, not stored, so
// sentences approved before likes existed have it too, and no one can take
// it away by unliking.
const LIKE_FOR_PASSING_REVIEW = 1;

// Only what a sentence's likes need, never its text, author or who liked it
const LIKES_FIELDS = "likedBy GID";

interface LikedSentence {
  _id: Types.ObjectId;
  GID: string;
  likedBy: Types.ObjectId[];
}

// One sentence's likes, as the signed-in user (`me`) sees them
const likesFor = (
  sentence: LikedSentence,
  me: { _id: Types.ObjectId; id: string }
) => ({
  _id: sentence._id,
  likes: LIKE_FOR_PASSING_REVIEW + sentence.likedBy.length,
  likedByMe: sentence.likedBy.some((id) => id.equals(me._id)),
  mine: sentence.GID === me.id,
});

// The signed-in user's profile (the auth middleware has checked the login)
const signedInProfile = (req: Request) =>
  Profile.findOne({ id: req.userId }, "_id id");

// GET /Collections/likes: every approved sentence's likes
export const getLikes = async (req: Request, res: Response) => {
  try {
    const me = await signedInProfile(req);
    if (!me) {
      return res.status(404).json({ message: "User not found" });
    }
    const sentences = await Sentence.find({ approved: true }, LIKES_FIELDS);
    answer(
      res,
      200,
      SentencesLikes,
      sentences.map((sentence) => likesFor(sentence, me))
    );
  } catch (error) {
    // Saved for this request's log line (see middlewares/requestLog.ts)
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// PUT (like) and DELETE (unlike) /Collections/:id/like. Both can be repeated
// safely: liking twice still counts once, and unliking a sentence the user
// never liked changes nothing. Each answers with the sentence's likes after.
const changeLike =
  (like: boolean) => async (req: Request, res: Response) => {
    // The id goes into a database query, so it must be a real id (see the
    // contract)
    const id = SentenceIdParam.safeParse(req.params.id);
    if (!id.success) {
      return res.status(400).json({ message: firstProblem(id.error) });
    }

    try {
      const me = await signedInProfile(req);
      if (!me) {
        return res.status(404).json({ message: "User not found" });
      }

      // Only approved sentences can be liked: the others aren't on the
      // Collections page. Nor can a student like their own. Both are part of
      // the update's filter too, so a sentence sent back for a redo (or
      // edited) between this check and the update isn't changed.
      const sentence = await Sentence.findOne(
        { _id: id.data, approved: true },
        "GID"
      );
      if (!sentence) {
        return res.status(404).json({ message: "Sentence not found" });
      }
      if (like && sentence.GID === me.id) {
        return res
          .status(403)
          .json({ message: "You can't like your own sentence" });
      }

      // $addToSet adds the user only if they aren't there yet, and $pull
      // removes them, each in one step: two likes at once can't count twice.
      const updated = await Sentence.findOneAndUpdate(
        { _id: id.data, approved: true },
        like
          ? { $addToSet: { likedBy: me._id } }
          : { $pull: { likedBy: me._id } },
        { returnDocument: "after", projection: LIKES_FIELDS }
      );
      if (!updated) {
        return res.status(404).json({ message: "Sentence not found" });
      }

      answer(res, 200, SentenceLikes, likesFor(updated, me));
    } catch (error) {
      res.locals.error = error;
      res.status(500).json({ message: messageOf(error) });
    }
  };

export const likeSentence = changeLike(true);
export const unlikeSentence = changeLike(false);
