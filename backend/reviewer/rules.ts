// The rule checks: the reviewer's first layer, plain code with no AI in it.
// They run on every sentence before anything else, so they can't be talked
// out of their rules by what a sentence says, and they decide two things:
//
// 1. What must never leave our systems or reach the gallery unread: bad
//    language, signs a child may be in trouble, words a person should read
//    first, and personal details. These are held for a person ("hold"), and
//    no AI provider ever sees them. Held is the safe side: when in doubt,
//    hold.
// 2. The two plain cases an AI isn't needed for: a sentence that copies its
//    Tell, or one too short to paint a picture ("redo", with the matching
//    tip). Only after every safety check, so a worrying sentence is never
//    just sent back.
//
// Anything else passes on to the next layer ("pass"). Whether a sentence
// paints a picture is for the AI or a person to judge, not a word list.
import type { Reason } from "./contract.js";
import type { TipId } from "./tips.js";
import {
  FIRST_NAMES,
  PERSONAL_PHRASES,
  SENSITIVE_WORDS,
  UNSAFE_INSIDE,
  UNSAFE_WORDS,
  WORRYING_PHRASES,
} from "./words.js";

export type RuleOutcome =
  | { outcome: "hold"; reasons: Reason[] }
  | { outcome: "redo"; tip: TipId; reasons: Reason[] }
  | { outcome: "pass" };

// Fewer words than this can't paint a picture
export const MIN_WORDS = 5;
// Longer than any Show sentence: held, and not checked further (long text
// would make the checks slow)
export const MAX_CHARACTERS = 600;

// ---- Reading the sentence --------------------------------------------------

// Characters that show nothing but can split a word in two ("d​amn")
const INVISIBLE =
  /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿]/g;

// Letters from other alphabets that look like English ones ("shіt" with a
// Cyrillic і)
const ALPHABET_LOOKALIKES: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t",
  у: "y", х: "x", і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ԛ: "q", ԝ: "w",
  α: "a", β: "b", ε: "e", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u",
  χ: "x", ω: "w",
};

// Symbols and digits people swap in for letters to get past filters ("sh1t",
// "@ss", "$ex"). Only swapped where they stand for a letter: inside a word,
// never as a word's own punctuation ("die!" stays "die").
const SYMBOL_LOOKALIKES: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s",
  "!": "i", "|": "i",
};

// The text as plain lower-case letters: accents, invisible characters and
// other alphabets' look-alikes removed, curly quotes made straight
const plain = (text: string) =>
  text
    .replace(INVISIBLE, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/./gu, (c) => ALPHABET_LOOKALIKES[c] ?? c);

// The sentence's words, read several ways
interface Reading {
  words: string[]; // as written: letters and apostrophes
  swapped: string[]; // symbols inside a word read as the letters they stand for ("sh1t")
  inside: string[]; // each written word with everything but letters removed ("shitstorm")
  dotted: string[]; // words with symbols inside them, symbols removed ("s.e.x.y"; not "he'll")
  spelledOut: string[]; // runs of single letters joined ("f u c k")
}

const read = (text: string): Reading => {
  const lower = plain(text);
  const words = lower.match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
  const tokens = lower.split(/\s+/).filter(Boolean);
  const swapped = tokens.flatMap((token) => {
    // Punctuation around a word is punctuation, not a letter ("die!")
    const core = token.replace(/^[^a-z0-9@$]+|[^a-z0-9]+$/g, "");
    // A token with no letters at all is a number ("2", "1000"), not a word
    if (!/[a-z]/.test(core)) return [];
    const letters = core.replace(/[0134578@$!|]/g, (c) => SYMBOL_LOOKALIKES[c] ?? c);
    return letters.match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
  });
  const inside = tokens.map((token) => token.replace(/[^a-z]/g, "")).filter(Boolean);
  const dotted = tokens
    .map((token) => token.replace(/^[^a-z]+|[^a-z]+$/g, ""))
    .filter((core) => /[^a-z']/.test(core))
    .map((core) => core.replace(/[^a-z]/g, ""));
  const spelledOut: string[] = [];
  let run = "";
  for (const token of tokens) {
    const letters = token.replace(/[^a-z]/g, "");
    if (letters.length === 1) run += letters;
    else {
      if (run.length > 1) spelledOut.push(run);
      run = "";
    }
  }
  if (run.length > 1) spelledOut.push(run);
  return { words, swapped, inside, dotted, spelledOut };
};

// Does this list of words contain the phrase (as whole words)?
const hasPhrase = (words: string[], phrase: string) => {
  const parts = phrase.split(" ");
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j] === part)) return true;
  }
  return false;
};

const anyPhrase = (reading: Reading, phrases: string[]) =>
  phrases.some((phrase) => hasPhrase(reading.words, phrase) || hasPhrase(reading.swapped, phrase));

// ---- Safety ----------------------------------------------------------------

const UNSAFE = new Set(UNSAFE_WORDS);
const SENSITIVE = new Set(SENSITIVE_WORDS);
const FIRST = new Set(FIRST_NAMES);

export const isUnsafe = (text: string) => {
  const reading = read(text);
  const whole = [...reading.words, ...reading.swapped, ...reading.dotted, ...reading.spelledOut];
  if (whole.some((w) => UNSAFE.has(w))) {
    return true;
  }
  // Inside one written word, never across two ("a bit chilly" is fine)
  return [...reading.inside, ...reading.spelledOut].some((w) =>
    UNSAFE_INSIDE.some((bad) => w.includes(bad))
  );
};

export const isWorrying = (text: string) => anyPhrase(read(text), WORRYING_PHRASES);

export const isSensitive = (text: string) => {
  const { words, swapped } = read(text);
  return [...words, ...swapped].some((word) => SENSITIVE.has(word));
};

// Patterns for personal details, on the text with invisible characters
// removed. Every repeat is bounded, so no input can make them slow.
const EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){0,3}\.[a-z]{2,10}/i;
// A web address. Lower-case endings only: "happy.Me and my dog" (a missing
// space after a full stop) isn't a link.
const LINK =
  /(https?:\/\/|www\.)\S{1,200}|\b[a-z0-9-]{2,63}\.(com|net|org|edu|gov|io|co|us|uk|ca|au|nz|ie|de|fr|es|it|nl|in|me|ly|gg|tv|app|xyz|info|online|site|club|fun|games)\b/;
// A handle: @ and a name, not inside an email ("(@samcool)", "@frosty_kid")
const HANDLE = /(^|[^a-z0-9_.@])@[a-z0-9_.]{2,30}/i;
// Phone numbers: 555-1234, (555) 123-4567, +1 555.123.4567, 5551234567,
// +44 7911 123456; not a year next to a number, or a million written out
const PHONE =
  /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b|\b\d{3}[\s.-]\d{4}\b|\b\d{10,11}\b|\+\d{1,3}[\s.-]?\d{2,5}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/;
const STREET_WORD =
  "(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|way|place|pl|circle)";
// "42 Maple Street", "42 maple street": a number, one to three words, a
// street word (the words checked in code, so "2 cars on the road" isn't one)
const NUMBERED_STREET = new RegExp(`\\b\\d{1,5}\\s+((?:[a-z]{1,20}\\s+){1,3})${STREET_WORD}\\b`, "gi");
// "on Elm Street": a capitalized name and a capitalized street word
const NAMED_STREET =
  /\b[A-Z][a-z]{1,20}\s+(Street|Avenue|Road|Lane|Drive|Court|Boulevard|Place|Circle)\b/;
// "Lincoln Elementary", "Maple Middle School", "Oak Primary"
const SCHOOL = /\b[A-Z][a-z]{1,20}\s+(Elementary|Primary|Middle|High|Academy|Prep)\b/;
// Words that can come between a number and "road" in an ordinary sentence
const NOT_A_STREET_NAME = new Set([
  "a", "an", "the", "on", "in", "at", "of", "to", "by", "near", "down", "up", "across",
  "along", "over", "under", "my", "our", "his", "her", "their", "your", "and", "or",
  "big", "small", "long", "old", "new", "dirt", "busy", "icy", "snowy", "wet", "dark",
]);

const hasAddress = (text: string) => {
  if (NAMED_STREET.test(text)) return true;
  for (const match of text.matchAll(NUMBERED_STREET)) {
    const between = match[1].trim().toLowerCase().split(/\s+/);
    if (between.every((word) => !NOT_A_STREET_NAME.has(word))) return true;
  }
  return false;
};

// A common first name followed by a capitalized word: "Emma Johnson"
const hasFullName = (text: string) => {
  for (const match of text.matchAll(/\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,30})\b/g)) {
    if (FIRST.has(match[1].toLowerCase()) && !FIRST.has(match[2].toLowerCase())) return true;
  }
  return false;
};

export const hasPersonalDetails = (text: string) => {
  const visible = text.replace(INVISIBLE, "");
  return (
    EMAIL.test(visible) ||
    LINK.test(visible) ||
    HANDLE.test(visible) ||
    PHONE.test(visible) ||
    hasAddress(visible) ||
    SCHOOL.test(visible) ||
    hasFullName(visible) ||
    anyPhrase(read(visible), PERSONAL_PHRASES)
  );
};

// ---- The plain cases ---------------------------------------------------------

// Small words left out when comparing a sentence with its Tell
const STOP = new Set([
  "a", "an", "the", "is", "was", "are", "were", "be", "it", "its", "it's", "and", "or",
  "but", "so", "to", "of", "in", "on", "at", "very", "really", "too", "i", "my", "me",
  "he", "she", "his", "her", "they", "their", "we", "our", "you", "your", "this", "that",
  "outside", "today",
]);

// The sentence repeats its Tell instead of showing it: the same words, or
// the Tell's words with at most two new ones
const copiesTell = (tell: string, show: string) => {
  const meaningful = (text: string) => read(text).words.filter((word) => !STOP.has(word));
  const tellWords = new Set(meaningful(tell));
  const showWords = meaningful(show);
  if (tellWords.size === 0) return false;
  const reused = [...tellWords].filter((word) => showWords.includes(word)).length;
  const added = showWords.filter((word) => !tellWords.has(word)).length;
  return reused / tellWords.size >= 0.8 && added <= 2;
};

// ---- All together ------------------------------------------------------------

export const checkRules = (tell: string, show: string): RuleOutcome => {
  if (show.length > MAX_CHARACTERS) return { outcome: "hold", reasons: ["too-long"] };

  // Safety first: these are held, whatever else is true of the sentence
  const reasons: Reason[] = [];
  if (isWorrying(show)) reasons.push("worrying");
  // (Only when nothing already says "worrying", which covers it)
  if (reasons.length === 0 && isSensitive(show)) reasons.push("sensitive-words");
  if (isUnsafe(show)) reasons.push("unsafe-words");
  if (hasPersonalDetails(show)) reasons.push("personal-details");
  if (reasons.length > 0) return { outcome: "hold", reasons };

  // Copying the Tell first: that tip says more than "too short"
  if (copiesTell(tell, show)) return { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] };
  if (read(show).words.length < MIN_WORDS) {
    return { outcome: "redo", tip: "more", reasons: ["too-short"] };
  }
  return { outcome: "pass" };
};
