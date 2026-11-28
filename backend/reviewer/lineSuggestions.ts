// The review line's suggestions for the sentences on a Teacher page
// (spec/SPEC-teacher-suggestions.md): for each sentence, its line record
// for its current words, turned into a card's suggestion
// (lineSuggestion.ts). A sentence the line hasn't taken in yet gets none.
import type { Types } from "mongoose";
import { ReviewLine, hashShow } from "../models/reviewLine.js";
import { HostedUsage } from "../models/hostedUsage.js";
import { checkRules } from "./rules.js";
import { lineSuggestion, type LineRecord, type LineSuggestion } from "./lineSuggestion.js";

type Waiting = { _id: Types.ObjectId; tell: string; show: string };

export const lineSuggestionsFor = async (sentences: Waiting[]): Promise<Map<string, LineSuggestion>> => {
  if (sentences.length === 0) return new Map();
  const lines = await ReviewLine.find(
    { sentence: { $in: sentences.map((s) => s._id) }, state: { $ne: "replaced" } },
    { sentence: 1, showHash: 1, state: 1, decided: 1, answers: 1 }
  ).lean();
  const byWords = new Map(lines.map((line) => [`${String(line.sentence)} ${line.showHash}`, line]));
  // How many contact details the hosted model's questions had hidden, per line
  const usage = await HostedUsage.find({ line: { $in: lines.map((l) => l._id) } }, { line: 1, hidden: 1 }).lean();
  const hidden = new Map<string, number>();
  for (const u of usage) hidden.set(String(u.line), Math.max(hidden.get(String(u.line)) ?? 0, u.hidden ?? 0));

  const suggestions = new Map<string, LineSuggestion>();
  for (const sentence of sentences) {
    const line = byWords.get(`${String(sentence._id)} ${hashShow(sentence.show)}`);
    if (!line) continue;
    suggestions.set(String(sentence._id), lineSuggestion(line as LineRecord, checkRules(sentence.tell, sentence.show), hidden.get(String(line._id)) ?? 0));
  }
  return suggestions;
};
