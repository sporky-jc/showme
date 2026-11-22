// The words the weekly sense word job may ask about (S3 of
// tasks/sense-words-plan.md), counted from approved Show sentences.
//
// Only single words leave here, never a sentence, and only words that:
// - are in at least MIN_SENTENCES approved sentences,
// - are ordinary English words (in the dictionary in lower case, so not a
//   name like "Springfield"),
// - are never written with a capital in the middle of a sentence (so not a
//   name like "Max" or "Rose"),
// - pass Scribbles' unsafe, worrying, sensitive and unkind checks.
import { inDictionaryLowerCase } from "../reviewer/spelling.js";
import { isSensitive, isUnkind, isUnsafe, isWorrying } from "../reviewer/rules.js";

export const MIN_SENTENCES = 3;

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

export function countWords(shows: readonly string[]): WordCount[] {
  const sentences = new Map<string, number>();
  const capitalized = new Set<string>();
  for (const show of shows) {
    const inThisOne = new Set<string>();
    for (const { word, first } of wordsAsWritten(show)) {
      const lower = word.toLowerCase();
      if (!first && word[0] !== lower[0]) capitalized.add(lower);
      inThisOne.add(lower);
    }
    for (const word of inThisOne) sentences.set(word, (sentences.get(word) ?? 0) + 1);
  }
  return [...sentences]
    .filter(
      ([word, count]) =>
        count >= MIN_SENTENCES &&
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
