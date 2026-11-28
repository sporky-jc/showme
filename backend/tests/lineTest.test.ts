import { describe, expect, it } from "vitest";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { ReviewLine } from "../models/reviewLine.js";
import { HostedUsage } from "../models/hostedUsage.js";
import { fillLine } from "../reviewer/line.js";
import { DECIDE_SET } from "../reviewer/eval/decideSet.js";
import { SMOKE_SET } from "../reviewer/eval/lineTestSets.js";
import { LINE_TEST_DOMAIN, clearLineTest, lineTestReport, putLineTest, reportMarkdown } from "../reviewer/eval/lineTest.js";

// The line test (spec/SPEC-line-testing.md). Made-up sentences only.

describe("the line test", () => {
  it("puts the smoke set on staging under made-up students, first names only", async () => {
    expect(await putLineTest("smoke")).toMatchObject({ put: SMOKE_SET.length });
    const students = await Profile.find({ email: { $regex: "linetest\\.example$" } }).lean();
    expect(students.every((s) => s.email.endsWith(LINE_TEST_DOMAIN) && s.lastName === "Test")).toBe(true);
    const sentences = await Sentence.find({ GID: { $in: students.map((s) => s.id) } }).lean();
    expect(sentences.map((s) => s.show).sort()).toEqual(SMOKE_SET.map(({ row }) => DECIDE_SET[row].show).sort());
    expect(sentences.every((s) => !s.approved && !s.toRedo)).toBe(true);
    // And the line keeper takes them in, like any waiting sentence
    expect(await fillLine()).toBe(SMOKE_SET.length);
  });

  it("putting it again replaces the earlier test, and clear takes it all away", async () => {
    await putLineTest("smoke");
    await fillLine();
    expect(await putLineTest("smoke")).toMatchObject({ cleared: { sentences: SMOKE_SET.length } });
    expect(await Sentence.countDocuments()).toBe(SMOKE_SET.length);
    expect(await ReviewLine.countDocuments()).toBe(0);
    await clearLineTest();
    expect(await Sentence.countDocuments()).toBe(0);
    expect(await Profile.countDocuments()).toBe(0);
  });

  it("reports each row: right, wrong or still waiting, with the hosted model's hidden count, and no words", async () => {
    await putLineTest("smoke");
    await fillLine();
    const lineFor = async (row: number) => {
      const sentence = await Sentence.findOne({ show: DECIDE_SET[row].show }).lean();
      return (await ReviewLine.findOne({ sentence: sentence!._id }).lean())!;
    };
    // Row 0 approved (right), row 520 approved (wrong: it's misspelled)
    await ReviewLine.updateOne({ _id: (await lineFor(0))._id }, { $set: { state: "decided", decided: { step: "approve", tip: "great" } } });
    await ReviewLine.updateOne({ _id: (await lineFor(520))._id }, { $set: { state: "decided", decided: { step: "approve", tip: "great" } } });
    // Row 271 asked the hosted model once, with one detail hidden
    const handle = await lineFor(271);
    await HostedUsage.create({ at: new Date(), about: "worry", kid: "k", line: handle._id, hidden: 1 });

    const report = await lineTestReport();
    expect(report).toMatchObject({ set: "smoke", total: SMOKE_SET.length, settled: 2, right: 1, hostedAsked: 1 });
    expect(report.rows.find((r) => r.row === 0)?.right).toBe(true);
    expect(report.rows.find((r) => r.row === 520)?.right).toBe(false);
    expect(report.rows.find((r) => r.row === 271)?.hosted).toEqual({ asked: 1, hidden: 1 });

    const markdown = reportMarkdown(report);
    expect(markdown).toContain("| ❌ | #520 |");
    expect(markdown).toContain("| 1 (1) |");
    for (const { row } of SMOKE_SET) expect(markdown).not.toContain(DECIDE_SET[row].show);
  });
});
