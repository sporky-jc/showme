// The sets the line test puts on staging (spec/SPEC-line-testing.md), and
// what each row should end as. Every sentence is made up: they're rows of
// the decider's made-up set (decideSet.ts), so the CI score has already
// read them with the same models.
import type { TipId } from "../tips.js";
import { DECIDE_SET, type DecideRow } from "./decideSet.js";

// What a settled version looks like in the line (line.ts, "decided")
export interface Settled {
  step: string;
  tip?: string;
  check?: string;
  teacher?: string;
  because?: string;
}

export interface LineTestRow {
  // Its place in DECIDE_SET, the number the CI score's report uses
  row: number;
  // What it tests, in a few words (never the sentence's words)
  what: string;
  // Whether the hosted model should be asked about it
  hosted?: boolean;
  // Is the settled step right?
  right: (settled: Settled) => boolean;
  // What's right, in a few words, for the report
  expect: string;
}

const is =
  (step: string, more: Partial<Settled> = {}) =>
  (settled: Settled) =>
    settled.step === step && Object.entries(more).every(([key, value]) => settled[key as keyof Settled] === value);
const either =
  (...checks: ((settled: Settled) => boolean)[]) =>
  (settled: Settled) =>
    checks.some((check) => check(settled));

// Stage 1: one row for each path through the decider. What's right is what
// the CI score decided from the same models' answers (run 46081059519);
// for a row the hosted model settles, either of its answers is right, as
// long as a worry never gets a tip alone.
export const SMOKE_SET: LineTestRow[] = [
  { row: 0, what: "good writing", expect: "approve", right: is("approve") },
  {
    row: 373,
    what: "doesn't show (a writing tie)",
    hosted: true,
    expect: "send back, after the hosted model",
    right: is("send-back"),
  },
  { row: 520, what: "misspelled", expect: "send back, spelling tip", right: is("send-back", { tip: "spelling" }) },
  {
    row: 39,
    what: "clear worrying words",
    expect: "teacher, no model asked",
    right: is("teacher", { because: "worrying-words" }),
  },
  { row: 36, what: "a quiet worry", expect: "teacher", right: is("teacher") },
  {
    row: 457,
    what: "one model worried",
    hosted: true,
    expect: "teacher, after the hosted model",
    right: is("teacher"),
  },
  { row: 267, what: "a username", expect: "send back, private-details tip", right: is("send-back", { tip: "privateDetails" }) },
  {
    row: 271,
    what: "a handle, and both models worried",
    hosted: true,
    expect: "after the hosted model, with the handle hidden: teacher, or send back with the private-details tip",
    right: either(is("teacher"), is("send-back", { tip: "privateDetails" })),
  },
  {
    row: 247,
    what: "unkind about a classmate",
    expect: "send back, kind-words tip, a note for the teacher",
    right: is("send-back", { tip: "kindWords", teacher: "worry" }),
  },
  {
    row: 59,
    what: "play (a snowball)",
    expect: "not a worry: approve or send back, with a note for the teacher",
    right: either(is("approve", { teacher: "review" }), is("send-back", { teacher: "review" })),
  },
];

// Stage 2: the whole made-up set, judged by what each row expects (as the
// CI score does, decideScore.ts)
const rightFor = ({ expect, tips }: DecideRow) => (settled: Settled) => {
  switch (expect) {
    case "approve":
      return settled.step === "approve";
    case "send-back":
      return settled.step === "send-back" && settled.teacher !== "worry" ? !tips || tips.includes(settled.tip as TipId) : settled.step === "send-back";
    case "teacher":
      return settled.step === "teacher";
    case "not-approved":
      return settled.step !== "approve";
    case "not-teacher":
      return settled.step !== "teacher";
  }
};

export const DECIDE_SET_ROWS: LineTestRow[] = DECIDE_SET.map((row, index) => ({
  row: index,
  what: row.kind,
  expect: row.expect,
  right: rightFor(row),
}));

export const LINE_TEST_SETS = { smoke: SMOKE_SET, "decide-set": DECIDE_SET_ROWS } as const;
export type LineTestSet = keyof typeof LINE_TEST_SETS;
