// The line keeper (tasks/scribbles-worker-spec.md, T11, first part): puts
// waiting sentences in the review line, and each time it runs, turns the
// answers each version has into the decider's next step (decide.ts):
//
//   - an answer still needed from a local model: noted as a "need", so the
//     worker on the VM is handed that question (controllers/worker.ts);
//   - the hosted model to ask: noted as a need for it, with when the wait
//     began (the next part asks it, within its daily allowance);
//   - approve, send back or a teacher: the version is settled, and the step
//     saved with it.
//
// Nothing here changes what students, teachers or the gallery see: the
// settled step is only kept in the line, for the suggestions part to show
// teachers. It needs no AI and no network: it only reads and writes the
// database, so it can run every few minutes.
import mongoose from "mongoose";
import tellList from "../public/tellList.js";
import { TEST_SENTENCES } from "../config/testAccounts.js";
import { Sentence } from "../models/sentences.js";
import {
  ReviewLine,
  currentAnswers,
  enterLine,
  hashShow,
  type CurrentVersions,
  type LineReader,
  type Question,
} from "../models/reviewLine.js";
import { questionVersion } from "./asks.js";
import { decide, welfareQuestion, type Facts, type Step } from "./decide.js";
import { ChecklistAnswer } from "./contract.js";
import { writingTipFor } from "./reviewer.js";
import { checkRules, namesAPerson, onlyAboutSomeoneNamed } from "./rules.js";
import { techniqueFound } from "./techniques.js";

// Sentences waiting longer than this aren't put in line: a teacher has long
// since seen them (as reviewer/queue.ts)
export const MAX_AGE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// At most this many new sentences put in line, and this many versions
// stepped, per run
export const ENTER_PER_RUN = 50;
export const STEP_PER_RUN = 200;

// The models the worker should be running, by name. An answer from another
// model doesn't count; the exact version (after "@") is kept with each answer.
export const localModels = (env = process.env) => ({
  safety: env.SAFETY_MODEL || "llama-guard3:8b",
  first: env.FIRST_MODEL || "gemma4:e4b",
  second: env.SECOND_MODEL || "qwen3.5:9b",
});

const QUESTIONS_NOW = (): Record<Question, string> => ({
  safety: questionVersion("safety"),
  welfare: questionVersion("welfare"),
  danger: questionVersion("danger"),
  checklist: questionVersion("checklist"),
});

// What counts now: the named model, whatever its exact version, and this
// version of each question
const currentVersions = (models: ReturnType<typeof localModels>, hostedModel: string): CurrentVersions => {
  const questions = QUESTIONS_NOW();
  return {
    safety: { model: models.safety, questions },
    first: { model: models.first, questions },
    second: { model: models.second, questions },
    hosted: { model: hostedModel, questions },
  };
};

// The model's name without its exact version ("gemma4:e4b@1a2b" → "gemma4:e4b")
const named = <T extends { model: string }>(answers: T[]) => answers.map((a) => ({ ...a, model: a.model.split("@")[0] }));

const TECHNIQUE_OF = new Map(tellList.map(({ tell, technique }) => [tell, technique]));

type LineAnswer = { reader: string; question: string; model: string; questionVersion: string; answer: unknown };

// The latest current answer from this reader to this question
const answerOf = (answers: LineAnswer[], reader: LineReader, question: Question) =>
  answers.filter((a) => a.reader === reader && a.question === question).at(-1)?.answer;

const checklistOf = (value: unknown) => (ChecklistAnswer.safeParse(value).success ? (value as ChecklistAnswer) : undefined);

// How many times this sentence was sent back for each check (its earlier
// versions' settled steps)
const sentBackFor = async (sentence: mongoose.Types.ObjectId) => {
  const counts: Partial<Record<string, number>> = {};
  const earlier = await ReviewLine.find({ sentence, state: "decided", "decided.step": "send-back" }, { decided: 1 }).lean();
  for (const { decided } of earlier) {
    if (decided?.check) counts[decided.check] = (counts[decided.check] ?? 0) + 1;
  }
  return counts as Facts["sentBackFor"];
};

// Everything known about one version, for the decider
export const factsFor = async (
  line: { sentence: mongoose.Types.ObjectId; answers: LineAnswer[]; failedTries?: Partial<Record<LineReader, number | null>> | null; worryRaisedAt?: Date | null; writingTieAt?: Date | null },
  sentence: { tell: string; show: string },
  { models = localModels(), hostedModel = "hosted", now = new Date() } = {}
): Promise<Facts> => {
  const rules = checkRules(sentence.tell, sentence.show);
  const answers = currentAnswers({ answers: named(line.answers) }, currentVersions(models, hostedModel));
  const question = welfareQuestion(rules);
  const technique = TECHNIQUE_OF.get(sentence.tell);
  const hostedWelfare = answerOf(answers, "hosted", question);
  const failed = line.failedTries ?? {};
  return {
    rules,
    writingTip: writingTipFor(sentence.show),
    ...(technique ? { technique, techniqueFound: techniqueFound(technique, sentence.show) === true } : {}),
    namesAPerson: namesAPerson(sentence.show),
    onlyAboutSomeoneNamed: onlyAboutSomeoneNamed(sentence.show),
    safety: answerOf(answers, "safety", "safety") as Facts["safety"],
    welfare: {
      first: answerOf(answers, "first", question) as "yes" | "no" | undefined,
      second: answerOf(answers, "second", question) as "yes" | "no" | undefined,
    },
    checklist: checklistOf(answerOf(answers, "first", "checklist")),
    second: checklistOf(answerOf(answers, "second", "checklist")),
    ...(hostedWelfare === "yes" || hostedWelfare === "no" ? { hosted: { concern: hostedWelfare } } : {}),
    hostedChecklist: checklistOf(answerOf(answers, "hosted", "checklist")),
    sentBackFor: await sentBackFor(line.sentence),
    failedTries: { safety: failed.safety ?? 0, first: failed.first ?? 0, second: failed.second ?? 0 },
    ...(line.worryRaisedAt ? { worryWaitedMs: now.getTime() - line.worryRaisedAt.getTime() } : {}),
    ...(line.writingTieAt ? { writingWaitedMs: now.getTime() - line.writingTieAt.getTime() } : {}),
  };
};

type Need = { reader: LineReader; question: Question };

// What the local models still have to answer before the decider can go on
const localNeeds = (facts: Facts, question: "welfare" | "danger"): Need[] => {
  const needs: Need[] = [];
  if (facts.safety === undefined) needs.push({ reader: "safety", question: "safety" });
  if (facts.welfare?.first === undefined) needs.push({ reader: "first", question });
  if (!facts.checklist) needs.push({ reader: "first", question: "checklist" });
  if (facts.welfare?.second === undefined) needs.push({ reader: "second", question });
  return needs;
};

// Turn one version's answers into its next step, and save what follows
export const stepLine = async (lineId: mongoose.Types.ObjectId, options: Parameters<typeof factsFor>[2] = {}): Promise<Step | null> => {
  const now = options.now ?? new Date();
  const line = await ReviewLine.findOne({ _id: lineId, state: "waiting" }).lean();
  if (!line) return null;
  const sentence = await Sentence.findById(line.sentence, { tell: 1, show: 1, approved: 1, toRedo: 1 }).lean();
  // Gone, edited, or decided by a teacher meanwhile: out of the line
  if (!sentence || hashShow(sentence.show) !== line.showHash || sentence.approved || sentence.toRedo) {
    await ReviewLine.updateOne({ _id: line._id, state: "waiting" }, { $set: { state: "replaced", needs: [] } });
    return null;
  }
  const facts = await factsFor(line as Parameters<typeof factsFor>[0], sentence, { ...options, now });
  const step = decide(facts);
  const question = welfareQuestion(facts.rules);
  const set: Record<string, unknown> = {};
  switch (step.step) {
    case "ask-local":
      set.needs = localNeeds(facts, question);
      break;
    case "ask-second":
      set.needs = [{ reader: "second", question: "checklist" }];
      break;
    case "ask-hosted":
      set.needs = [{ reader: "hosted", question: step.about === "worry" ? step.question : "checklist" }];
      if (step.about === "worry" && !line.worryRaisedAt) set.worryRaisedAt = now;
      if (step.about === "writing" && !line.writingTieAt) set.writingTieAt = now;
      break;
    default:
      set.state = "decided";
      set.needs = [];
      set.decided = {
        step: step.step,
        ...("tip" in step ? { tip: step.tip } : {}),
        ...("check" in step && step.check ? { check: step.check } : {}),
        ...("teacher" in step && step.teacher ? { teacher: step.teacher } : {}),
        ...("because" in step ? { because: step.because } : {}),
      };
  }
  await ReviewLine.updateOne({ _id: line._id, state: "waiting" }, { $set: set });
  return step;
};

// Put waiting sentences in line: not approved, not sent back, written or
// edited in the last 30 days, not by a staging test account
export const fillLine = async (now = new Date()) => {
  const since = new Date(now.getTime() - MAX_AGE_DAYS * DAY);
  const waiting = await Sentence.find(
    { approved: false, toRedo: false, createdAt: { $gte: since }, GID: { $not: TEST_SENTENCES } },
    { show: 1 }
  )
    .sort({ createdAt: 1 })
    .limit(ENTER_PER_RUN * 4)
    .lean();
  let entered = 0;
  for (const sentence of waiting) {
    if (entered >= ENTER_PER_RUN) break;
    const showHash = hashShow(sentence.show);
    if (await ReviewLine.exists({ sentence: sentence._id, showHash })) continue;
    await enterLine(sentence._id, sentence.show);
    entered++;
  }
  return entered;
};

// One run: put new sentences in line, then step every waiting version
export const keepLine = async (options: Parameters<typeof factsFor>[2] = {}) => {
  const entered = await fillLine(options.now);
  const waiting = await ReviewLine.find({ state: "waiting" }, { _id: 1 }).sort({ createdAt: 1 }).limit(STEP_PER_RUN).lean();
  const settled: Record<string, number> = {};
  for (const { _id } of waiting) {
    const step = await stepLine(_id, options);
    if (step && (step.step === "approve" || step.step === "send-back" || step.step === "teacher")) {
      settled[step.step] = (settled[step.step] ?? 0) + 1;
    }
  }
  return { entered, stepped: waiting.length, settled };
};
