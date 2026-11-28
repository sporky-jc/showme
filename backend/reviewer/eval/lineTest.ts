// The line test (spec/SPEC-line-testing.md): puts a set of made-up
// sentences on staging under made-up students, and reports how the review
// line settled each one. The report gives row numbers, outcomes, models and
// times, never a sentence's words, so it can go in a workflow's summary.
import mongoose, { type Types } from "mongoose";
import Profile from "../../models/profile.js";
import { Sentence } from "../../models/sentences.js";
import { ReviewLine } from "../../models/reviewLine.js";
import { HostedUsage } from "../../models/hostedUsage.js";
import tellList from "../../public/tellList.js";
import { DECIDE_SET } from "./decideSet.js";
import { LINE_TEST_SETS, type LineTestSet, type Settled } from "./lineTestSets.js";

export const LINE_TEST_DOMAIN = "@linetest.example";
// Made-up students, first names only on any page (the house rules)
const STUDENTS = ["Rowan", "Kai", "Juno", "Wren", "Ellis"];

// Which row of which set each sentence is
const lineTestRowSchema = new mongoose.Schema({
  sentence: { type: mongoose.Schema.Types.ObjectId, required: true },
  set: { type: String, required: true },
  row: { type: Number, required: true },
  putAt: { type: Date, required: true },
});
export const LineTestRowDoc = mongoose.model("LineTestRow", lineTestRowSchema);

const ourStudents = () => Profile.find({ email: { $regex: `${LINE_TEST_DOMAIN.replace(".", "\\.")}$` } });

// Takes away everything an earlier line test put on staging: its students,
// their sentences, and those sentences' line records
export const clearLineTest = async () => {
  const students = await ourStudents();
  const sentences = (await Sentence.find({ GID: { $in: students.map((s) => s.id) } }, { _id: 1 }).lean<{ _id: Types.ObjectId }[]>()).map((s) => s._id);
  await ReviewLine.deleteMany({ sentence: { $in: sentences } });
  await Sentence.deleteMany({ _id: { $in: sentences } });
  await Profile.deleteMany({ _id: { $in: students.map((s) => s._id) } });
  await LineTestRowDoc.deleteMany({});
  return { students: students.length, sentences: sentences.length };
};

const titleFor = (tell: string) => tellList.find((t) => t.tell === tell)?.id ?? tellList[0].id;

// Puts a set's sentences on staging, waiting for review, as if just written
export const putLineTest = async (set: LineTestSet, now = new Date()) => {
  const cleared = await clearLineTest();
  const profiles = [];
  for (const [index, firstName] of STUDENTS.entries()) {
    profiles.push(
      await Profile.create({ id: `linetest-${index + 1}`, firstName, lastName: "Test", email: `${firstName.toLowerCase()}${LINE_TEST_DOMAIN}` })
    );
  }
  const rows = LINE_TEST_SETS[set];
  for (const [index, { row }] of rows.entries()) {
    const { tell, show } = DECIDE_SET[row];
    const author = profiles[index % profiles.length];
    const sentence = await Sentence.create({ title: titleFor(tell), tell, show, author: author._id, GID: author.id, approved: false, toRedo: false, createdAt: now });
    author.ownSentences.push(sentence._id);
    await LineTestRowDoc.create({ sentence: sentence._id, set, row, putAt: now });
  }
  await Promise.all(profiles.map((p) => p.save()));
  return { put: rows.length, cleared };
};

type Answer = { reader: string; question: string; model: string; at: Date };

const describe = (settled: Settled) =>
  [settled.step, settled.tip && `tip ${settled.tip}`, settled.teacher && `note: ${settled.teacher}`, settled.because && `because ${settled.because}`]
    .filter(Boolean)
    .join(", ");

const minutes = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60000);

export interface ReportRow {
  row: number;
  what: string;
  expect: string;
  got: string;
  right: boolean | null;
  hosted: { asked: number; hidden: number };
  hostedExpected: boolean;
  minutes: number | null;
  readers: string[];
}

// How the line settled each row of the set on staging now
export const lineTestReport = async (now = new Date()) => {
  const docs = await LineTestRowDoc.find().sort({ row: 1 }).lean();
  const set = (docs[0]?.set ?? "smoke") as LineTestSet;
  const byRow = new Map(LINE_TEST_SETS[set].map((r) => [r.row, r]));
  const rows: ReportRow[] = [];
  for (const doc of docs) {
    const test = byRow.get(doc.row)!;
    const line = await ReviewLine.findOne({ sentence: doc.sentence, state: { $ne: "replaced" } }).sort({ createdAt: -1 }).lean();
    const usage = line ? await HostedUsage.find({ line: line._id }).lean() : [];
    const answers = (line?.answers ?? []) as Answer[];
    const settled = line?.state === "decided" && line.decided ? (line.decided as Settled) : null;
    const last = answers.reduce<Date | null>((latest, a) => (!latest || a.at > latest ? a.at : latest), null);
    rows.push({
      row: doc.row,
      what: test.what,
      expect: test.expect,
      got: !line ? "not in line yet" : settled ? describe(settled) : `waiting for ${[...new Set(line.needs.map((n) => `${n.reader} (${n.question})`))].join(", ") || "the next step"}`,
      right: settled ? test.right(settled) : null,
      hosted: { asked: usage.length, hidden: usage.reduce((sum, u) => sum + (u.hidden ?? 0), 0) },
      hostedExpected: test.hosted === true,
      minutes: settled ? minutes(doc.putAt, last ?? now) : null,
      readers: [...new Set(answers.map((a) => `${a.reader}: ${a.model}`))],
    });
  }
  const settled = rows.filter((r) => r.right !== null);
  return {
    set,
    rows,
    total: rows.length,
    settled: settled.length,
    right: settled.filter((r) => r.right).length,
    waiting: rows.length - settled.length,
    hostedAsked: rows.reduce((sum, r) => sum + r.hosted.asked, 0),
    models: [...new Set(rows.flatMap((r) => r.readers))].sort(),
  };
};

// The report as Markdown, for the workflow's summary
export const reportMarkdown = (report: Awaited<ReturnType<typeof lineTestReport>>) => {
  const mark = (r: ReportRow) => (r.right === null ? "⏳" : r.right ? "✅" : "❌");
  const lines = [
    `## Line test: ${report.set}`,
    "",
    `- Settled: **${report.settled}** of ${report.total}, right: **${report.right}** of ${report.settled}, still waiting: ${report.waiting}`,
    `- Hosted model asked: ${report.hostedAsked} time(s)`,
    "",
    "### Models that answered",
    "",
    ...report.models.map((m) => `- ${m}`),
    "",
  ];
  const shown = report.set === "smoke" ? report.rows : report.rows.filter((r) => r.right !== true);
  lines.push(report.set === "smoke" ? "### Every row" : "### Rows not right (yet)", "");
  lines.push("| | Row | Tests | Expected | Got | Hosted asked (details hidden) | Minutes |", "|---|---|---|---|---|---|---|");
  for (const r of shown) {
    const hosted = r.hosted.asked ? `${r.hosted.asked} (${r.hosted.hidden})` : r.hostedExpected ? "0, expected" : "0";
    lines.push(`| ${mark(r)} | #${r.row} | ${r.what} | ${r.expect} | ${r.got} | ${hosted} | ${r.minutes ?? ""} |`);
  }
  if (shown.length === 0) lines.push("| ✅ | | every row right | | | | |");
  return lines.join("\n");
};
