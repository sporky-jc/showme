import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { askFor, questionVersion, readAnswer } from "../reviewer/asks.js";
import { READERS } from "../reviewer/decide.js";
import { checkRules } from "../reviewer/rules.js";
import { Sentence } from "../models/sentences.js";
import {
  QUESTIONS,
  ReviewLine,
  claimWork,
  hashShow,
  recordFailure,
  saveAnswer,
} from "../models/reviewLine.js";
import { messageOf } from "../utils/errors.js";

// The routes Scribbles' worker uses (tasks/scribbles-worker-spec.md, T9),
// behind the worker's key (middlewares/workerKey.ts): "give me work" and
// "here are answers". The worker only reads the local models: it never
// gets work for the hosted model, which the backend asks itself.
//
// A sentence is handed out as its line id, a hash of its words, and the
// exact request for each question this reader still has to answer
// (reviewer/asks.ts), which hold its Tell and its words: never who wrote
// it. An explicit worrying phrase is never handed out (it goes to a
// teacher and to no AI). The worker posts each model's raw reply back, and
// it's read strictly here: anything not in the question's exact form is a
// failed try, never an answer.

export const MAX_WORK = 20;

const Id = z.string().refine((id) => mongoose.isValidObjectId(id), "not an id");
const WorkRequest = z
  .object({
    reader: z.enum(READERS),
    // A name for the worker, for claims (letters, digits, dashes)
    worker: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
    limit: z.number().int().min(1).max(MAX_WORK),
  })
  .strict();

const Version = z.string().regex(/^[A-Za-z0-9.:@_/-]{1,120}$/);
const AnswerItem = z
  .object({
    line: Id,
    showHash: z.string().regex(/^[0-9a-f]{64}$/),
    reader: z.enum(READERS),
    question: z.enum(QUESTIONS),
    model: Version,
    questionVersion: Version,
    // The model's reply, as it came
    raw: z.string().max(2000),
  })
  .strict();
const FailureItem = z.object({ line: Id, reader: z.enum(READERS) }).strict();
const AnswersRequest = z
  .object({
    answers: z.array(AnswerItem).max(MAX_WORK * QUESTIONS.length).default([]),
    failures: z.array(FailureItem).max(MAX_WORK).default([]),
  })
  .strict();

// An explicit worrying phrase: never handed to any model
const worryingWords = (tell: string, show: string) => {
  const rules = checkRules(tell, show);
  return rules.outcome === "hold" && rules.reasons.includes("worrying") && !rules.reasons.includes("sensitive-words");
};

export const getWork = async (req: Request, res: Response) => {
  try {
    const parsed = WorkRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Send a reader, a worker name and a limit." });
    const { reader, worker, limit } = parsed.data;
    const work = [];
    for (const line of await claimWork(reader, worker, limit)) {
      const sentence = await Sentence.findById(line.sentence, { tell: 1, show: 1 }).lean();
      // Deleted or edited since it got in line: it's out of date
      if (!sentence || hashShow(sentence.show) !== line.showHash) {
        await ReviewLine.updateOne({ _id: line._id }, { $set: { state: "replaced" }, $unset: { [`claims.${reader}`]: "" } });
        continue;
      }
      if (worryingWords(sentence.tell, sentence.show)) {
        await ReviewLine.updateOne({ _id: line._id }, { $set: { needs: [] }, $unset: { [`claims.${reader}`]: "" } });
        continue;
      }
      const asks = line.needs
        .filter((need) => need.reader === reader)
        .map((need) => askFor(need.question, sentence.tell, sentence.show));
      work.push({ line: String(line._id), showHash: line.showHash, asks });
    }
    return res.json({ work });
  } catch (error) {
    res.locals.error = error;
    return res.status(500).json({ message: messageOf(error) });
  }
};

export const postAnswers = async (req: Request, res: Response) => {
  try {
    const parsed = AnswersRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Send answers and failures in their exact form." });
    const results = [];
    for (const { raw, ...item } of parsed.data.answers) {
      const said = { line: item.line, reader: item.reader, question: item.question };
      // Asked with an older prompt: it doesn't count
      if (item.questionVersion !== questionVersion(item.question)) {
        results.push({ ...said, result: "stale" });
        continue;
      }
      // Not in the question's exact form: a failed try, never an answer
      const answer = readAnswer(item.question, raw);
      if (answer === undefined) {
        await recordFailure(item.line, item.reader);
        results.push({ ...said, result: "invalid" });
        continue;
      }
      results.push({ ...said, result: await saveAnswer({ ...item, answer }) });
    }
    for (const failure of parsed.data.failures) await recordFailure(failure.line, failure.reader);
    return res.json({ results });
  } catch (error) {
    res.locals.error = error;
    return res.status(500).json({ message: messageOf(error) });
  }
};
