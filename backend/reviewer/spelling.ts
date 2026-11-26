// Spelling: the words in a Show sentence that aren't in the English
// dictionary, so a sentence with mistakes isn't approved into the gallery.
//
// Uses nspell with the en-US and en-GB Hunspell dictionaries (dictionary-en
// and dictionary-en-gb), all by the same author, pinned exactly, with no
// network access: the check runs here on the server. A word is spelled
// right if either dictionary has it, so children in British, Australian,
// Canadian or New Zealand schools aren't told "colour", "favourite",
// "organise" or "travelled" is a mistake. Like the libraries in
// libraries.ts, it never sends a sentence back on its own (reviewer.ts): it
// only stops an approval, after the safety checks, so a misspelled worrying
// sentence still reaches a person.
import nspell from "nspell";
import dictionary from "dictionary-en";
import britishDictionary from "dictionary-en-gb";
import { SOUND_WORDS } from "./soundWords.js";
import { FIRST_NAMES, PRETEND_NAMES } from "./words.js";

// Each loaded on first use (about a tenth of a second each), then kept
let checker: ReturnType<typeof nspell> | undefined;
const spell = () => (checker ??= nspell(Buffer.from(dictionary.aff), Buffer.from(dictionary.dic)));
let britishChecker: ReturnType<typeof nspell> | undefined;
const spellBritish = () =>
  (britishChecker ??= nspell(Buffer.from(britishDictionary.aff), Buffer.from(britishDictionary.dic)));

// Sound words and everyday words children write that the dictionary lacks
// (stretched ones too: "Brrrrr" and "Wheee" are read as "brr" and "whee").
// The safety rules read this short list through isSoundWord (rules.ts), so
// it's kept as it was: the longer list in soundWords.ts is only for the
// writing checks, so it can't change what the safety rules decide.
const ALLOWED = new Set([
  "ok", "okay", "brr", "shh", "hmm", "zz", "ugh", "ahh", "ooh", "aww", "eww", "yay", "wow",
  "whoa", "oof", "phew", "yum", "yummy", "boom", "zoom", "whee", "yippee", "achoo", "grr",
]);
const sound = (word: string) => word.toLowerCase().replace(/([a-z])\1{2,}/g, "$1$1");

// Is this a sound word children write ("Brrrr", "Wheee")? (For the safety
// rules: see ALLOWED)
export const isSoundWord = (word: string) => ALLOWED.has(sound(word));

// Is this word, in lower case, an English word? Names are in the dictionary
// only with their capital ("Springfield"), so "springfield" isn't: this
// tells an ordinary word ("brown", "wow") from a name or a foreign word.
// (For the safety rules, so it reads only the US dictionary, as it always
// has: the British one mustn't change which words they treat as names.)
export const inDictionaryLowerCase = (word: string) => spell().correct(word.toLowerCase());

// Every way to read a stretched word's long letters (three or more of the
// same) as two or as one: "sooooo" is "soo" or "so", "Brrrr" is "brr" or
// "br". A word with no long letters has no other readings.
const LONG_LETTERS = /([a-z])\1{2,}/g;
const unstretched = (word: string): string[] => {
  const lower = word.toLowerCase();
  const runs = [...lower.matchAll(LONG_LETTERS)];
  if (runs.length === 0) return [];
  // (Two readings per run, so a word stretched in many places is only read
  // with every run cut the same way, to keep it quick)
  if (runs.length > 4) return [lower.replace(LONG_LETTERS, "$1$1"), lower.replace(LONG_LETTERS, "$1")];
  let readings = [""];
  let after = 0;
  for (const run of runs) {
    const between = lower.slice(after, run.index);
    readings = readings.flatMap((reading) => [reading + between + run[1] + run[1], reading + between + run[1]]);
    after = run.index + run[0].length;
  }
  return readings.map((reading) => reading + lower.slice(after));
};

const isListedSound = (word: string) => SOUND_WORDS.has(word) || ALLOWED.has(word);

// Is this a sound word, as a child writes it: "Whoosh", "Kaboom",
// "Zzzz", "Ssssplash"? (For the writing checks: the repeated-word check in
// mechanics.ts lets "crunch crunch" through with it.)
export const isWrittenSound = (word: string) => {
  const lower = word.toLowerCase();
  return isListedSound(lower) || unstretched(lower).some(isListedSound);
};

// In either dictionary, as written or in lower case (the first word of a
// sentence has a capital)
const inEitherDictionary = (word: string) =>
  [word, word.toLowerCase()].some((form) => spell().correct(form) || spellBritish().correct(form));

// A sound word, a dictionary word, or one of those stretched ("sooooo" is
// "so", "nooooo" is "no"). A made-up word that only looks stretched
// ("blorrrp") is still a mistake: neither "blorrp" nor "blorp" is a word.
// Words an allusion names that the dictionaries lack ("kryptonite",
// "Hogwarts"), in lower case: right with or without a capital. Only for the
// writing checks, like soundWords.ts: the safety rules never read it.
// Extend freely.
export const STORY_WORDS = new Set([
  "kryptonite", "hogwarts", "muggle", "muggles", "quidditch", "narnia", "excalibur", "gotham",
  "batmobile", "jedi", "jedis", "lightsaber", "lightsabers", "wookiee", "pokemon", "pokeball",
  "minecraft", "fortnite", "hercules", "achilles", "rapunzel", "cinderella", "pinocchio",
  "superman", "batman", "spiderman", "wakanda", "asgard", "mjolnir", "hulk", "elsa", "moana",
  "simba", "hakuna", "matata", "oompa", "loompa", "loompas", "wonka", "hobbit", "hobbits",
]);

const isSpelledRight = (word: string) =>
  isWrittenSound(word) ||
  STORY_WORDS.has(word.toLowerCase().replace(/'s$/, "")) ||
  inEitherDictionary(word) ||
  unstretched(word).some(inEitherDictionary);

// Two halves of a sound that echo each other, with a hyphen:
// "pitter-patter", "tick-tock", "splish-splash" (the same letters with
// other vowels) or "hurly-burly", "helter-skelter" (the same rhyme). Each
// half needn't be a word ("tock", "splish") but one must be, so two
// misspellings that happen to echo aren't let through.
const VOWELS = /[aeiouy]+/g;
const isSoundPair = (pair: string) => {
  const halves = pair.toLowerCase().split("-");
  if (halves.length !== 2 || halves.some((half) => half.length < 2)) return false;
  const [first, second] = halves;
  const sameLetters = first.replace(VOWELS, "*") === second.replace(VOWELS, "*");
  const rhyme = first.replace(/^[^aeiouy]+/, "") === second.replace(/^[^aeiouy]+/, "");
  return (sameLetters || rhyme) && halves.some(isSpelledRight);
};

// First names and story characters kids write about ("Zoe", "Olaf"), for
// the first word of a sentence: later words with a capital are names
// anyway (below), but the first word always has one, so a name there was
// read as a misspelled word
const NAMES = new Set([...FIRST_NAMES, ...PRETEND_NAMES.filter((name) => !name.includes(" "))]);
const isNameWithCapital = (word: string) => /^[A-Z]/.test(word) && NAMES.has(word.toLowerCase().replace(/'s$/, ""));
// The misspelled words, each once, as written. Words written with a capital
// after the first word are names ("Lily", "Minecraft") and aren't checked;
// nor are words with digits or symbols in them.
export const misspelledWords = (text: string): string[] => {
  // Where the echoing sound pairs are, so their halves aren't checked
  const inPairs = new Set<number>();
  for (const pair of text.matchAll(/(?<![A-Za-z'’-])[A-Za-z]+-[A-Za-z]+(?![A-Za-z'’-])/g)) {
    if (isSoundPair(pair[0])) for (let at = pair.index; at < pair.index + pair[0].length; at++) inPairs.add(at);
  }
  const words = [...text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
  const found = new Set<string>();
  words.forEach((match, index) => {
    const word = match[0];
    const plain = word.replace(/’/g, "'");
    if (index > 0 && /^[A-Z]/.test(plain)) return;
    if (isNameWithCapital(plain)) return;
    if (inPairs.has(match.index)) return;
    if (isSpelledRight(plain)) return;
    found.add(word);
  });
  return [...found];
};
