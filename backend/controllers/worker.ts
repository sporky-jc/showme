import type { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ChecklistAnswer, WELFARE_CONCERNS } from "../reviewer/contract.js";
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
  type Question,
} from "../models/reviewLine.js";
import { messageOf } from "../utils/errors.js";

// The routes Scribbles' worker uses (tasks/scribbles-worker-spec.md, T9),
// behind the worker's key (middlewares/workerKey.ts): "give me work" and
// "here are answers". The worker only reads the local models: it never
// gets work for the hosted model, which the backend asks itself.
//
// A sentence is handed out as its line id, a hash of its words, its Tell
// and its words: never who wrote it. An explicit worrying phrase is never
// handed out (it goes to a teacher and to no AI).

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

// Each question's answer, exactly
const SafetyAnswer = z.union([
  z.enum(["safe", "unsafe"]),
  z.object({ verdict: z.enum(["safe", "unsafe"]), category: z.string().regex(/^S\d{1,2}$/).optional() }).strict(),
]);
const ANSWER_FORMS: Record<Question, z.ZodTypeAny> = {
  safety: SafetyAnswer,
  welfare: z.enum(WELFARE_CONCERNS),
  danger: z.enum(WELFARE_CONCERNS),
  checklist: ChecklistAnswer,
};
const Version = z.string().regex(/^[A-Za-z0-9.:@_/-]{1,120}$/);
const AnswerItem = z
  .object({
    line: Id,
    showHash: z.string().regex(/^[0-9a-f]{64}$/),
    reader: z.enum(READERS),
    question: z.enum(QUESTIONS),
    model: Version,
    questionVersion: Version,
    answer: z.unknown(),
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
      const questions = line.needs.filter((need) => need.reader === reader).map((need) => need.question);
      work.push({ line: String(line._id), showHash: line.showHash, tell: sentence.tell, show: sentence.show, questions });
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
    for (const item of parsed.data.answers) {
      // Not in the question's exact form: refused, as no answer
      if (!ANSWER_FORMS[item.question].safeParse(item.answer).success) {
        results.push({ line: item.line, reader: item.reader, question: item.question, result: "invalid" });
        continue;
      }
      const result = await saveAnswer(item);
      results.push({ line: item.line, reader: item.reader, question: item.question, result });
    }
    for (const failure of parsed.data.failures) await recordFailure(failure.line, failure.reader);
    return res.json({ results });
  } catch (error) {
    res.locals.error = error;
    return res.status(500).json({ message: messageOf(error) });
  }
};
