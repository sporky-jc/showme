// The shadow report: how often Scribbles' suggestions agreed with the
// teacher's decisions (reviewer/agreement.ts), before Scribbles may approve
// on its own. Prints Markdown, and adds it to the workflow's summary when
// run by the "Shadow report" workflow.
//
//   npm run shadow:report    the database DATABASE_NAME names (or the one in
//                            DATABASE_ACCESS)
//
// Read-only: it only ever finds, so it's safe on production. Mongoose is
// told not to build indexes or create collections on connecting, which it
// otherwise does by itself. It prints counts, tips, reasons and dates, and
// the shortened words of the sentences Scribbles would have approved and the
// teacher sent back (teachers already see those); never a name, an email or
// an account id.
//
// Where the decisions come from:
// - Recorded ones (models/reviewDecisions.ts): every decision made on the
//   Teacher page since they were recorded, with the words and the date.
// - Older ones, read from the sentence itself: a sentence still approved or
//   sent back holds the teacher's decision on its current words (an edit
//   puts it back to waiting). Only the latest decision survives, and a sent
//   back sentence the student has rewritten has lost its decision, so these
//   lean towards approvals. They have no date of their own.
// Test accounts' sentences and the sample data (utils/sampleData.ts) are
// left out: nobody decided those on the Teacher page.
import { appendFileSync } from "node:fs";
import mongoose, { type Types } from "mongoose";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { ReviewSuggestion } from "../models/reviewSuggestions.js";
import { ReviewDecision } from "../models/reviewDecisions.js";
import { TEST_SENTENCES } from "../config/testAccounts.js";
import { DEMO_SENTENCES, SAMPLE_SENTENCES, SEED_DOMAIN } from "../utils/sampleData.js";
import {
  compareDecisions,
  formatReport,
  type ComparisonRow,
  type SavedSuggestion,
  type TeacherDecision,
} from "../reviewer/agreement.js";
import type { TipId } from "../reviewer/tips.js";
import { messageOf } from "../utils/errors.js";

const databaseAccess = process.env.DATABASE_ACCESS;
if (!databaseAccess) {
  console.error("Can't run: DATABASE_ACCESS is not set.");
  process.exit(1);
}

type StoredDecision = { sentence: Types.ObjectId; show: string; status: "approve" | "redo"; tip?: TipId | null; decidedAt: Date };
type StoredSentence = { _id: Types.ObjectId; GID: string; show: string; approved?: boolean; toRedo?: boolean; tip?: TipId };
type StoredSuggestion = SavedSuggestion & { sentence: Types.ObjectId };

const SUGGESTION_FIELDS = { sentence: 1, show: 1, verdict: 1, tip: 1, reasons: 1, decidedBy: 1, createdAt: 1 };
// The sample sentences, found by their words: the demo ones belong to a real
// staging account, so they can't be told apart by their author
const SAMPLE_SHOWS = new Set([...SAMPLE_SENTENCES.map(([, , show]) => show), ...DEMO_SENTENCES.map(([, show]) => show)]);

try {
  // DATABASE_NAME picks the database, as in index.ts; without it, the one
  // named in DATABASE_ACCESS
  await mongoose.connect(databaseAccess, {
    dbName: process.env.DATABASE_NAME || undefined,
    autoIndex: false,
    autoCreate: false,
  });
  const database = mongoose.connection.name;
  console.log(`Connected to database "${database}" (read-only).`);

  const sampleAuthors = new Set(
    (
      await Profile.find({ email: { $regex: `${SEED_DOMAIN.replace(".", "\\.")}$` } }, { id: 1 }).lean<{ id: string }[]>()
    ).map((p) => p.id)
  );
  const leftOutSentence = (s: StoredSentence | undefined) =>
    !s || TEST_SENTENCES.test(s.GID) || sampleAuthors.has(s.GID) || SAMPLE_SHOWS.has(s.show);

  // The recorded decisions, and the sentences they're about (for who wrote
  // them: a deleted sentence can't be checked, so it's left out too)
  const recorded = await ReviewDecision.find({}, { sentence: 1, show: 1, status: 1, tip: 1, decidedAt: 1 }).lean<
    StoredDecision[]
  >();
  // Older decisions are only worth reading for sentences Scribbles has a
  // suggestion for: those are the only ones that can be compared
  const suggested = (await ReviewSuggestion.distinct("sentence")) as Types.ObjectId[];
  const sentences = new Map(
    (
      await Sentence.find(
        { _id: { $in: [...recorded.map((d) => d.sentence), ...suggested] } },
        { GID: 1, show: 1, approved: 1, toRedo: 1, tip: 1 }
      ).lean<StoredSentence[]>()
    ).map((s) => [String(s._id), s])
  );

  let leftOut = 0;
  const decisions: { sentence: string; decision: TeacherDecision }[] = [];
  const recordedWords = new Set<string>();
  for (const d of recorded) {
    const id = String(d.sentence);
    recordedWords.add(`${id} ${d.show}`);
    if (leftOutSentence(sentences.get(id))) {
      leftOut++;
      continue;
    }
    decisions.push({ sentence: id, decision: { status: d.status, tip: d.tip ?? null, show: d.show, decidedAt: d.decidedAt } });
  }
  for (const id of suggested.map(String)) {
    const s = sentences.get(id);
    // Still waiting, or already counted from its record
    if (!s || !(s.approved || s.toRedo) || recordedWords.has(`${id} ${s.show}`)) continue;
    if (leftOutSentence(s)) {
      leftOut++;
      continue;
    }
    decisions.push({
      sentence: id,
      decision: { status: s.approved ? "approve" : "redo", tip: s.tip ?? null, show: s.show, decidedAt: null },
    });
  }

  // Each decision's suggestion: the one for the same words, or else the
  // newest for the sentence (counted as "for other words")
  const suggestions = new Map<string, StoredSuggestion[]>();
  for (const s of await ReviewSuggestion.find(
    { sentence: { $in: [...new Set(decisions.map((d) => d.sentence))] } },
    SUGGESTION_FIELDS
  )
    .sort({ createdAt: -1 })
    .lean<StoredSuggestion[]>()) {
    const id = String(s.sentence);
    suggestions.set(id, [...(suggestions.get(id) ?? []), s]);
  }
  const rows: ComparisonRow[] = decisions.map(({ sentence, decision }) => {
    const forSentence = suggestions.get(sentence) ?? [];
    return { decision, suggestion: forSentence.find((s) => s.show === decision.show) ?? forSentence[0] ?? null };
  });

  const report = formatReport(compareDecisions(rows), { database, leftOut });
  console.log(`\n${report}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
} catch (error) {
  console.error(messageOf(error));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
