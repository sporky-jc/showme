// The rule checks: the reviewer's first layer, plain code with no AI in it.
// They run on every sentence before anything else, so they can't be talked
// out of their rules by what a sentence says, and they decide two things:
//
// 1. What must never leave our systems or reach the gallery unread: bad
//    language, signs a child may be in trouble, words a person should read
//    first, and personal details. These are held for a person ("hold"), and
//    no AI provider ever sees them. Held is the safe side: when in doubt,
//    hold.
// 2. The one plain case an AI isn't needed for: a sentence that copies its
//    Tell ("redo", with the "own words" tip). Only after every safety
//    check. Nothing else is sent back by the rules: a word list can miss a
//    worrying sentence, and a missed one must reach the AI or a person,
//    never be bounced back to the child.
//
// Anything else passes on to the next layer ("pass"). Whether a sentence
// paints a picture is for the AI or a person to judge, not a word list.
import { MAX_CHARACTERS, type Reason } from "./contract.js";
import { libraryFindsFullName, libraryFindsUnsafe } from "./libraries.js";
import type { TipId } from "./tips.js";
import {
  FIRST_NAMES,
  PERSONAL_PHRASES,
  PRETEND_NAMES,
  SENSITIVE_WORDS,
  UNSAFE_INSIDE,
  UNSAFE_WORDS,
  WORRYING_PHRASES,
} from "./words.js";

export type RuleOutcome =
  | { outcome: "hold"; reasons: Reason[] }
  | { outcome: "redo"; tip: TipId; reasons: Reason[] }
  | { outcome: "pass" };

// Longer than any Show sentence (MAX_CHARACTERS, shared with the API
// contract): held, and not checked further (long text would make the checks
// slow)
export { MAX_CHARACTERS };

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
  // Small capitals ("ꜱʜɪᴛ")
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k",
  ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w",
  ʏ: "y", ᴢ: "z",
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
  stretched: string[]; // letters said three or more times said once ("fuuuck", "shiiit")
  starred: boolean; // a word with letters starred out ("f*ck", "a**hole", "sh#t")
}

const read = (text: string): Reading => {
  const lower = plain(text);
  const words = lower.match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
  // Written words: split at spaces, and at "/" or "..." between two words
  // ("mother/father", "a bit...chilly")
  const tokens = lower.split(/[\s/]+|\.{2,}|\u2026/).filter(Boolean);
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
  const stretched = [...words, ...swapped]
    .filter((word) => /([a-z])\1\1/.test(word))
    .map((word) => word.replace(/([a-z])\1{2,}/g, "$1"));
  const starred = tokens.some((token) => /[a-z][*#]+[a-z]|^[a-z][*#]{2,}|[*#]{2,}[a-z]$/.test(token));
  return { words, swapped, inside, dotted, spelledOut, stretched, starred };
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
  if (reading.starred) return true;
  const whole = [
    ...reading.words,
    ...reading.swapped,
    ...reading.dotted,
    ...reading.spelledOut,
    ...reading.stretched,
  ];
  if (whole.some((w) => UNSAFE.has(w))) return true;
  // Inside one written word, never across two ("a bit chilly" is fine)
  if (
    [...reading.inside, ...reading.spelledOut, ...reading.stretched].some((w) =>
      UNSAFE_INSIDE.some((bad) => w.includes(bad))
    )
  ) {
    return true;
  }
  // And the obscenity library's list, on the cleaned-up text
  return libraryFindsUnsafe(plain(text));
};

// Someone doing something to the child: "Dad hit me", "they beat me up", "my
// uncle touched me". Only with a person doing it: "the cold wind hits me
// like a wall" is a Show sentence.
const PEOPLE = new Set([
  "dad", "daddy", "mom", "mommy", "mum", "mother", "father", "stepdad", "stepmom",
  "brother", "sister", "uncle", "aunt", "grandpa", "grandma", "teacher", "coach",
  "he", "she", "they", "someone", "somebody", "man", "boy", "boys", "girl", "girls",
  "kids", "kid", "parents", "babysitter", "cousin", "neighbor",
]);
const DONE_TO = new Set([
  "hit", "hits", "hitting", "beat", "beats", "beating", "kick", "kicks", "kicked",
  "punch", "punches", "punched", "slap", "slaps", "slapped", "touch", "touches", "touched",
  "hurt", "hurts", "choke", "choked", "grabbed", "pushed", "shoved", "yells", "yelled",
  "screams", "screamed",
]);
const someoneHurtsMe = (words: string[]) => {
  for (let i = 0; i < words.length; i++) {
    if (!DONE_TO.has(words[i]) || words[i + 1] !== "me") continue;
    // A person up to three words before: "my dad always hits me"
    if (words.slice(Math.max(0, i - 3), i).some((word) => PEOPLE.has(word))) return true;
  }
  return false;
};

export const isWorrying = (text: string) => {
  const reading = read(text);
  return anyPhrase(reading, WORRYING_PHRASES) || someoneHurtsMe(reading.words);
};

export const isSensitive = (text: string) => {
  const { words, swapped } = read(text);
  return [...words, ...swapped].some((word) => SENSITIVE.has(word));
};

// Patterns for personal details, on the text with invisible characters
// removed. Every repeat is bounded, so no input can make them slow.
const EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){0,3}\.[a-z]{2,10}/i;
// A web address, in any case ("Roblox.com", "ROBLOX.COM"). Not a word
// starting with a capital right after a dot ("happy.Me and my dog" is a
// missing space), and not endings that are everyday words ("cold.it melted").
const LINK =
  /(https?:\/\/|www\.)\S{1,200}|[a-z0-9-]{2,63}\.(com|net|org|edu|gov|io|co|uk|ca|au|nz|ie|fr|nl|ly|gg|tv|app|xyz|info|online|site|club|fun|games)\b/gi;
const hasLink = (text: string) => {
  for (const match of text.matchAll(LINK)) {
    const ending = match[2];
    // "happy.Me": a capital then lower case after the dot starts a sentence
    if (ending !== undefined && /^[A-Z][a-z]/.test(ending)) continue;
    return true;
  }
  return false;
};
// A handle: @ and a name starting with a letter, not inside an email
// ("(@samcool)", "@frosty_kid"; not "@6am")
const HANDLE = /(^|[^a-z0-9_.@])@[a-z][a-z0-9_.]{1,29}/i;
// Phone numbers: 555-1234, (555) 123-4567, +1 555.123.4567, 5551234567,
// +44 7911 123456; not a year next to a number, or a million written out
const PHONE =
  /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b|\b\d{3}[\s.-]\d{4}\b|\b\d{10,11}\b|\+\d{1,3}[\s.-]?\d{2,5}[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b|\b(?:\d[\s.-]){6,10}\d\b/;
// Words that can come before a street word in an ordinary sentence ("down
// the road", "2 cars on the busy street")
const NOT_A_STREET_NAME = new Set([
  "a", "an", "the", "on", "in", "at", "of", "to", "by", "near", "down", "up", "across",
  "along", "over", "under", "my", "our", "his", "her", "their", "your", "and", "or",
  "big", "small", "long", "old", "new", "dirt", "busy", "icy", "snowy", "wet", "dark",
  "quiet", "empty", "this", "that", "same", "whole", "next", "other", "every",
]);
// A street: a name and a street word ("Elm Street", "elm street", "Oak St.",
// "42 Maple Rd"). Spelled out in any case; short forms ("St", "Rd") only
// capitalized, and never "way" or "drive" ("2 dogs were way too excited",
// "2 cars drive by").
const STREET =
  /\b([a-z]{2,20})\s+(street|avenue|road|lane|boulevard|court|circle)\b|\b([A-Z][a-z]{1,20})\s+(St|Ave|Rd|Ln|Blvd|Ct|Dr)\b\.?/gi;
const SHORT_STREET = /^(St|Ave|Rd|Ln|Blvd|Ct|Dr)$/;

const hasAddress = (text: string) => {
  for (const match of text.matchAll(STREET)) {
    const name = match[1] ?? match[3];
    const street = match[2] ?? match[4];
    // A short form must be written with a capital, as streets are
    if (match[4] !== undefined && !SHORT_STREET.test(street)) continue;
    // "Road", "Lane", "Court" and "Circle" need a capitalized name ("Oak
    // Road"): "a bumpy road", "rocky road ice cream" aren't addresses.
    // "street" and "avenue" are held either way ("elm street").
    if (/^(road|lane|court|circle)$/i.test(street) && !/^[A-Z]/.test(name)) continue;
    if (!NOT_A_STREET_NAME.has(name.toLowerCase())) return true;
  }
  return false;
};

// "Lincoln Elementary", "lincoln elementary", "Oak Primary", "Maple Middle
// School", "Westside High"
const SCHOOL =
  /\b[a-z]{2,20}\s+(elementary|primary|academy)\b|\b[A-Z][a-z]{1,20}\s+(Middle|High)( School)?\b/i;
const NOT_A_SCHOOL_NAME = /\b(the|my|our|an?|in|at|to|from|of)\s+(elementary|primary|academy)\b/i;
const hasSchool = (text: string) => {
  const match = text.match(SCHOOL);
  if (!match) return false;
  // "my elementary school", "the academy": no name
  if (NOT_A_SCHOOL_NAME.test(match[0])) return false;
  // "Middle"/"High" need a capital ("a high wall" isn't a school)
  if (match[2] !== undefined && !/^(Middle|High)/.test(match[2])) return false;
  return true;
};

// A common first name followed by a surname-looking word: "Emma Johnson",
// "EMMA JOHNSON", "Olivia James". Not "Max Barked" (a word ending in -ed or
// -ing is something Max did).
const hasFullName = (text: string) => {
  // Shouting in capitals is read as ordinary capitals ("EMMA" is "Emma")
  const titled = text.replace(/\b[A-Z]{2,}\b/g, (word) => word[0] + word.slice(1).toLowerCase());
  for (const match of titled.matchAll(/\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,30})\b/g)) {
    if (FIRST.has(match[1].toLowerCase()) && !/(ed|ing)$/.test(match[2])) return true;
  }
  return false;
};

// Made-up people and places, taken out before the checks above
const PRETEND = new RegExp(`\\b(${PRETEND_NAMES.join("|")})\\b`, "gi");

export const hasPersonalDetails = (text: string) => {
  const visible = text.replace(INVISIBLE, "").replace(PRETEND, " ");
  return (
    EMAIL.test(visible) ||
    hasLink(visible) ||
    HANDLE.test(visible) ||
    PHONE.test(visible) ||
    hasAddress(visible) ||
    hasSchool(visible) ||
    hasFullName(visible) ||
    libraryFindsFullName(visible) ||
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

// The sentence repeats its Tell instead of showing it: it adds no word of
// its own beyond the Tell's, small words aside ("It is cold outside.", "it
// is very cold outside", "It is really cold outside today." for "It is cold
// outside.": "very", "really", "outside" and "today" are small words here).
// One word of the child's own and it isn't a copy, however much of the Tell
// it repeats ("Like a ninja, he dodged all the traps with ease.", "The
// party was fun, so lonely."): a sentence wrongly sent back here never
// reaches anyone who could read it, so anything else is for the AI or a
// person to judge.
const copiesTell = (tell: string, show: string) => {
  const meaningful = (text: string) => read(text).words.filter((word) => !STOP.has(word));
  // The Tell's instructions in brackets aren't part of it ("(Use a Simile)")
  const tellWords = new Set(meaningful(tell.replace(/\([^)]*\)/g, " ")));
  const showWords = meaningful(show);
  if (tellWords.size === 0 || showWords.length === 0) return false;
  return showWords.every((word) => tellWords.has(word));
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

  // The one plain case decided here: a sentence that copies its Tell. Too
  // short, or not painting a picture, is for the AI or a person to judge:
  // a word list can miss a worrying sentence, so the rules never send one
  // back on their own just for being short ("Dad hit me.")
  if (copiesTell(tell, show)) return { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] };
  return { outcome: "pass" };
};
