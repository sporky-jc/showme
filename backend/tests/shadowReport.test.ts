import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { ReviewDecision } from "../models/reviewDecisions.js";
import {
  compareDecisions,
  formatReport,
  MAX_TEXT,
  shorten,
  weekOf,
  type ComparisonRow,
  type SavedSuggestion,
  type TeacherDecision,
} from "../reviewer/agreement.js";
import { asReviewed, createAdmin, createSentence, createUser, sessionCookie } from "./helpers.js";

// The shadow report: Scribbles' suggestions against the teacher's decisions,
// with made-up rows (no database), and the record the Teacher page keeps of
// each decision so the report has something to read

const MONDAY = new Date("2026-11-16T10:00:00Z");
const NEXT_WEEK = new Date("2026-11-24T10:00:00Z");

const suggestion = (fields: Partial<SavedSuggestion> = {}): SavedSuggestion => ({
  show: "Snow piled up to the windows.",
  verdict: "approve",
  tip: "great",
  reasons: ["ai"],
  decidedBy: "cloudflare:test-model",
  createdAt: new Date(MONDAY.getTime() - 60_000),
  ...fields,
});

const decision = (fields: Partial<TeacherDecision> = {}): TeacherDecision => ({
  status: "approve",
  tip: "great",
  show: "Snow piled up to the windows.",
  decidedAt: MONDAY,
  ...fields,
});

const row = (d: Partial<TeacherDecision>, s: Partial<SavedSuggestion> | null = {}): ComparisonRow => ({
  decision: decision(d),
  suggestion: s === null ? null : suggestion(s),
});

describe("compareDecisions", () => {
  it("counts agreement on approve and on redo, and whether the tip matched", () => {
    const report = compareDecisions([
      row({}),
      row({}),
      row({ status: "redo", tip: "hear" }, { verdict: "redo", tip: "hear", reasons: ["ai"] }),
      row({ status: "redo", tip: "smell" }, { verdict: "redo", tip: "hear", reasons: ["ai"] }),
      row({ status: "redo", tip: null }, { verdict: "redo", tip: "spelling", reasons: ["spelling"], decidedBy: "rules" }),
    ]);
    expect(report.total).toEqual({
      compared: 5,
      approveAgree: 2,
      redoAgree: 3,
      redoSameTip: 1,
      approveButRedo: 0,
      redoButApprove: 0,
      unsureApproved: 0,
      unsureRedo: 0,
    });
  });

  it("lists the sentences Scribbles would have approved and the teacher sent back", () => {
    const long = `${"The wind howled ".repeat(10)}all night.`;
    const report = compareDecisions([
      row({ status: "redo", tip: "senses", show: long, decidedAt: NEXT_WEEK }, { show: long }),
      row({ status: "redo", tip: null, decidedAt: null }),
    ]);
    expect(report.total.approveButRedo).toBe(2);
    // Oldest first: the one with no decision date goes by its suggestion's
    expect(report.approveButRedo).toEqual([
      { text: "Snow piled up to the windows.", decidedOn: null, suggestedOn: "2026-11-16", teacherTip: null },
      { text: shorten(long), decidedOn: "2026-11-24", suggestedOn: "2026-11-16", teacherTip: "senses" },
    ]);
    expect(report.approveButRedo[1].text).toHaveLength(MAX_TEXT);
    expect(report.approveButRedo[1].text.endsWith("…")).toBe(true);
  });

  it("counts Scribbles' redos the teacher approved, by Scribbles' tip", () => {
    const report = compareDecisions([
      row({}, { verdict: "redo", tip: "hear" }),
      row({}, { verdict: "redo", tip: "hear" }),
      row({}, { verdict: "redo", tip: "compare" }),
    ]);
    expect(report.total.redoButApprove).toBe(3);
    expect(report.redoButApproveTips).toEqual([
      { tip: "hear", count: 2 },
      { tip: "compare", count: 1 },
    ]);
  });

  it("counts the holds by reason, worrying first, each reason once per hold", () => {
    const report = compareDecisions([
      row({}, { verdict: "unsure", tip: null, reasons: ["sensitive-words", "sensitive-words"] }),
      row({}, { verdict: "unsure", tip: null, reasons: ["sensitive-words"] }),
      row({ status: "redo", tip: null }, { verdict: "unsure", tip: null, reasons: ["worrying", "sensitive-words"] }),
    ]);
    expect(report.total.unsureApproved).toBe(2);
    expect(report.total.unsureRedo).toBe(1);
    expect(report.holdReasons).toEqual([
      { reason: "worrying", approved: 0, redo: 1 },
      { reason: "sensitive-words", approved: 2, redo: 1 },
    ]);
  });

  it("only compares a decision with a suggestion for the same words, and counts the rest", () => {
    const report = compareDecisions([
      // The student edited after Scribbles' suggestion: it was about the old words
      row({ status: "redo", tip: "hear", show: "New words." }, { show: "Old words." }),
      // Even a change of one character
      row({ show: "Snow piled up to the windows!" }),
      row({}, null),
      row({}),
    ]);
    expect(report.decisions).toBe(4);
    expect(report.otherWords).toBe(2);
    expect(report.noSuggestion).toBe(1);
    expect(report.total.compared).toBe(1);
    expect(report.approveButRedo).toEqual([]);
  });

  it("counts decisions with no date, and ones made before the suggestion was saved", () => {
    const report = compareDecisions([
      row({ decidedAt: null }),
      row({ decidedAt: new Date(MONDAY.getTime() - 120_000) }),
      row({}),
    ]);
    expect(report.undated).toBe(1);
    expect(report.beforeSuggestion).toBe(1);
    expect(report.total.compared).toBe(3);
  });

  it("breaks the decisions down by week, starting Monday", () => {
    const report = compareDecisions([
      row({}),
      row({ status: "redo", tip: null, decidedAt: new Date("2026-11-22T23:59:00Z") }),
      row({ decidedAt: NEXT_WEEK }),
      // No decision date: the week of its suggestion
      row({ decidedAt: null }, { createdAt: new Date("2026-11-03T08:00:00Z") }),
    ]);
    expect(report.weeks.map(({ week, tally }) => [week, tally.compared, tally.approveButRedo])).toEqual([
      ["2026-11-02", 1, 0],
      ["2026-11-16", 2, 1],
      ["2026-11-23", 1, 0],
    ]);
  });
});

describe("weekOf", () => {
  it("is the Monday the week began, in UTC", () => {
    expect(weekOf(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16");
    expect(weekOf(new Date("2026-11-22T23:59:59Z"))).toBe("2026-11-16");
    expect(weekOf(new Date("2026-11-23T00:00:00Z"))).toBe("2026-11-23");
    expect(weekOf(new Date("2027-01-01T12:00:00Z"))).toBe("2026-12-28");
  });
});

describe("formatReport", () => {
  it("shows counts and the disagreements' words as plain text, and nothing about who", () => {
    const text = "My *best* friend [Sam](http://example.com) <b>yelled</b> | loud";
    const report = compareDecisions([
      row({ status: "redo", tip: "hear", show: text }, { show: text }),
      row({}),
      row({}, { verdict: "unsure", tip: null, reasons: ["worrying"] }),
    ]);
    const markdown = formatReport(report, { database: "ShowME-dev", leftOut: 4 });
    expect(markdown).toContain("4 more left out");
    expect(markdown).toContain("it agreed: **1 of 2 (50%)**");
    expect(markdown).toContain("Worrying: 1 (approved 1, sent back 0)");
    expect(markdown).toContain(
      "- My \\*best\\* friend \\[Sam\\](http://example.com) \\<b\\>yelled\\</b\\> \\| loud (decided 2026-11-16; teacher's tip: hear)"
    );
    expect(markdown).toContain("| 2026-11-16 | 3 | 1 of 2 (50%) | 1 | 0 | 1 |");
  });

  it("says so when there is nothing to compare", () => {
    const markdown = formatReport(compareDecisions([]), { database: "ShowME", leftOut: 0 });
    expect(markdown).toContain("Compared (a suggestion for the same words): **0**");
    expect(markdown).toContain("No decisions to compare yet.");
  });
});

describe("The Teacher page records each decision", () => {
  it("with the words decided on and the tip, so a later edit doesn't lose it", async () => {
    const admin = await createAdmin();
    const student = await createUser();
    const approved = await createSentence(student, { show: "Snow piled up to the windows." });
    const sentBack = await createSentence(student, { title: "day2", show: "It was cold." });

    for (const [sentence, body] of [
      [approved, { status: "approve" }],
      [sentBack, { status: "redo", tip: "feel" }],
    ] as const) {
      const res = await request(app)
        .patch("/Admin")
        .set("Cookie", sessionCookie(admin))
        .send({ sentence: asReviewed(sentence), ...body });
      expect(res.status).toBe(201);
    }

    // The student rewrites the sent back one: the sentence forgets the
    // decision, the record keeps it
    await request(app)
      .patch("/MyPage")
      .set("Cookie", sessionCookie(student))
      .send({ title: "day2", show: "My fingers went numb." });

    const records = await ReviewDecision.find({}, "-_id -__v").sort({ status: 1 }).lean();
    expect(records.map(({ decidedAt, ...rest }) => ({ ...rest, dated: decidedAt instanceof Date }))).toEqual([
      { sentence: approved._id, show: "Snow piled up to the windows.", status: "approve", tip: "great", decidedBy: "teacher", dated: true },
      { sentence: sentBack._id, show: "It was cold.", status: "redo", tip: "feel", decidedBy: "teacher", dated: true },
    ]);
  });

  it("not when the decision is refused as out of date", async () => {
    const admin = await createAdmin();
    const sentence = await createSentence(await createUser());
    const res = await request(app)
      .patch("/Admin")
      .set("Cookie", sessionCookie(admin))
      .send({ sentence: { ...asReviewed(sentence), createdAt: new Date(0).toISOString() }, status: "approve" });
    expect(res.status).toBe(409);
    expect(await ReviewDecision.countDocuments()).toBe(0);
  });
});
