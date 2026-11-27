import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { READERS, type Reader } from "../reviewer/decide.js";

// The review line (tasks/scribbles-worker-spec.md, T8): each version of a
// sentence waiting for Scribbles, who is reading it and until when, and
// every model's answer, with the model and question that gave it.
//
// Kept apart from the sentence, like the suggestions: nothing that sends
// sentences to students, teachers' pages or the gallery reads this
// collection. It holds no words and no author: a version is known by a
// hash of its words, so a student's edit makes a new version, and the old
// one's answers stop counting.
//
// Built with Scribbles switched off: the line only ever leads to
// suggestions until the owner turns "decide" on.

// Who answers: the three local readers on the VM, and the hosted model
export const LINE_READERS = [...READERS, "hosted"] as const;
export type LineReader = (typeof LINE_READERS)[number];

// What they're asked (reviewer/prompt.ts): the safety model's own
// question, the welfare question (or its stricter "danger" form), and the
// writing checklist
export const QUESTIONS = ["safety", "welfare", "danger", "checklist"] as const;
export type Question = (typeof QUESTIONS)[number];

export const LINE_STATES = ["waiting", "decided", "replaced"] as const;

// A reader's claim on a version runs out after this, so a worker that
// dies mid-batch never holds a sentence for long: it's handed out again
export const CLAIM_MS = 15 * 60 * 1000;

// The version of a question: a hash of its exact instructions, so a
// changed prompt makes the old answers stop counting
export const versionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

// A version of a sentence, by its words, without keeping them
export const hashShow = (show: string) => createHash("sha256").update(show).digest("hex");

const claimSchema = new mongoose.Schema(
  { worker: { type: String, required: true }, until: { type: Date, required: true } },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    reader: { type: String, enum: LINE_READERS, required: true },
    question: { type: String, enum: QUESTIONS, required: true },
    // The model's exact name and version ("gemma4:e4b@<digest>")
    model: { type: String, required: true },
    questionVersion: { type: String, required: true },
    // Already checked against its strict form (reviewer/contract.ts) by
    // whoever saves it: a "yes"/"no", "safe"/"unsafe", or a checklist
    answer: { type: mongoose.Schema.Types.Mixed, required: true },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const needSchema = new mongoose.Schema(
  {
    reader: { type: String, enum: LINE_READERS, required: true },
    question: { type: String, enum: QUESTIONS, required: true },
  },
  { _id: false }
);

const reviewLineSchema = new mongoose.Schema({
  sentence: { type: mongoose.Schema.Types.ObjectId, ref: "Sentence", required: true },
  showHash: { type: String, required: true },
  state: { type: String, enum: LINE_STATES, default: "waiting" },
  // What the decider still needs answered, set each time it runs
  needs: { type: [needSchema], default: [] },
  // One claim per reader at a time
  claims: {
    safety: claimSchema,
    first: claimSchema,
    second: claimSchema,
    hosted: claimSchema,
  },
  answers: { type: [answerSchema], default: [] },
  // Failed tries per reader on these words (a try only counts if that
  // model answered another sentence in the same run: the caller's job)
  failedTries: {
    safety: { type: Number, default: 0 },
    first: { type: Number, default: 0 },
    second: { type: Number, default: 0 },
    hosted: { type: Number, default: 0 },
  },
  // When a split worry, or a writing tie, started waiting for the hosted
  // model (the decider's worryWaitedMs and writingWaitedMs)
  worryRaisedAt: { type: Date },
  writingTieAt: { type: Date },
  // What the decider said last, once it settled the version
  decided: {
    type: new mongoose.Schema(
      {
        step: { type: String, required: true },
        tip: { type: String },
        check: { type: String },
        teacher: { type: String },
        because: { type: String },
      },
      { _id: false }
    ),
  },
  createdAt: { type: Date, default: Date.now },
});
reviewLineSchema.index({ sentence: 1, showHash: 1 }, { unique: true });
reviewLineSchema.index({ state: 1, "needs.reader": 1 });

export const ReviewLine = mongoose.model("ReviewLine", reviewLineSchema);
export type ReviewLineDoc = mongoose.HydratedDocument<mongoose.InferSchemaType<typeof reviewLineSchema>>;

type Id = mongoose.Types.ObjectId | string;

// The values that come from the worker go into queries only as plain
// values ($eq) and real ids, and the field names are picked from fixed
// strings, never built from what was sent: so no request can turn into a
// query operator or another field (the worker's routes check them all
// first too)
const idOf = (id: Id) => new mongoose.Types.ObjectId(String(id));
const eq = (value: string) => ({ $eq: String(value) });
const claimField = (reader: LineReader) => {
  switch (reader) {
    case "safety":
      return "claims.safety";
    case "first":
      return "claims.first";
    case "second":
      return "claims.second";
    case "hosted":
      return "claims.hosted";
  }
  throw new Error("Unknown reader");
};
const failedField = (reader: LineReader) => {
  switch (reader) {
    case "safety":
      return "failedTries.safety";
    case "first":
      return "failedTries.first";
    case "second":
      return "failedTries.second";
    case "hosted":
      return "failedTries.hosted";
  }
  throw new Error("Unknown reader");
};

// Put the sentence's current words in line. An older version still
// waiting is replaced: its answers no longer count. The same words again
// (a save that didn't change them) keep their place and answers.
export const enterLine = async (sentence: Id, show: string) => {
  const showHash = hashShow(show);
  await ReviewLine.updateMany({ sentence, showHash: { $ne: showHash }, state: "waiting" }, { $set: { state: "replaced" } });
  return ReviewLine.findOneAndUpdate(
    { sentence, showHash },
    { $setOnInsert: { sentence, showHash, state: "waiting" } },
    { upsert: true, new: true }
  );
};

// Hand out up to `limit` versions that need this reader, one claim each,
// never one another worker holds. Each is claimed with one atomic update,
// so two workers asking at once never get the same version.
export const claimWork = async (reader: LineReader, worker: string, limit: number, now = new Date()) => {
  const claimed: ReviewLineDoc[] = [];
  const claim = claimField(reader);
  for (let i = 0; i < limit; i++) {
    const free: Record<string, unknown> = {
      state: "waiting",
      "needs.reader": eq(reader),
      $or: [{ [claim]: { $exists: false } }, { [claim]: null }, { [`${claim}.until`]: { $lte: now } }],
    };
    const line = await ReviewLine.findOneAndUpdate(
      free,
      { $set: { [claim]: { worker: String(worker), until: new Date(now.getTime() + CLAIM_MS) } } },
      { new: true, sort: { createdAt: 1 } }
    );
    if (!line) break;
    claimed.push(line);
  }
  return claimed;
};

export interface NewAnswer {
  line: Id;
  // The words the reader was given: an answer for words since changed is
  // refused
  showHash: string;
  reader: LineReader;
  question: Question;
  model: string;
  questionVersion: string;
  answer: unknown;
}

export type SaveResult = "saved" | "duplicate" | "stale";

// Save one answer. The same answer posted twice counts once; an answer
// for a version that's been replaced or decided, or for other words, is
// refused ("stale"). Saving frees the reader's claim on the version.
export const saveAnswer = async (given: NewAnswer, now = new Date()): Promise<SaveResult> => {
  const { line, showHash, reader, question, model, questionVersion, answer } = given;
  const same = { reader: String(reader), question: String(question), model: String(model), questionVersion: String(questionVersion) };
  const matchSame = { reader: eq(reader), question: eq(question), model: eq(model), questionVersion: eq(questionVersion) };
  const version = { _id: idOf(line), showHash: eq(showHash), state: "waiting" as const };
  const saved = await ReviewLine.findOneAndUpdate(
    { ...version, answers: { $not: { $elemMatch: matchSame } } },
    { $push: { answers: { ...same, answer, at: now } }, $unset: { [claimField(reader)]: "" } }
  );
  if (saved) return "saved";
  const current = await ReviewLine.findOne(version);
  return current ? "duplicate" : "stale";
};

// A reader failed on these words: counted, and its claim freed
export const recordFailure = (line: Id, reader: LineReader) =>
  ReviewLine.updateOne({ _id: idOf(line), state: "waiting" }, { $inc: { [failedField(reader)]: 1 }, $unset: { [claimField(reader)]: "" } });

// The models and question versions in use now, per reader. Answers given
// by any other model or question version don't count: the version is
// read again.
export type CurrentVersions = Partial<Record<LineReader, { model: string; questions: Partial<Record<Question, string>> }>>;

export const currentAnswers = (line: { answers: { reader: string; question: string; model: string; questionVersion: string; answer: unknown }[] }, current: CurrentVersions) =>
  line.answers.filter((a) => {
    const reader = current[a.reader as LineReader];
    return reader !== undefined && reader.model === a.model && reader.questions[a.question as Question] === a.questionVersion;
  });

export type { Reader };
