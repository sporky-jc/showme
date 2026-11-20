// The shadow report: how often Scribbles' suggestions agree with what a
// teacher decided, before Scribbles is ever allowed to approve on its own.
// Pure functions only, no database: scripts/shadow-report.ts reads the rows
// and prints what these work out.
//
// A decision is only compared with a suggestion for the exact words the
// teacher decided on. A student's edit gets a new suggestion (one per
// version of a sentence, models/reviewSuggestions.ts), so the suggestion
// for older words says nothing about what the teacher read: those rows are
// left out, and counted.
import type { Reason, Verdict } from "./contract.js";
import type { TipId } from "./tips.js";

export type TeacherStatus = "approve" | "redo";

// What a teacher decided about one version of a sentence
export interface TeacherDecision {
  status: TeacherStatus;
  // The tip the student got (null: sent back with no tip)
  tip: TipId | null;
  // The exact words decided on
  show: string;
  // When, if it was recorded (models/reviewDecisions.ts). Decisions made
  // before that are read from the sentence's own state, which has no date.
  decidedAt: Date | null;
  // When the teacher took it back (PATCH /Admin/undo), if they did: then it
  // isn't what they decided, and it's left out (and counted)
  undoneAt?: Date | null;
}

// A suggestion Scribbles saved (models/reviewSuggestions.ts)
export interface SavedSuggestion {
  show: string;
  verdict: Verdict;
  tip: TipId | null;
  reasons: Reason[];
  decidedBy: string;
  createdAt: Date;
}

// One teacher decision, and the suggestion found for its sentence: the one
// for the same words if there is one, otherwise any (the newest), so a
// suggestion for other words can be counted, or none at all
export interface ComparisonRow {
  decision: TeacherDecision;
  suggestion: SavedSuggestion | null;
}

// How a group of compared decisions came out
export interface Tally {
  compared: number;
  // Both approved
  approveAgree: number;
  // Both sent it back, and how many of those with the same tip
  redoAgree: number;
  redoSameTip: number;
  // Scribbles would have approved, the teacher sent it back: the one that
  // matters most, since an automatic approval puts it in the gallery
  approveButRedo: number;
  // Scribbles would have sent it back, the teacher approved
  redoButApprove: number;
  // Scribbles held it for a person ("unsure"), and what the teacher did
  unsureApproved: number;
  unsureRedo: number;
}

// A sentence Scribbles would have approved and the teacher sent back. Only
// the words (which teachers already see on the Teacher page), shortened,
// and dates: never who wrote it.
export interface Disagreement {
  text: string;
  decidedOn: string | null;
  suggestedOn: string;
  teacherTip: TipId | null;
}

export interface ShadowReport {
  // Every row given
  decisions: number;
  // Left out: no suggestion for the sentence at all, or only one for other
  // words than the teacher decided on
  noSuggestion: number;
  otherWords: number;
  // Left out: decisions the teacher took back
  undone: number;
  // Of those compared: how many have no recorded decision (read from the
  // sentence's state instead), and how many were decided before Scribbles'
  // suggestion was saved (so the teacher can't have seen it)
  undated: number;
  beforeSuggestion: number;
  total: Tally;
  approveButRedo: Disagreement[];
  // Scribbles' tip on the sentences it would have sent back and the teacher
  // approved, most common first
  redoButApproveTips: { tip: TipId | "none"; count: number }[];
  // The holds, by reason ("worrying" first, then most common): one hold
  // can have several reasons, and counts under each
  holdReasons: { reason: Reason; approved: number; redo: number }[];
  // By week (starting Monday, UTC), oldest first
  weeks: { week: string; tally: Tally }[];
}

// The longest text shown for a disagreement
export const MAX_TEXT = 120;

const emptyTally = (): Tally => ({
  compared: 0,
  approveAgree: 0,
  redoAgree: 0,
  redoSameTip: 0,
  approveButRedo: 0,
  redoButApprove: 0,
  unsureApproved: 0,
  unsureRedo: 0,
});

const DAY = 24 * 60 * 60 * 1000;
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

// The Monday (UTC) starting the week a date is in
export const weekOf = (date: Date) => {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // getUTCDay: 0 is Sunday, which belongs to the week that began six days before
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return dayOf(new Date(midnight - sinceMonday * DAY));
};

// One line of text, at most MAX_TEXT characters
export const shorten = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= MAX_TEXT ? line : `${line.slice(0, MAX_TEXT - 1)}…`;
};

const add = (tally: Tally, decision: TeacherDecision, suggestion: SavedSuggestion) => {
  tally.compared++;
  const approved = decision.status === "approve";
  if (suggestion.verdict === "unsure") {
    if (approved) tally.unsureApproved++;
    else tally.unsureRedo++;
  } else if (suggestion.verdict === "approve") {
    if (approved) tally.approveAgree++;
    else tally.approveButRedo++;
  } else if (approved) {
    tally.redoButApprove++;
  } else {
    tally.redoAgree++;
    if (suggestion.tip === decision.tip) tally.redoSameTip++;
  }
};

const mostFirst = <K extends string>(counts: Map<K, number>) =>
  [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

export const compareDecisions = (rows: ComparisonRow[]): ShadowReport => {
  const report: ShadowReport = {
    decisions: rows.length,
    noSuggestion: 0,
    otherWords: 0,
    undone: 0,
    undated: 0,
    beforeSuggestion: 0,
    total: emptyTally(),
    approveButRedo: [],
    redoButApproveTips: [],
    holdReasons: [],
    weeks: [],
  };
  const redoTips = new Map<TipId | "none", number>();
  const holds = new Map<Reason, { approved: number; redo: number }>();
  const weeks = new Map<string, Tally>();

  for (const { decision, suggestion } of rows) {
    // Taken back: the teacher changed their mind, so Scribbles agreeing or
    // not with it says nothing
    if (decision.undoneAt) {
      report.undone++;
      continue;
    }
    if (!suggestion) {
      report.noSuggestion++;
      continue;
    }
    // Exactly the same words, or it's not the sentence the teacher read
    if (suggestion.show !== decision.show) {
      report.otherWords++;
      continue;
    }

    add(report.total, decision, suggestion);
    if (!decision.decidedAt) report.undated++;
    else if (decision.decidedAt < suggestion.createdAt) report.beforeSuggestion++;

    // A decision with no date was made after the suggestion (Scribbles only
    // reviews sentences still waiting), so the suggestion's week stands in
    const week = weekOf(decision.decidedAt ?? suggestion.createdAt);
    if (!weeks.has(week)) weeks.set(week, emptyTally());
    add(weeks.get(week)!, decision, suggestion);

    if (suggestion.verdict === "approve" && decision.status === "redo") {
      report.approveButRedo.push({
        text: shorten(decision.show),
        decidedOn: decision.decidedAt ? dayOf(decision.decidedAt) : null,
        suggestedOn: dayOf(suggestion.createdAt),
        teacherTip: decision.tip,
      });
    }
    if (suggestion.verdict === "redo" && decision.status === "approve") {
      const tip = suggestion.tip ?? "none";
      redoTips.set(tip, (redoTips.get(tip) ?? 0) + 1);
    }
    if (suggestion.verdict === "unsure") {
      for (const reason of new Set(suggestion.reasons)) {
        const hold = holds.get(reason) ?? { approved: 0, redo: 0 };
        if (decision.status === "approve") hold.approved++;
        else hold.redo++;
        holds.set(reason, hold);
      }
    }
  }

  report.approveButRedo.sort((a, b) =>
    (a.decidedOn ?? a.suggestedOn).localeCompare(b.decidedOn ?? b.suggestedOn)
  );
  report.redoButApproveTips = mostFirst(redoTips).map(({ key, count }) => ({ tip: key, count }));
  report.holdReasons = [...holds]
    .map(([reason, { approved, redo }]) => ({ reason, approved, redo }))
    .sort(
      (a, b) =>
        Number(b.reason === "worrying") - Number(a.reason === "worrying") ||
        b.approved + b.redo - (a.approved + a.redo) ||
        a.reason.localeCompare(b.reason)
    );
  report.weeks = [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, tally]) => ({ week, tally }));
  return report;
};

// "3 of 4 (75%)", or "0 of 0" when there's nothing to divide by
export const ratio = (part: number, whole: number) =>
  whole === 0 ? `${part} of 0` : `${part} of ${whole} (${Math.round((part / whole) * 1000) / 10}%)`;

// How many Scribbles made a call on (approve or redo, not a hold), and
// agreed with the teacher on
const calls = (t: Tally) => t.approveAgree + t.redoAgree + t.approveButRedo + t.redoButApprove;
const agreed = (t: Tally) => t.approveAgree + t.redoAgree;

// A student's words in Markdown, shown as written: nothing in them can make
// a link, bold, HTML or a table (each line starts with "- ", so nothing at
// the start of the words can make a heading or a list)
const asText = (text: string) => text.replace(/[\\`*_[\]<>|~&]/g, (c) => `\\${c}`);

// The report in Markdown, for the terminal and the workflow's summary.
// Counts, tips, reasons, dates and (for the disagreements that matter) the
// shortened words; never who wrote a sentence or who decided.
export const formatReport = (
  report: ShadowReport,
  { database, leftOut }: { database: string; leftOut: number }
) => {
  const t = report.total;
  const lines = [
    `## Shadow report: Scribbles vs the teacher (${database})`,
    "",
    `${report.decisions} teacher decisions read; ${leftOut} more left out (test accounts and sample data).`,
    `- Compared (a suggestion for the same words): **${t.compared}**`,
    `- Left out, no suggestion for the sentence: ${report.noSuggestion}`,
    `- Left out, the suggestion was for other words than the teacher decided on: ${report.otherWords}`,
    `- Left out, the teacher took the decision back: ${report.undone}`,
    `- Of those compared, read from the sentence's state (decided before decisions were recorded, no date): ${report.undated}`,
    `- Of those compared, decided before Scribbles' suggestion was saved: ${report.beforeSuggestion}`,
    "",
    "### Agreement",
    "",
    `- When Scribbles made a call (approve or redo), it agreed: **${ratio(agreed(t), calls(t))}**`,
    `- Of Scribbles' approvals, the teacher also approved: ${ratio(t.approveAgree, t.approveAgree + t.approveButRedo)}`,
    `- Of Scribbles' redos, the teacher also sent back: ${ratio(t.redoAgree, t.redoAgree + t.redoButApprove)}; with the same tip: ${ratio(t.redoSameTip, t.redoAgree)}`,
    `- Held for a person (unsure): ${t.unsureApproved + t.unsureRedo} (teacher approved ${t.unsureApproved}, sent back ${t.unsureRedo})`,
    "",
    `### Scribbles would have approved, the teacher sent it back: ${t.approveButRedo}`,
    "",
  ];
  if (report.approveButRedo.length === 0) lines.push("None.");
  for (const d of report.approveButRedo) {
    const when = d.decidedOn ? `decided ${d.decidedOn}` : `suggested ${d.suggestedOn}, decision date unknown`;
    lines.push(`- ${asText(d.text)} (${when}; teacher's tip: ${d.teacherTip ?? "none"})`);
  }
  lines.push("", `### Scribbles would have sent it back, the teacher approved: ${t.redoButApprove}`, "");
  if (report.redoButApproveTips.length === 0) lines.push("None.");
  else lines.push(`Scribbles' tip: ${report.redoButApproveTips.map(({ tip, count }) => `${tip} ${count}`).join(", ")}`);

  lines.push("", "### Held for a person, and what the teacher did", "");
  const worrying = report.holdReasons.find((h) => h.reason === "worrying");
  lines.push(`Worrying: ${worrying ? worrying.approved + worrying.redo : 0} (approved ${worrying?.approved ?? 0}, sent back ${worrying?.redo ?? 0})`);
  if (report.holdReasons.length > 0) {
    lines.push("", "| Reason | Approved | Sent back |", "| --- | ---: | ---: |");
    for (const h of report.holdReasons) lines.push(`| ${h.reason} | ${h.approved} | ${h.redo} |`);
  }

  lines.push("", "### By week (starting Monday)", "");
  if (report.weeks.length === 0) lines.push("No decisions to compare yet.");
  else {
    lines.push(
      "| Week | Compared | Agreed | Approve, sent back | Redo, approved | Held |",
      "| --- | ---: | ---: | ---: | ---: | ---: |"
    );
    for (const { week, tally } of report.weeks) {
      lines.push(
        `| ${week} | ${tally.compared} | ${ratio(agreed(tally), calls(tally))} | ${tally.approveButRedo} | ${tally.redoButApprove} | ${tally.unsureApproved + tally.unsureRedo} |`
      );
    }
  }
  return lines.join("\n");
};
