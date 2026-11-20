// The rule checks: the reviewer's first layer, plain code with no AI in it.
// They run on every sentence before anything else, so they can't be talked
// out of their rules by what a sentence says, and they decide two things:
//
// 1. What must never leave our systems or reach the gallery unread: bad
//    language, signs a child may be in trouble, and personal details. These
//    are held for a person ("hold"), and no AI provider ever sees them.
// 2. The plain cases an AI isn't needed for: a sentence that is too short,
//    copies its Tell, or (when short) uses no senses at all ("redo", with
//    the matching tip).
//
// Anything else passes on to the next layer ("pass").
import type { Reason } from "./contract.js";
import type { TipId } from "./tips.js";
import {
  PERSONAL_PHRASES,
  SENSORY_WORDS,
  STOP_WORDS,
  UNSAFE_SQUASHED,
  UNSAFE_WORDS,
  WORRYING_PHRASES,
} from "./words.js";

export type RuleOutcome =
  | { outcome: "hold"; reasons: Reason[] }
  | { outcome: "redo"; tip: TipId; reasons: Reason[] }
  | { outcome: "pass" };

// Fewer words than this can't paint a picture
export const MIN_WORDS = 5;
// A sentence shorter than this with no sensory word is a plain Tell
const SHORT_WITHOUT_SENSES = 10;

// Letters people swap in to get past filters ("sh1t", "@ss", "$ex")
const LOOKALIKES: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s",
  "!": "i", "|": "i",
};

// Lower case, accents removed, curly quotes made straight
const plain = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .toLowerCase();

// The sentence's words, after undoing look-alike letters
const wordsOf = (text: string) =>
  plain(text)
    .replace(/[0134578@$!|]/g, (c) => LOOKALIKES[c] ?? c)
    .match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

// Does this list of words contain the phrase (as whole words)?
const hasPhrase = (words: string[], phrase: string) => {
  const parts = phrase.split(" ");
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j] === part)) return true;
  }
  return false;
};

const UNSAFE = new Set(UNSAFE_WORDS);
const SENSORY = new Set(SENSORY_WORDS);
const STOP = new Set(STOP_WORDS);

// Patterns for personal details (the raw text, so "@" and digits count)
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|us|uk|me|ly|gg|tv|app)\b/i;
// 555-1234, (555) 123-4567, +1 555.123.4567, 5551234567; not a year next to
// a number, or a million written out
const PHONE =
  /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b|\b\d{3}[\s.-]\d{4}\b|\b\d{10,11}\b/;
const HANDLE = /(^|\s)@[a-z0-9_.]{2,}/i;
// "42 Maple Street": a number, a capitalized name and a street word (so "2
// cars on the road" isn't an address)
const STREET = /\b\d{1,5}\s+([A-Z][a-z]+\s+){1,3}(Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Boulevard|Blvd|Way)\b/;

export const hasPersonalDetails = (text: string) => {
  const words = wordsOf(text);
  return (
    EMAIL.test(text) ||
    LINK.test(text) ||
    PHONE.test(text) ||
    HANDLE.test(text) ||
    STREET.test(text) ||
    PERSONAL_PHRASES.some((phrase) => hasPhrase(words, phrase))
  );
};

export const isUnsafe = (text: string) => {
  const words = wordsOf(text);
  if (words.some((word) => UNSAFE.has(word))) return true;
  const squashed = words.join("");
  return UNSAFE_SQUASHED.some((word) => squashed.includes(word));
};

export const isWorrying = (text: string) => {
  const words = wordsOf(text);
  return WORRYING_PHRASES.some((phrase) => hasPhrase(words, phrase));
};

// The sentence repeats its Tell instead of showing it: the same words, or
// the Tell's words with at most two new ones
const copiesTell = (tell: string, show: string) => {
  const meaningful = (text: string) => wordsOf(text).filter((word) => !STOP.has(word));
  const tellWords = new Set(meaningful(tell));
  const showWords = meaningful(show);
  if (tellWords.size === 0) return false;
  const reused = [...tellWords].filter((word) => showWords.includes(word)).length;
  const added = showWords.filter((word) => !tellWords.has(word)).length;
  return reused / tellWords.size >= 0.8 && added <= 2;
};

export const checkRules = (tell: string, show: string): RuleOutcome => {
  // Safety first: these are held, whatever else is true of the sentence
  const reasons: Reason[] = [];
  if (isWorrying(show)) reasons.push("worrying");
  if (isUnsafe(show)) reasons.push("unsafe-words");
  if (hasPersonalDetails(show)) reasons.push("personal-details");
  if (reasons.length > 0) return { outcome: "hold", reasons };

  const words = wordsOf(show);
  // Copying the Tell first: that tip says more than "too short"
  if (copiesTell(tell, show)) return { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] };
  if (words.length < MIN_WORDS) return { outcome: "redo", tip: "more", reasons: ["too-short"] };
  if (words.length < SHORT_WITHOUT_SENSES && !words.some((word) => SENSORY.has(word))) {
    return { outcome: "redo", tip: "senses", reasons: ["no-senses"] };
  }
  return { outcome: "pass" };
};
