// The words the weekly sense word job may ask about (S3 of
// tasks/sense-words-plan.md), counted from approved Show sentences.
//
// Only single words leave here, never a sentence, and only words that (gate
// 1 in the plan):
// - are in at least MIN_SENTENCES approved sentences, by at least MIN_KIDS
//   different kids, answering at least MIN_TELLS different Tells (so it
//   isn't one kid's word, or one prompt's);
// - are ordinary English words (in the dictionary in lower case, so not a
//   name like "Springfield");
// - are never written with a capital in the middle of a sentence, and
//   aren't a common first name (kids write "my friend rose" too);
// - pass Scribbles' unsafe, worrying, sensitive and unkind checks.
import { inDictionaryLowerCase } from "../reviewer/spelling.js";
import { isSensitive, isUnkind, isUnsafe, isWorrying } from "../reviewer/rules.js";
import { FIRST_NAMES } from "../reviewer/words.js";

export const MIN_SENTENCES = 3;
export const MIN_KIDS = 3;
export const MIN_TELLS = 2;

const NAMES = new Set(FIRST_NAMES);

// An approved sentence: its words, who wrote it and which Tell it answers
// (both only counted here, never passed on)
export type ApprovedShow = { show: string; author: string; tell: string };
export type WordCount = { word: string; sentences: number };

// The words of a sentence as written: letters only (no "can't"), with
// whether each starts the sentence
const wordsAsWritten = (show: string) => {
  const found: { word: string; first: boolean }[] = [];
  let first = true;
  for (const match of show.matchAll(/[A-Za-z'’‘]+|[.!?]+/g)) {
    const token = match[0];
    if (/^[.!?]+$/.test(token)) {
      first = true;
      continue;
    }
    found.push({ word: token, first });
    first = false;
  }
  return found;
};

export function countWords(approved: readonly ApprovedShow[]): WordCount[] {
  const sentences = new Map<string, number>();
  const kids = new Map<string, Set<string>>();
  const tells = new Map<string, Set<string>>();
  const capitalized = new Set<string>();
  for (const { show, author, tell } of approved) {
    const inThisOne = new Set<string>();
    for (const { word, first } of wordsAsWritten(show)) {
      const lower = word.toLowerCase();
      if (!first && word[0] !== lower[0]) capitalized.add(lower);
      inThisOne.add(lower);
    }
    for (const word of inThisOne) {
      sentences.set(word, (sentences.get(word) ?? 0) + 1);
      kids.set(word, (kids.get(word) ?? new Set()).add(author));
      tells.set(word, (tells.get(word) ?? new Set()).add(tell));
    }
  }
  return [...sentences]
    .filter(
      ([word, count]) =>
        count >= MIN_SENTENCES &&
        (kids.get(word)?.size ?? 0) >= MIN_KIDS &&
        (tells.get(word)?.size ?? 0) >= MIN_TELLS &&
        !NAMES.has(word) &&
        /^[a-z]{3,}$/.test(word) &&
        !capitalized.has(word) &&
        inDictionaryLowerCase(word) &&
        !isUnsafe(word) &&
        !isWorrying(word) &&
        !isSensitive(word) &&
        !isUnkind(word)
    )
    .map(([word, count]) => ({ word, sentences: count }))
    .sort((a, b) => b.sentences - a.sentences || a.word.localeCompare(b.word));
}
