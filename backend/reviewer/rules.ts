// The rule checks: the reviewer's first layer, plain code with no AI in it.
// They run on every sentence before anything else, so they can't be talked
// out of their rules by what a sentence says, and they decide two things:
//
// 1. What must never leave our systems or reach the gallery unread: bad
//    language, signs a child may be in trouble, words a person should read
//    first, unkind words about someone, personal details, and sentences
//    mostly not in English. These are held for a person ("hold"), and no
//    AI, not even the safety check, ever sees them. Held is the safe side:
//    when in doubt, hold. They read each sentence several ways ("k y s",
//    "d-i-e", "🔫", "wanna", "myslef"), since these checks are the only ones
//    sure to run before anything leaves our systems.
// 2. The one plain case an AI isn't needed for: a sentence that copies its
//    Tell ("redo", with the "own words" tip). Only after every safety
//    check, the AI safety check included (reviewer.ts). Nothing else is
//    sent back by the rules: a word list can miss a
//    worrying sentence, and a missed one must reach the AI or a person,
//    never be bounced back to the child.
//
// Anything else passes on to the next layer ("pass"). Whether a sentence
// paints a picture is for the AI or a person to judge, not a word list.
import { MAX_CHARACTERS, type Reason } from "./contract.js";
import { libraryFindsFullName, libraryFindsUnsafe } from "./libraries.js";
import { inDictionaryLowerCase, isSoundWord } from "./spelling.js";
import type { TipId } from "./tips.js";
import {
  BODY_OR_BLAME_WORDS,
  FIRST_NAMES,
  FOREIGN_SENSITIVE,
  FOREIGN_UNSAFE,
  FOREIGN_WORRYING,
  PERSONAL_PHRASES,
  PRETEND_NAMES,
  SENSITIVE_PHRASES,
  SENSITIVE_WORDS,
  UNKIND_PHRASES,
  UNKIND_WORDS,
  UNSAFE_INSIDE,
  UNSAFE_WORDS,
  US_STATE_CODES,
  US_STATES,
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

// Emoji that stand for a word a person should read: read as that word ("I
// want to 🔫 myself" is "I want to gun myself")
const EMOJI_WORDS: Record<string, string> = {
  "🔫": "gun", "🔪": "knife", "🗡": "knife", "⚔": "knife", "💀": "dead", "☠": "dead",
  "⚰": "dead", "🪦": "dead", "💊": "pills", "💉": "needle", "🩸": "blood", "🪢": "rope",
  "💣": "bomb", "🧨": "bomb", "🖕": "fuck", "🍺": "beer", "🍻": "beer", "🍷": "wine",
  "🥃": "whiskey", "🚬": "cigarette",
};
const EMOJI = new RegExp(Object.keys(EMOJI_WORDS).join("|"), "gu");

// The text as plain lower-case letters: accents, invisible characters and
// other alphabets' look-alikes removed, curly quotes made straight, and the
// emoji above read as words
const plain = (text: string) =>
  text
    .replace(INVISIBLE, "")
    .replace(EMOJI, (emoji) => ` ${EMOJI_WORDS[emoji]} `)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/ß/g, "ss")
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

// ---- The plain reading -----------------------------------------------------
// The worrying, sensitive and unkind checks read the sentence once more, the
// way a child might have meant it, so one spelling of each phrase is enough:
//   - symbols inside a word read as letters, or left out ("k1ll", "d-i-e")
//   - single letters spelled out joined up ("k y s", "s u i c i d e")
//   - letters said three or more times said once ("diiie")
//   - apostrophes left out ("don't" is "dont", "mom's" is "moms")
//   - chat spellings read as words ("wanna", "gonna", "u", "ur", "2 b")
//   - one-letter slips in the words that matter most ("kil", "myslef",
//     "suicde", "ded"): explicit spellings, and for "myself" and "suicide"
//     (long words nothing else is one letter from) any one-letter slip.
//     Never "skill", "kiln", "dye" or "olive".
//   - "$" after each sentence's end mark, for phrases that end a sentence

const CHAT: Record<string, string[]> = {
  wanna: ["want", "to"], wana: ["want", "to"], wannna: ["want", "to"], gonna: ["going", "to"],
  gona: ["going", "to"], gunna: ["going", "to"], finna: ["going", "to"], gotta: ["got", "to"],
  imma: ["im", "going", "to"], ima: ["im", "going", "to"], u: ["you"], ur: ["your"],
  r: ["are"], b: ["be"], "2": ["to"], "4": ["for"], cuz: ["because"], coz: ["because"],
  mum: ["mom"], mums: ["moms"], mummy: ["mommy"], neighbour: ["neighbor"],
  neighbours: ["neighbors"], grandad: ["grandpa"], granddad: ["grandpa"], nan: ["grandma"],
  nana: ["grandma"], granny: ["grandma"], selfharm: ["self", "harm"], pic: ["picture"],
};
const SPELLINGS: Record<string, string> = {
  kil: "kill", kll: "kill", kiil: "kill", kiill: "kill", kiled: "killed", kiling: "killing",
  ded: "dead", dedd: "dead", deadd: "dead", daed: "dead", aliv: "alive", allive: "alive",
  alivee: "alive", alve: "alive", alivr: "alive", diee: "die", sewerslide: "suicide",
  sooicide: "suicide", suiside: "suicide", sucide: "suicide",
};

// One letter added, left out, changed, or two swapped ("myslef")
const oneSlipFrom = (word: string, target: string) => {
  if (word === target || Math.abs(word.length - target.length) > 1) return word === target;
  let i = 0;
  while (i < word.length && word[i] === target[i]) i++;
  const rest = (a: number, b: number) => word.slice(a) === target.slice(b);
  return (
    rest(i + 1, i + 1) || // changed
    rest(i + 1, i) || // added
    rest(i, i + 1) || // left out
    (word[i] === target[i + 1] && word[i + 1] === target[i] && rest(i + 2, i + 2)) // swapped
  );
};

const canonicalWord = (word: string): string[] => {
  if (CHAT[word]) return CHAT[word];
  if (SPELLINGS[word]) return [SPELLINGS[word]];
  if (word.length >= 5 && oneSlipFrom(word, "myself")) return ["myself"];
  if (word.length >= 6 && word !== "suicidal" && (oneSlipFrom(word, "suicide") || word.startsWith("suicid"))) {
    return ["suicide"];
  }
  return [word];
};

// The plain reading of a text, as a list of words (see above)
const plainWords = (text: string, { ends = true } = {}): string[] => {
  const tokens = plain(text).split(/[\s/,;:()"]+|\.{2,}|…/).filter(Boolean);
  const out: string[] = [];
  let run = "";
  const flush = () => {
    // Three or more single letters are a word spelled out; two only when
    // neither is a word on its own ("i", "a", "u", ...)
    if (run.length >= 3 || (run.length === 2 && !/[iaubrycox]/.test(run))) out.push(...canonicalWord(run));
    else for (const letter of run) out.push(...canonicalWord(letter));
    run = "";
  };
  for (const token of tokens) {
    // (A "$" at the end can be a letter: "ky$")
    const core = token.replace(/^[^a-z0-9@$]+|[^a-z0-9$]+$/g, "");
    const ended = ends && /[.!?]$/.test(token);
    let word: string;
    if (/^\d+$/.test(core)) word = core;
    else {
      word = core
        .replace(/[0134578@$!|]/g, (c) => SYMBOL_LOOKALIKES[c] ?? c)
        .replace(/[^a-z]/g, "")
        .replace(/([a-z])\1{2,}/g, "$1");
    }
    if (word.length === 1 && /[a-z]/.test(word)) run += word;
    else {
      flush();
      if (word) out.push(...canonicalWord(word));
    }
    if (ended) {
      flush();
      out.push("$");
    }
  }
  flush();
  if (ends && out[out.length - 1] !== "$") out.push("$");
  // "my self", "your self": one word
  const joined: string[] = [];
  for (const word of out) {
    const last = joined[joined.length - 1];
    if (word === "self" && (last === "my" || last === "your" || last === "him" || last === "her")) {
      joined[joined.length - 1] = `${last}self`;
    } else joined.push(word);
  }
  return joined;
};

// A list of phrases, read the plain way too ("don't tell anyone" is "dont
// tell anyone")
const plainPhrases = (phrases: string[]) =>
  phrases.map((phrase) => phrase.split(" ").flatMap((part) => (part === "$" ? ["$"] : plainWords(part, { ends: false }))));

const hasParts = (words: string[], parts: string[]) => {
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j] === part)) return true;
  }
  return false;
};

// ---- Safety ----------------------------------------------------------------

const UNSAFE = new Set([...UNSAFE_WORDS, ...FOREIGN_UNSAFE]);
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

// People who might hurt a child, or be hurt (plain spellings: "mum" is
// "mom", "neighbour" is "neighbor")
const PEOPLE = new Set([
  "dad", "daddy", "mom", "mommy", "mother", "father", "stepdad", "stepmom", "stepfather",
  "stepmother", "stepbrother", "stepsister", "brother", "sister", "uncle", "aunt", "auntie",
  "grandpa", "grandma", "grandfather", "grandmother", "teacher", "coach", "he", "she", "they",
  "someone", "somebody", "man", "men", "guy", "lady", "woman", "boy", "boys", "girl", "girls",
  "kids", "kid", "parents", "babysitter", "cousin", "neighbor", "boyfriend", "girlfriend",
  "stranger", "friend", "friends", "teenager", "bully", "bullies",
]);
// Someone close to the child, who can be hurt too ("Dad hits my sister")
const FAMILY = new Set([
  // (Not "sisters" or "brothers": with apostrophes left out, "I kicked my
  // brother's ball" would read as one)
  "mom", "mommy", "mother", "dad", "daddy", "father", "sister", "brother", "baby", "grandma", "grandpa", "cousin", "friend", "stepbrother", "stepsister",
  "stepmom", "stepdad", "family", "aunt", "uncle",
]);
const BEFORE_FAMILY = new Set(["little", "big", "baby", "older", "younger", "twin", "best", "new"]);
const OWNERS = new Set(["my", "his", "her", "our", "their", "your", "the"]);
const DONE_TO = new Set([
  "hit", "hits", "hitting", "hitted", "beat", "beats", "beating", "beated", "beaten", "kick",
  "kicks", "kicked", "punch", "punches", "punched", "slap", "slaps", "slapped", "smack",
  "smacks", "smacked", "spank", "spanks", "spanked", "touch", "touches", "touched", "hurt",
  "hurts", "choke", "chokes", "choked", "strangle", "strangles", "strangled", "grabbed",
  "yells", "yelled", "screams", "screamed", "whip", "whips", "whipped",
  "burn", "burns", "burned", "burnt", "lock", "locks", "locked", "starve", "starves", "starved",
  "molest", "molests", "molested", "abuse", "abuses", "abused",
]);
// Throwing or pushing a child is held only when it hurts: "Dad threw me
// against the wall", "they pushed me down the stairs", not "Dad threw me
// the ball" or "my sister pushed me on the swing"
const THROWN = new Set(["threw", "throws", "throw", "pushed", "pushes", "push", "shoved", "shoves", "shove"]);
const THROWN_WHERE = new Set(["against", "down", "across", "onto", "into", "off", "over", "out"]);

// Someone doing something to the child, or to someone close to them: "Dad
// hit me", "they beat me up", "my uncle touched me", "Dad hits my sister",
// "Dad threw me against the wall". Only with a person doing it, up to four
// words before: "the cold wind hits me like a wall" is a Show sentence.
const someoneHurts = (words: string[]) => {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const before = words.slice(Math.max(0, i - 4), i);
    const thrown = THROWN.has(word) && words[i + 1] === "me" && THROWN_WHERE.has(words[i + 2]);
    if (!DONE_TO.has(word) && !thrown) continue;
    if ((words[i + 1] === "me" || words[i + 1] === "us") && before.some((w) => PEOPLE.has(w))) return true;
    // Someone close to them: "my sister", "my little brother"
    if (OWNERS.has(words[i + 1]) && words[i + 1] !== "the") {
      const next = BEFORE_FAMILY.has(words[i + 2]) ? words[i + 3] : words[i + 2];
      if (FAMILY.has(next) && before.some((w) => PEOPLE.has(w) || w === "i" || w === "we")) return true;
    }
  }
  return false;
};

// The child as the one it was done to: "I was beaten by my dad", "I was
// molested", "I got hit by my mom". The worst are held however they're
// said; the rest only by a person ("I got hit by a ball" is fine).
const DONE_TO_ALWAYS = new Set([
  "beaten", "molested", "raped", "abused", "whipped", "choked", "strangled", "starved",
  "spanked",
]);
const DONE_TO_BY = new Set([
  "hit", "kicked", "punched", "slapped", "smacked", "pushed", "shoved", "touched", "burned",
  "burnt", "hurt", "grabbed", "attacked", "bitten", "thrown", "locked", "hitted", "beated", "beat",
]);
const BEING = new Set(["was", "got", "get", "gets", "been", "being", "am", "im", "were", "keep", "getting"]);
const iWasHurt = (words: string[]) => {
  for (let i = 1; i < words.length; i++) {
    if (!BEING.has(words[i - 1])) continue;
    const who = words.slice(Math.max(0, i - 4), i);
    if (!who.some((w) => w === "i" || w === "im" || w === "we")) continue;
    if (DONE_TO_ALWAYS.has(words[i])) return true;
    if (DONE_TO_BY.has(words[i])) {
      const by = words.indexOf("by", i);
      if (by > i && by <= i + 2 && words.slice(by + 1, by + 4).some((w) => PEOPLE.has(w))) return true;
    }
  }
  return false;
};

// Hurting themselves: "kill myself", "gun myself" (🔫), "cut my arm"
const TO_MYSELF = new Set([
  "kill", "killing", "hurt", "hurting", "cut", "cutting", "stab", "stabbing", "shoot",
  "shooting", "gun", "hang", "hanging", "harm", "harming", "burn", "burning", "starve",
  "starving", "choke", "choking", "drown", "drowning", "poison", "unalive", "knife", "end",
  "punch", "punching", "hit", "hitting", "slap",
]);
// (Not "leg" or "hand": "I cut my leg on a rock" is usually a fall)
const CUTTING = new Set(["cut", "cuts", "cutting", "slice", "sliced", "slit", "slitting"]);
const SKIN = new Set(["arm", "arms", "wrist", "wrists", "thigh", "thighs", "skin"]);
const hurtsThemselves = (words: string[]) =>
  words.some(
    (word, i) =>
      (TO_MYSELF.has(word) && words[i + 1] === "myself") ||
      (CUTTING.has(word) && words[i + 1] === "my" && SKIN.has(words[i + 2]))
  );

// Hurting someone else. Killing, shooting, stabbing or poisoning a person is
// held however it's said ("I shot him", "I want to kill my teacher"); "I
// killed it in the game" isn't a person. Hitting, punching or beating only
// when they mean to ("I'm going to beat him up", "I want to hurt him").
const KILL = new Set([
  "kill", "kills", "killed", "killing", "murder", "murders", "murdered", "murdering", "stab",
  "stabs", "stabbed", "shoot", "shoots", "shot", "poison", "poisoned", "strangle", "strangled",
]);
const HARM = new Set(["hurt", "punch", "beat", "kick", "slap", "hit", "attack", "fight", "choke", "smash"]);
const MEAN_TO = new Set([
  "want", "going", "will", "ill", "gonna", "should", "got", "lets", "plan", "planning", "try",
  "wish", "would", "could", "gotta",
]);
const SOMEONE = new Set([
  "him", "her", "them", "you", "everyone", "everybody", "someone", "somebody", "people",
  "yourself", "himself", "herself", "themselves",
]);
const hurtsSomeone = (words: string[]) => {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!KILL.has(word) && !HARM.has(word)) continue;
    const next = words[i + 1];
    const person =
      SOMEONE.has(next) ||
      FIRST.has(next) ||
      (OWNERS.has(next) &&
        [words[i + 2], words[i + 3]].some((w) => w !== undefined && (PEOPLE.has(w) || FAMILY.has(w))));
    if (!person) continue;
    if (KILL.has(word)) return true;
    if (words.slice(Math.max(0, i - 4), i).some((w) => MEAN_TO.has(w))) return true;
  }
  return false;
};

// An older boyfriend or girlfriend: "I got a boyfriend who is 19"
const OLDER_PARTNER = /\b(boyfriend|girlfriend|bf|gf)\b[^.!?]{0,30}?\b(1[6-9]|[2-9]\d)\b/;

const WORRYING_PLAIN = plainPhrases(WORRYING_PHRASES);
const FOREIGN_WORRY = new Set(FOREIGN_WORRYING);

export const isWorrying = (text: string) => {
  const reading = read(text);
  const words = plainWords(text);
  return (
    anyPhrase(reading, WORRYING_PHRASES) ||
    WORRYING_PLAIN.some((parts) => hasParts(words, parts)) ||
    someoneHurts(words) ||
    iWasHurt(words) ||
    hurtsThemselves(words) ||
    hurtsSomeone(words) ||
    words.some((word) => FOREIGN_WORRY.has(word)) ||
    OLDER_PARTNER.test(plain(text))
  );
};

// Sensitive words held only with a person near them, read the plain way:
//   - "die" after "to", "could", "will" ... with "I", "you" or "we" just
//     before ("I wish I could die", "I want 2 die"): not "we watched Die
//     Hard" or "the batteries will die"
//   - "dying" after "I'm" or "am", but not "dying of cold", "dying to see"
//   - "gun" with "I", "my", "we" or "bring" just before: not "the hunter
//     had a gun"
//   - "lonely" after "I'm", "feel", "so" ... with "I" just before: not "the
//     lonely tree"
//   - "beer", but not "root beer" or "ginger beer"
//   - "naked" with a person just before or after: "I saw my sister naked",
//     not "the naked trees"
//   - touching someone's chest, bottom or privates
const BEFORE_DIE = new Set(["to", "could", "should", "will", "would", "might", "may", "just", "ill", "i", "you", "gonna"]);
const ME = new Set(["i", "im", "me", "you", "we", "myself"]);
const BEFORE_LONELY = new Set(["im", "am", "feel", "feels", "felt", "feeling", "so", "very", "really", "always", "get", "gets", "got", "was", "too"]);
const GUN = new Set(["gun", "guns", "rifle", "pistol", "revolver"]);
const NEAR_GUN = new Set(["i", "im", "my", "we", "our", "bring", "brought", "ill"]);
const NEAR_NAKED = new Set([...PEOPLE, "i", "im", "me", "my", "him", "her", "them", "you", "we", "us", "his"]);
const TOUCHING = new Set(["touch", "touched", "touches", "touching", "grab", "grabbed", "grabs", "rub", "rubbed"]);
const WHOSE = new Set(["my", "his", "her", "your", "their"]);
const PRIVATE = new Set(["chest", "butt", "bum", "bottom", "breasts", "boobs", "crotch", "thigh", "privates", "private"]);
const sensitiveNearAPerson = (words: string[]) =>
  words.some((word, i) => {
    const before = words.slice(Math.max(0, i - 4), i);
    const prev = words[i - 1];
    if (word === "die") return BEFORE_DIE.has(prev) && before.some((w) => ME.has(w));
    if (word === "dying") return (prev === "im" || prev === "am") && !["of", "to", "for", "from", "laughing"].includes(words[i + 1]);
    if (GUN.has(word)) return words.slice(Math.max(0, i - 3), i).some((w) => NEAR_GUN.has(w));
    if (word === "lonely") return BEFORE_LONELY.has(prev) && before.some((w) => w === "i" || w === "im" || w === "me");
    if (word === "beer" || word === "beers") return prev !== "root" && prev !== "ginger";
    if (word === "naked") return [...words.slice(Math.max(0, i - 3), i), ...words.slice(i + 1, i + 4)].some((w) => NEAR_NAKED.has(w));
    if (TOUCHING.has(word)) return WHOSE.has(words[i + 1]) && PRIVATE.has(words[i + 2]);
    return false;
  });

const SENSITIVE = new Set([...SENSITIVE_WORDS, ...FOREIGN_SENSITIVE]);
const SENSITIVE_PLAIN = plainPhrases(SENSITIVE_PHRASES);

export const isSensitive = (text: string) => {
  const { words: written, swapped } = read(text);
  const words = plainWords(text);
  return (
    [...written, ...swapped, ...words].some((word) => SENSITIVE.has(word)) ||
    SENSITIVE_PLAIN.some((parts) => hasParts(words, parts)) ||
    sensitiveNearAPerson(words)
  );
};

// ---- Unkind, and naming someone ----------------------------------------------

// Words that link a person to what's said about them ("Liam is so fat")
const LINKS = new Set(["is", "are", "was", "were", "so", "such", "looks", "look", "looked", "be", "being", "really", "very", "always"]);
const UNKIND_WORD = new Set(UNKIND_WORDS);
const BODY_OR_BLAME = new Set(BODY_OR_BLAME_WORDS);
// Who an unkind word can be about, besides a name
const SUBJECTS = new Set(["he", "she", "you", "they", "your", "youre", "ur"]);
// "She smells" or "Priya's lunch stinks like garbage", but not "Grandma
// smells like cookies"
const SMELLS = new Set(["smells", "smell", "stinks", "stink", "smelled", "stunk"]);
const SMELLS_BAD = new Set(["$", "bad", "gross", "disgusting", "weird", "so", "really", "haha", "lol"]);
const BAD_SMELL = new Set(["garbage", "trash", "poop", "poo", "pee", "farts", "fart", "dumpster", "sewer", "toilet", "skunk", "feet", "rotten"]);
const smellsBad = (words: string[], i: number) =>
  SMELLS_BAD.has(words[i + 1] ?? "$") ||
  (words[i + 1] === "like" && [words[i + 2], words[i + 3]].some((w) => w !== undefined && BAD_SMELL.has(w)));

// Titles and family words written with a capital: not a classmate's name
const NOT_A_NAME = new Set([
  "i", "mr", "mrs", "ms", "miss", "dr", "coach", "aunt", "auntie", "uncle", "grandma", "grandpa",
  "mom", "mommy", "mum", "dad", "daddy", "nana", "papa", "mama", "granny", "sir", "god",
]);
// Days, months and holidays have capitals too
const CALENDAR =
  /^(mon|tues|wednes|thurs|fri|satur|sun)days?$|^(january|february|march|april|may|june|july|august|september|october|november|december|christmas|easter|halloween|thanksgiving|hanukkah|diwali|eid|ramadan)s?$/;

// Made-up people and places, taken out before the name and personal-details
// checks
const PRETEND = new RegExp(`\\b(${PRETEND_NAMES.join("|")})\\b`, "gi");

// The written words (lower case, apostrophes left out), which of them end
// in "'s", and which are names: a capital, and not a dictionary word in
// lower case ("Liam", "Priya", "Hoth"; not "Brown", "The"), or a common
// first name ("Lily"). Made-up characters are left out first.
const namesIn = (text: string) => {
  const asWritten =
    text
      .replace(PRETEND, " ")
      .replace(INVISIBLE, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’ʼ]/g, "'")
      .match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
  const isName = asWritten.map((word) => {
    const bare = word.replace(/'s$/i, "");
    if (!/^[A-Z][a-z]/.test(bare)) return false;
    const lower = bare.toLowerCase();
    if (NOT_A_NAME.has(lower) || CALENDAR.test(lower)) return false;
    return FIRST.has(lower) || !inDictionaryLowerCase(lower);
  });
  return {
    words: asWritten.map((word) => word.toLowerCase().replace(/'/g, "")),
    owned: asWritten.map((word) => /'s$/i.test(word)),
    isName,
  };
};

// Something unkind said about someone ("Liam is so fat", "you are ugly",
// "she smells"), or an unkind phrase ("loser", "nobody likes you",
// "everyone hates")
const UNKIND_PLAIN = plainPhrases(UNKIND_PHRASES);
const unkindAbout = (words: string[], isAbout: (i: number) => boolean) => {
  for (let i = 0; i < words.length; i++) {
    if (!isAbout(i)) continue;
    let linked = false;
    for (let j = i + 1; j <= i + 4 && j < words.length; j++) {
      const word = words[j];
      if (word === "$") break;
      if (SMELLS.has(word) && j <= i + 3 && smellsBad(words, j)) return true;
      if (linked && UNKIND_WORD.has(word)) return true;
      if (LINKS.has(word)) linked = true;
    }
  }
  return false;
};

export const isUnkind = (text: string) => {
  const words = plainWords(text);
  if (UNKIND_PLAIN.some((parts) => hasParts(words, parts))) return true;
  const { words: written, isName } = namesIn(text);
  // "Everyone hates Sophia" (but not "everyone hates Mondays")
  const hated = isName.some(
    (name, i) => name && written[i - 1] === "hates" && ["everyone", "everybody"].includes(written[i - 2])
  );
  return hated || unkindAbout(written, (i) => SUBJECTS.has(written[i]) || isName[i]);
};

// A classmate named next to something unkind, about their body, or blaming
// them ("Liam is so fat", "It was Liam's fault", "I blame Emma"), or named
// anywhere in a sentence that's unkind
export const namesSomeone = (text: string, unkind = isUnkind(text)) => {
  const { words, owned, isName } = namesIn(text);
  if (!isName.some(Boolean)) return false;
  if (unkind) return true;
  return isName.some((name, i) => {
    if (!name) return false;
    // "I blame Emma"
    if (words[i - 1] === "blame" || words[i - 1] === "blamed") return true;
    // Right after a name's "'s": "It was Liam's fault", "Mia's butt"
    if (owned[i] && BODY_OR_BLAME.has(words[i + 1])) return true;
    // After "is", "was", "so": "Liam is so skinny"
    let linked = false;
    for (let j = i + 1; j <= i + 4 && j < words.length; j++) {
      if (linked && (BODY_OR_BLAME.has(words[j]) || UNKIND_WORD.has(words[j]))) return true;
      if (LINKS.has(words[j])) linked = true;
    }
    return false;
  });
};

// ---- Not English -------------------------------------------------------------

// Mostly not English: at least half the words (of three or more, names
// with a capital after the first word left out) aren't in the English
// dictionary, and they aren't mostly sound words ("Brrr, zzz, achoo!").
// Held, so a sentence in another language (which the safety check and the
// word lists can't read as well) is read by a person rather than sent back
// for its spelling.
export const isNotEnglish = (text: string) => {
  const words =
    text
      .replace(INVISIBLE, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’ʼ]/g, "'")
      .match(/[A-Za-zß]+(?:'[A-Za-z]+)*/g) ?? [];
  const counted = words.filter((word, i) => i === 0 || !/^[A-Z]/.test(word));
  if (counted.length < 3) return false;
  const sounds = counted.filter((word) => isSoundWord(word)).length;
  if (sounds * 2 >= counted.length) return false;
  const foreign = counted.filter((word) => !isSoundWord(word) && !inDictionaryLowerCase(word)).length;
  return foreign * 2 >= counted.length;
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

// A street says where a child lives with a house number before it ("42
// Maple Street"), or in a sentence about where they live ("I live near Oak
// St.", "my house on elm street"). A street on its own is a place, like a
// park: "On Oak Road we saw deer", "the High Street shops".
const HOME = /\b(live|lives|living|lived|house|home|address|apartment|flat|moved)\b/i;
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
    if (NOT_A_STREET_NAME.has(name.toLowerCase())) continue;
    const numbered = /\d\s*$/.test(text.slice(0, match.index));
    if (numbered || HOME.test(text)) return true;
  }
  return false;
};

// "Lincoln Elementary", "lincoln elementary", "Oak Primary", "Maple Middle
// School", "Westside High"
const SCHOOL =
  /\b([a-z]{2,20})\s+(elementary|primary|academy)\b|\b([A-Z][a-z]{1,20})\s+(Middle|High)( School)?\b/gi;
const NOT_A_SCHOOL_NAME = new Set(["the", "my", "our", "a", "an", "in", "at", "to", "from", "of", "and"]);
const hasSchool = (text: string) => {
  for (const match of text.matchAll(SCHOOL)) {
    const name = (match[1] ?? match[3]).toLowerCase();
    // "my elementary school", "the academy": no name
    if (NOT_A_SCHOOL_NAME.has(name)) continue;
    if (match[4] !== undefined) {
      // "Middle"/"High" need a capital ("a high wall" isn't a school)
      if (!/^(Middle|High)/.test(match[4])) continue;
      // ... and no other name after them: "the Middle Ages", "High Street"
      const after = text.slice((match.index ?? 0) + match[0].length);
      if (match[5] === undefined && /^\s+[A-Z]/.test(after)) continue;
    }
    return true;
  }
  return false;
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

// More that says who or where a child is:
//   - a name with an underscore, as usernames are ("xX_Sam_Xx", "cool_sam123")
//   - "Snap: samcool", "insta: ...", "user: ..."
//   - their age ("I am 9", "9 years old"); not "I am 2 feet tall"
//   - a classroom ("room 12"), a numbered school ("PS 118"), a saint's
//     school ("St. Mary's", not "St. Patrick's Day"), a teacher's class
//     ("Mrs. Smith's class")
//   - a town and its state ("Springfield, Ohio", "Austin, TX")
//   - a UK postcode ("SW1A 1AA")
const USERNAME = /\b[a-z0-9]+_[a-z0-9_]+\b/i;
const LABELLED = /\b(snap|snapchat|insta|ig|tiktok|discord|roblox|fortnite|user|username|ign|gamertag|yt|youtube)\s*:/i;
const AGE =
  /\b\d{1,2}\s*(?:years?|yrs?)\s*old\b|\b(?:i\s+am|i'?m|i\s+turned|i\s+will\s+be|i'?ll\s+be)\s+(?:only\s+|now\s+|almost\s+|nearly\s+|turning\s+)?\d{1,2}(?!\d|[.,:]\d)(?:\s*(?:years?|yrs?))?(?!\s*(?:degrees|minutes|mins|hours|feet|foot|ft|inches|cm|meters|metres|m\b|km|miles|pounds|lbs|kg|%|percent|points|o'clock|am\b|pm\b|times|steps|seconds|secs|laps|in\b|on\b|th\b|st\b|nd\b|rd\b))/i;
const ROOM = /\broom\s*#?\s*\d{1,4}[a-z]?\b/i;
const NUMBERED_SCHOOL = /\bP\.?S\.?\s+\d{1,4}\b/;
const SAINT = /\bSt\.?\s+[A-Z][a-z]+(?:'s|s')(?!\s+(?:Day|day|Eve|eve))/;
const TEACHERS_CLASS = /\b(?:mrs|mr|ms|miss|mx|dr)\.?\s+[a-z]+(?:'s|s')\s+(?:class|classroom|room|grade|homeroom)\b/i;
const title = (state: string) => state.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const TOWN_AND_STATE = new RegExp(
  `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?),\\s*(?:(${US_STATES.map(title).join("|")})|(${US_STATE_CODES.join("|")}))\\b`,
  "g"
);
const hasTownAndState = (text: string) => {
  // Only where they live or come from, like a street: "I visited Orlando,
  // Florida" is a trip
  if (!HOME.test(text) && !/\bfrom\b/i.test(text)) return false;
  for (const match of text.matchAll(TOWN_AND_STATE)) {
    const town = match[1].split(/\s+/);
    // A town is a name, not an everyday word: "Wow, OK" isn't Oklahoma
    if (town.length > 1 || !inDictionaryLowerCase(town[0])) return true;
  }
  return false;
};
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;

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
    USERNAME.test(visible) ||
    LABELLED.test(visible) ||
    AGE.test(visible.replace(/[‘’ʼ]/g, "'")) ||
    ROOM.test(visible) ||
    NUMBERED_SCHOOL.test(visible) ||
    SAINT.test(visible.replace(/[‘’ʼ]/g, "'")) ||
    TEACHERS_CLASS.test(visible.replace(/[‘’ʼ]/g, "'")) ||
    hasTownAndState(visible) ||
    POSTCODE.test(visible) ||
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
  const unkind = isUnkind(show);
  if (unkind) reasons.push("unkind");
  if (namesSomeone(show, unkind)) reasons.push("names-someone");
  // A sentence mostly not in English: a person reads it, rather than the
  // spelling check sending it back word by word
  if (isNotEnglish(show)) reasons.push("not-english");
  if (reasons.length > 0) return { outcome: "hold", reasons };

  // The one plain case decided here: a sentence that copies its Tell. Too
  // short, or not painting a picture, is for the AI or a person to judge:
  // a word list can miss a worrying sentence, so the rules never send one
  // back on their own just for being short ("Dad hit me.")
  if (copiesTell(tell, show)) return { outcome: "redo", tip: "ownWords", reasons: ["copies-tell"] };
  return { outcome: "pass" };
};
