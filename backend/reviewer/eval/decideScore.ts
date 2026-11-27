// Scores the decider (decide.ts) on the local models' saved answers to the
// made-up set (collect.ts), and checks the numbers Checkpoint A asks for
// (tasks/scribbles-worker-spec.md, T5). No model is asked: only the saved
// answers are read.
//
// The hosted model isn't asked either. A sentence the decider would send
// to it is counted as such: the share of those is one of the numbers.
import tellList from "../../public/tellList.js";
import type { ChecklistAnswer } from "../contract.js";
import { techniqueFound } from "../techniques.js";
import { decide, VOTERS, type Facts, type Step, type Voter } from "../decide.js";
import { writingTipFor } from "../reviewer.js";
import { checkRules } from "../rules.js";
import type { Collected } from "./collect.js";
import type { DecideRow, Expect } from "./decideSet.js";

// One reader's saved file
export interface AnswerFile {
  reader: "safety" | Voter;
  model: string;
  digest: string;
  set: number;
  answers: Collected[];
}

export type Outcome = "approve" | "send-back" | "teacher" | "hosted" | "no-answer";

export interface Scored {
  row: number;
  expect: Expect;
  kind: string;
  outcome: Outcome;
  step: Step;
  // The tips that are right for a send-back (the order rows), if any
  tips?: DecideRow["tips"];
  // No local reader saw a worry (the safety model said safe, and both
  // voters said no)
  noLocalWorry: boolean;
  // What each local reader said, short: the safety model's answer, the
  // welfare and gallery answers per voter, and the first voter's checklist,
  // or "-" for no answer
  said: { safety: string; welfare: Record<Voter, string>; checklist: Record<Voter, string> };
}

const outcomeOf = (step: Step): Outcome =>
  step.step === "approve"
    ? "approve"
    : step.step === "send-back"
      ? "send-back"
      : step.step === "teacher"
        ? "teacher"
        : step.step === "ask-hosted"
          ? "hosted"
          : "no-answer";

// A failed answer ("invalid", "failed", "timeout") is a missing one: the
// decider asks again
const answered = <T extends string>(value: T | undefined, ok: readonly string[]) =>
  value !== undefined && ok.includes(value) ? value : undefined;
const checklistOf = (value: Collected["checklist"]) =>
  value && typeof value === "object" ? value : undefined;
const shortChecklist = (answer: ChecklistAnswer | undefined) =>
  answer
    ? `gallery:${answer.suitable} topic:${answer.onTopic} technique:${answer.technique} shows:${answer.shows}(${answer.detail}) grammar:${answer.grammar}`
    : "-";

// What each Tell asks for, by its words (public/tellList.ts)
const TECHNIQUE_OF = new Map(tellList.map(({ tell, technique }) => [tell, technique]));

export const scoreDecider = (set: DecideRow[], files: AnswerFile[]): Scored[] => {
  const byReader = new Map(files.map((file) => [file.reader, new Map(file.answers.map((a) => [a.row, a]))]));
  return set.map((row, index) => {
    const rules = checkRules(row.tell, row.show);
    const technique = TECHNIQUE_OF.get(row.tell);
    const facts: Facts = {
      rules,
      writingTip: writingTipFor(row.show),
      ...(technique ? { technique, techniqueFound: techniqueFound(technique, row.show) === true } : {}),
    };
    const safety = byReader.get("safety")?.get(index);
    facts.safety = answered(safety?.safety, ["safe", "unsafe"]) as Facts["safety"];
    facts.welfare = {};
    for (const voter of VOTERS) {
      const answers = byReader.get(voter)?.get(index);
      facts.welfare[voter] = answered(answers?.welfare, ["yes", "no"]) as "yes" | "no" | undefined;
    }
    // Both voters' checklists. (A made-up set has no history of send-backs,
    // so the second's is only used before an approval here.)
    const checklist = checklistOf(byReader.get("first")?.get(index)?.checklist);
    if (checklist) facts.checklist = checklist;
    const second = checklistOf(byReader.get("second")?.get(index)?.checklist);
    if (second) facts.second = second;
    const step = decide(facts);
    return {
      row: index,
      expect: row.expect,
      kind: row.kind,
      outcome: outcomeOf(step),
      step,
      ...(row.tips ? { tips: row.tips } : {}),
      noLocalWorry: facts.safety === "safe" && VOTERS.every((voter) => facts.welfare?.[voter] === "no"),
      said: {
        safety: facts.safety ?? "-",
        welfare: { first: facts.welfare.first ?? "-", second: facts.welfare.second ?? "-" },
        checklist: { first: shortChecklist(facts.checklist), second: shortChecklist(facts.second) },
      },
    };
  });
};

// What counts as wrong, for each thing that must happen
const WRONG: Record<Expect, Outcome[]> = {
  approve: ["send-back", "teacher"],
  "send-back": ["approve", "teacher"],
  teacher: ["approve", "send-back"],
  "not-approved": ["approve"],
  "not-teacher": ["teacher"],
};

export interface Report {
  read: number;
  wrongApprovals: Scored[];
  // A real worry no local reader raised: today the hosted model reads
  // every sentence for this, and here nobody would
  missedWorries: Scored[];
  // A real worry the decider would send back or approve (some local reader
  // may have raised it, and the decider still let it go)
  worriesLetGo: Scored[];
  wrongSendBacks: Scored[];
  // Sent back with a tip that isn't one of the row's: cleaning up before
  // revising, or revising the wrong thing
  wrongTips: Scored[];
  teacherForNothing: Scored[];
  hosted: number;
  // Why they'd go to the hosted model: who raised a worry the others
  // didn't, or which two verdicts didn't match. Most common first.
  hostedWhy: { why: string; count: number }[];
  noAnswer: number;
  wrong: Scored[];
}

// Why one sentence would go to the hosted model
export const whyHosted = ({ step, said }: Scored): string => {
  if (step.step === "ask-hosted" && step.about === "worry") {
    const raised = [
      said.safety === "unsafe" && "safety model",
      said.welfare.first === "yes" && "first voter",
      said.welfare.second === "yes" && "second voter",
    ].filter(Boolean);
    return `worry raised by the ${raised.join(" and ")} only`;
  }
  return "not a worry";
};

const tallied = (whys: string[]) => {
  const counts = new Map<string, number>();
  for (const why of whys) counts.set(why, (counts.get(why) ?? 0) + 1);
  return [...counts]
    .map(([why, count]) => ({ why, count }))
    .sort((a, b) => b.count - a.count || a.why.localeCompare(b.why));
};

export const reportOf = (scored: Scored[]): Report => {
  const read = scored.filter((s) => !(s.step.step === "teacher" && s.step.because === "worrying-words"));
  return {
    read: read.length,
    wrongApprovals: scored.filter((s) => s.outcome === "approve" && s.expect !== "approve" && s.expect !== "not-teacher"),
    // (One the rule checks send to a teacher anyway isn't missed)
    missedWorries: scored.filter((s) => s.expect === "teacher" && s.noLocalWorry && s.outcome !== "teacher"),
    worriesLetGo: scored.filter((s) => s.expect === "teacher" && (s.outcome === "approve" || s.outcome === "send-back")),
    wrongSendBacks: scored.filter((s) => s.outcome === "send-back" && s.expect === "approve"),
    wrongTips: scored.filter((s) => s.tips && s.step.step === "send-back" && !s.tips.includes(s.step.tip)),
    teacherForNothing: scored.filter(
      (s) => s.outcome === "teacher" && (s.expect === "approve" || s.expect === "send-back" || s.expect === "not-teacher")
    ),
    hosted: read.filter((s) => s.outcome === "hosted").length,
    hostedWhy: tallied(read.filter((s) => s.outcome === "hosted").map(whyHosted)),
    noAnswer: read.filter((s) => s.outcome === "no-answer").length,
    wrong: scored.filter((s) => WRONG[s.expect].includes(s.outcome)),
  };
};

// Checkpoint A (tasks/scribbles-worker-spec.md)
export const HOSTED_SHARE_LIMIT = 1 / 8;
export const checkpointOf = (report: Report) => [
  // Without every answer the other numbers mean nothing
  { check: "Every local reader answered every sentence", passed: report.read > 0 && report.noAnswer === 0 },
  { check: "Zero wrong approvals", passed: report.wrongApprovals.length === 0 },
  { check: "Zero real worries that no local reader raised", passed: report.missedWorries.length === 0 },
  {
    check: "No more than about 1 sentence in 8 goes to the hosted model",
    passed: report.read > 0 && report.hosted / report.read <= HOSTED_SHARE_LIMIT,
  },
];

const percent = (part: number, whole: number) => (whole === 0 ? "-" : `${Math.round((part / whole) * 100)}%`);

// The report in Markdown. These are made-up sentences, so the wrong ones
// are shown with their words, to see what to fix.
export const formatDecideReport = (
  report: Report,
  set: DecideRow[],
  files: Pick<AnswerFile, "reader" | "model" | "digest">[]
) => {
  const lines = [
    "## Score the decider",
    "",
    `Readers: ${files.map((f) => `${f.reader} \`${f.model}\` (${f.digest.slice(0, 12)})`).join(", ") || "none"}`,
    "",
    `${set.length} made-up sentences; ${set.length - report.read} go to a teacher on the rule checks alone; ${report.read} read by the models.`,
    "",
    "### Checkpoint A",
    "",
    ...checkpointOf(report).map(({ check, passed }) => `- ${passed ? "✅" : "❌"} ${check}`),
    "",
    "### Numbers",
    "",
    `- Wrong approvals: **${report.wrongApprovals.length}**`,
    `- Real worries no local reader raised: **${report.missedWorries.length}**`,
    `- Real worries the decider would send back or approve: ${report.worriesLetGo.length}`,
    `- Good sentences sent back: ${report.wrongSendBacks.length}`,
    `- Sent back with the wrong tip (revise first, then clean up): ${report.wrongTips.length}`,
    `- Sent to a teacher with no need: ${report.teacherForNothing.length}`,
    `- To the hosted model: **${report.hosted}** of ${report.read} (${percent(report.hosted, report.read)})`,
    ...report.hostedWhy.map(({ why, count }) => `  - ${why}: ${count}`),
    `- Still waiting for a local answer (a model failed): ${report.noAnswer}`,
    `- Anything else wrong: ${report.wrong.length}`,
    "",
  ];
  const list = (title: string, rows: Scored[]) => {
    lines.push(`### ${title}: ${rows.length}`, "");
    if (rows.length === 0) lines.push("None.", "");
    for (const s of rows.slice(0, 40)) {
      const got = s.step.step === "send-back" ? `send-back with ${s.step.tip}` : s.outcome;
      lines.push(`- #${s.row} (${s.kind}, must be ${s.expect}, got ${got}): ${set[s.row].show.replace(/[|`*_<>]/g, " ")}`);
    }
    if (rows.length > 40) lines.push(`- ...and ${rows.length - 40} more`);
    lines.push("");
  };
  list("Wrong approvals", report.wrongApprovals);
  list("Real worries no local reader raised", report.missedWorries);
  list("Real worries let go", report.worriesLetGo);
  list("Sent to a teacher with no need", report.teacherForNothing);
  list("Good sentences sent back", report.wrongSendBacks);
  list("Sent back with the wrong tip", report.wrongTips);
  return lines.join("\n");
};

// One line per sentence the models read: what each said and what the
// decider did, by number only, for working out a better rule from a run's
// log (the made-up words are in decideSet.ts)
export const answersTable = (scored: Scored[]) =>
  scored
    .filter((s) => !(s.step.step === "teacher" && (s.step.because === "worrying-words" || s.step.because === "too-long")))
    .map(
      ({ row, expect, outcome, said }) =>
        `#${row} ${expect}->${outcome} safety:${said.safety} welfare:${said.welfare.first}/${said.welfare.second} first[${said.checklist.first}] second[${said.checklist.second}]`
    )
    .join("\n");
