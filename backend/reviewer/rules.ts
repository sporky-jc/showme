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
  // Slips in the words a child might use to tell what was done to them
  beet: "beat", beatn: "beaten", beeten: "beaten", tuch: "touch", tuched: "touched",
  touchd: "touched", tuchd: "touched", tuches: "touches", tuchs: "touches", privit: "private",
  privat: "private", privits: "privates", privats: "privates", uncel: "uncle", unkle: "uncle",
  dy: "die", shuld: "should", wan: "want", worthles: "worthless", wurthless: "worthless",
  // ... and the people they might name ("dady", "mumy"), so every check
  // that looks for a person finds them however they're spelled
  dady: "daddy", dadi: "daddy", daddi: "daddy", dadd: "dad", momy: "mommy", mumy: "mommy",
  mommie: "mommy", mumm: "mom", mama: "mom", mamma: "mom", papa: "dad", pappa: "dad",
  grownup: "adult", grownups: "adults", stepdaddy: "stepdad", stepmum: "stepmom",
  stepmummy: "stepmom", neighbour: "neighbor", neighbours: "neighbors", babysiter: "babysitter",
  techer: "teacher", teecher: "teacher", cuting: "cutting", cuttin: "cutting", cutt: "cut",
  havent: "havent", hungrey: "hungry", alowed: "allowed",
};

// Two words that are one person ("step dad", "grand pa", "grown up", "the
// man next door"), joined in the plain reading
const TWO_WORD_PEOPLE: [string[], string][] = [
  [["step", "dad"], "stepdad"], [["step", "mom"], "stepmom"], [["step", "father"], "stepfather"],
  [["step", "mother"], "stepmother"], [["step", "brother"], "stepbrother"], [["step", "sister"], "stepsister"],
  [["grand", "pa"], "grandpa"], [["grand", "ma"], "grandma"], [["grown", "up"], "adult"],
  [["grown", "ups"], "adults"], [["man", "next", "door"], "neighbor"], [["lady", "next", "door"], "neighbor"],
  [["baby", "sitter"], "babysitter"],
];
// Person words whose "'s" is kept apart in the plain reading ("mom's
// pills" is "mom 's pills"), so "my brother's ball" is never "my brothers"
const OWNED_BY = /^(dad|daddy|mom|mommy|mother|father|stepdad|stepmom|brother|sister|uncle|aunt|grandpa|grandma|cousin|friend|teacher|coach|neighbor|boyfriend|girlfriend|babysitter|man|guy|lady)$/;

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
    // "mom's" is "mom 's" (see OWNED_BY)
    const owner = core.match(/^([a-z]+)'s$/)?.[1];
    const ownerWord = owner === undefined ? undefined : canonicalWord(owner)[0];
    if (ownerWord !== undefined && OWNED_BY.test(ownerWord)) word = ownerWord;
    else if (/^\d+$/.test(core)) word = core;
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
      if (ownerWord !== undefined && OWNED_BY.test(ownerWord)) out.push("'s");
    }
    if (ended) {
      flush();
      out.push("$");
    }
  }
  flush();
  if (ends && out[out.length - 1] !== "$") out.push("$");
  // "my self", "your self": one word; and two words that are one person
  const joined: string[] = [];
  for (const word of out) {
    const last = joined[joined.length - 1];
    if (word === "self" && (last === "my" || last === "your" || last === "him" || last === "her")) {
      joined[joined.length - 1] = `${last}self`;
      continue;
    }
    joined.push(word);
    for (const [parts, person] of TWO_WORD_PEOPLE) {
      const at = joined.length - parts.length;
      if (at >= 0 && parts.every((part, j) => joined[at + j] === part)) joined.splice(at, parts.length, person);
    }
  }
  // "die my hair blue" is "dye"
  return joined.map((word, i) =>
    word === "die" && DYED_OWNERS.has(joined[i + 1]) && DYED.has(joined[i + 2]) ? "dye" : word
  );
};
const DYED_OWNERS = new Set(["my", "her", "his", "your", "our", "the", "their"]);
const DYED = new Set(["hair", "shirt", "shirts", "clothes", "eggs", "fabric", "socks", "tshirt"]);

// A list of phrases, read the plain way too ("don't tell anyone" is "dont
// tell anyone"), each as a whole, so "kill my self" reads as "kill
// myself". A "$" at the end stands for the end of a sentence.
const plainPhrases = (phrases: string[]) =>
  phrases.map((phrase) => {
    const ends = phrase.endsWith(" $");
    return [...plainWords(ends ? phrase.slice(0, -2) : phrase, { ends: false }), ...(ends ? ["$"] : [])];
  });

// Phrases written as one word ("killmyself", "k i l l m y s e l f",
// "kill­yourself" with an invisible hyphen): each phrase of two or more
// words and at least 8 letters, without its spaces
const runTogether = (phrases: string[][]) =>
  new Set(phrases.filter((parts) => parts.length > 1 && !parts.includes("$")).map((parts) => parts.join("")).filter((joined) => joined.length >= 8));

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
// "mom", "neighbour" is "neighbor", "step dad" is "stepdad"). Every check
// asks isPerson or isFamily, which read plurals too ("my uncles", "the big
// kids", "my 2 brothers").
const PEOPLE = new Set([
  "dad", "daddy", "mom", "mommy", "mother", "father", "stepdad", "stepmom", "stepfather",
  "stepmother", "stepbrother", "stepsister", "brother", "sister", "uncle", "aunt", "auntie",
  "grandpa", "grandma", "grandfather", "grandmother", "teacher", "coach", "he", "she", "they",
  "someone", "somebody", "man", "guy", "lady", "woman", "boy", "girl", "kid", "parent",
  "babysitter", "cousin", "neighbor", "boyfriend", "girlfriend", "stranger", "friend",
  "teenager", "bully", "adult", "principal", "priest", "pastor", "tutor", "nanny",
]);
// Someone close to the child, who can be hurt too ("Dad hits my sister")
const FAMILY = new Set([
  "mom", "mommy", "mother", "dad", "daddy", "father", "sister", "brother", "baby", "grandma",
  "grandpa", "cousin", "friend", "stepbrother", "stepsister", "stepmom", "stepdad", "family",
  "aunt", "uncle", "parent",
]);
const IRREGULAR_PLURALS: Record<string, string> = { men: "man", women: "woman", children: "kid", people: "someone" };
const singular = (word: string | undefined) =>
  word === undefined ? undefined : IRREGULAR_PLURALS[word] ?? (word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word);
const isPerson = (word: string | undefined) =>
  word !== undefined && (PEOPLE.has(word) || PEOPLE.has(singular(word) ?? ""));
const isFamily = (word: string | undefined) =>
  word !== undefined && word !== "'s" && (FAMILY.has(word) || FAMILY.has(singular(word) ?? ""));
// Between "my" and the person: "my little brother", "my 2 brothers", "my
// three big cousins"
const BEFORE_FAMILY = new Set([
  "little", "big", "baby", "older", "younger", "twin", "best", "new", "two", "three", "four",
  "five", "both", "step", "own",
]);
const OWNERS = new Set(["my", "his", "her", "our", "their", "your", "the", "that", "this", "those", "these", "a", "some"]);
// The person a word after "my" names, if it does (skipping up to two words
// like "little" or "2"), and where
const personAfter = (words: string[], i: number) => {
  let j = i;
  while (j < i + 2 && (BEFORE_FAMILY.has(words[j]) || /^\d+$/.test(words[j] ?? ""))) j++;
  return words[j + 1] === "'s" ? undefined : words[j];
};

// The words before and after i within its own sentence, up to n of them:
// far enough for "I will bring dads gun and shoot everyone in class", never
// into another sentence
const before = (words: string[], i: number, n = 8) => {
  let start = i;
  while (start > 0 && start > i - n && words[start - 1] !== "$") start--;
  return words.slice(start, i);
};
const after = (words: string[], i: number, n = 8) => {
  let end = i + 1;
  while (end < words.length && end <= i + n && words[end] !== "$") end++;
  return words.slice(i + 1, end);
};

// What can be done to a child, as families of words
const DONE_TO = new Set([
  "hit", "hits", "hitting", "hitted", "beat", "beats", "beating", "beated", "beaten", "kick",
  "kicks", "kicking", "kicked", "punch", "punches", "punching", "punched", "slap", "slaps",
  "slapping", "slapped", "smack", "smacks", "smacked", "spank", "spanks", "spanked", "touch",
  "touches", "touching", "touched", "hurt", "hurts", "hurting", "choke", "chokes", "choking",
  "choked", "strangle", "strangles", "strangled", "grab", "grabs", "grabbed", "yells", "yelled",
  "screams", "screamed", "whip", "whips", "whipped", "burn", "burns", "burned", "burnt", "lock",
  "locks", "locked", "starve", "starves", "starved", "molest", "molests", "molested", "abuse",
  "abuses", "abused", "slam", "slams", "slammed", "bite", "bites",
  "pinch", "pinches", "pinched", "scratch", "scratches", "scratched", "squeeze", "squeezes",
]);
// Throwing or pushing a child is held only when it hurts or keeps
// happening: "Dad threw me against the wall", "they push me down every
// day", not "Dad threw me the ball" or "my sister pushed me on the swing"
// (Dragging too: "he dragged me by my arm", not "my cousin dragged me to
// the sledding hill")
const THROWN = new Set(["threw", "throws", "throw", "pushed", "pushes", "push", "shoved", "shoves", "shove", "tripped", "trips", "drag", "drags", "dragged"]);
const THROWN_WHERE = new Set(["against", "down", "across", "onto", "into", "off", "over", "out", "by", "along"]);
const AGAIN_AND_AGAIN = /\b(every day|everyday|all the time|every time|again|always|at recess)\b/;

// Not play, or an accident: "Dad hit me with a snowball", "my brother
// pushed me into the snow", "Dad grabbed me before I slipped", "Mum locked
// me out by accident". Unless it says how much it hurt: "with a belt", "so
// hard", "until I cried".
const PLAY = new Set([
  "snowball", "snowballs", "pillow", "pillows", "ball", "balloon", "balloons", "nerf", "snow",
  "pool", "leaves", "water", "accident", "accidentally", "slipped", "fell", "playing", "laughed",
  "tag", "game", "giggled", "foam", "sled", "swing", "tickled", "sorry", "played", "air",
  "caught", "hug", "hugged", "rattle",
]);
const HURTS = new Set(["belt", "stick", "fist", "hand", "shoe", "until", "every", "again", "bleed", "bled", "cried", "bruise", "bruised", "hard"]);
// (Only for the verbs children play with: "they beat me up" is never play)
const PLAYFUL = new Set([
  "hit", "hits", "hitting", "pushed", "pushes", "push", "shoved", "threw", "throws", "throw",
  "grabbed", "grab", "locked", "locks", "lock", "kicked", "kicks", "pulled", "pulls", "slammed",
  "dragged", "drags", "bite", "bites", "pinched", "scratched", "squeeze", "squeezes", "tripped",
]);
const isPlay = (words: string[], i: number) => {
  if (!PLAYFUL.has(words[i])) return false;
  const around = [...before(words, i), ...after(words, i)];
  return around.some((w) => PLAY.has(w)) && !after(words, i).some((w) => HURTS.has(w));
};

// Someone doing something to the child, or to someone close to them: "Dad
// hit me", "they beat me up", "my uncles touch me", "Dad hits my sister",
// "Dad gets drunk and hits mom", "Dad threw me against the wall", "Mom
// pulls my hair", "my stepmom puts me in the basement". Only with a person
// doing it, earlier in the sentence: "the cold wind hits me like a wall" is
// a Show sentence.
const SHUT_IN = new Set(["closet", "basement", "cupboard", "shed", "attic", "cellar", "garage", "room", "car", "box"]);
const someoneHurts = (words: string[]) => {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const back = before(words, i);
    const doer = back.some((w) => isPerson(w));
    const object = words[i + 1];
    // "pulls my hair"
    if ((word === "pulls" || word === "pulled" || word === "pull") && object === "my" && words[i + 2] === "hair") {
      if (doer && !isPlay(words, i)) return true;
      continue;
    }
    // "puts me in the closet", "makes me kneel"
    if ((word === "puts" || word === "put" || word === "locks" || word === "locked") && object === "me") {
      if (doer && after(words, i, 5).some((w) => SHUT_IN.has(w)) && !isPlay(words, i)) return true;
    }
    if ((word === "makes" || word === "made") && object === "me" && (words[i + 2] === "kneel" || words[i + 2] === "stand")) {
      if (doer) return true;
    }
    const thrown =
      THROWN.has(word) &&
      object === "me" &&
      (THROWN_WHERE.has(words[i + 2]) || AGAIN_AND_AGAIN.test(after(words, i).join(" ")));
    if (!DONE_TO.has(word) && !thrown) continue;
    if (isPlay(words, i) && !back.some((w) => w === "bully" || w === "bullies")) continue;
    if ((object === "me" || object === "us") && doer) return true;
    const iOrPerson = doer || back.some((w) => w === "i" || w === "we");
    // Someone close to them: "Dad hits mom", "my sister", "my little brother"
    if (isFamily(object) && object !== "friend" && words[i + 2] !== "'s" && iOrPerson) return true;
    if (OWNERS.has(object) && object !== "the" && object !== "a" && object !== "some") {
      const next = personAfter(words, i + 2);
      if (isFamily(next) && iOrPerson) return true;
    }
  }
  return false;
};

// Someone who isn't their parent in their room or bed, or touching them:
// "my mom's boyfriend comes in my room", "he gets in bed with me", "he comes
// in at night", "my uncle kissed me on the lips" (not "my puppy sleeps in
// my bed", "mom comes in my room to wake me", "grandpa kissed my cheek")
const NOT_A_PARENT = new Set([
  "boyfriend", "girlfriend", "uncle", "stepdad", "stepmom", "stepfather", "stepbrother",
  "stepsister", "man", "guy", "neighbor", "stranger", "teacher", "coach", "babysitter",
  "cousin", "grandpa", "he", "someone", "somebody", "adult", "tutor", "priest", "pastor",
]);
const notAParent = (word: string | undefined) => word !== undefined && (NOT_A_PARENT.has(word) || NOT_A_PARENT.has(singular(word) ?? ""));
const COMES_IN = new Set(["comes", "came", "come", "sleeps", "slept", "sleep", "gets", "got", "climbs", "climbed", "crawls", "creeps", "sneaks"]);
const inMyRoom = (words: string[]) =>
  words.some((word, i) => {
    if (!COMES_IN.has(word)) return false;
    const who = before(words, i);
    if (!who.some(notAParent)) return false;
    const next = after(words, i, 6).join(" ");
    return /^(in|into) (my )?(room|bed)|^(in|into) bed with me|^in at night|^in my room at night/.test(next);
  });
const KISSED = new Set(["kiss", "kisses", "kissed", "kissing"]);
const kissedOnTheLips = (words: string[]) =>
  words.some(
    (word, i) =>
      KISSED.has(word) &&
      words[i + 1] === "me" &&
      after(words, i).join(" ").includes("on the lips") &&
      before(words, i).some(notAParent)
  );

// Someone touching the child's private parts or under their clothes: "he
// tuched my privit", "a grown up touched me in my underwear", "he put his
// hand under my shirt"
const TOUCHED = new Set([
  "touch", "touched", "touches", "touching", "licked", "licks", "rubbed", "rubs", "grabbed",
  "grabs", "feels", "felt", "put", "puts",
]);
const MY_PRIVATE = new Set(["privates", "private", "bottom", "butt", "bum", "chest", "crotch", "pee", "willy", "underwear", "undies"]);
const UNDER_CLOTHES = /\b(in|inside|under|down|up) my (underwear|undies|pants|shirt|skirt|dress|pajamas|pyjamas|clothes|knickers)\b|\bmy (privates|private parts?|private)\b/;
const touchedMy = (words: string[]) =>
  words.some((word, i) => {
    if (!TOUCHED.has(word)) return false;
    if (!before(words, i).some((w) => isPerson(w))) return false;
    const next = after(words, i);
    if (next[0] === "my" && MY_PRIVATE.has(next[1])) return true;
    return UNDER_CLOTHES.test(next.join(" "));
  });

// Pictures of the child undressed: "he takes photos of me in the bathtub"
const PICTURES = new Set(["pic", "pics", "picture", "pictures", "photo", "photos", "selfie", "selfies", "video", "videos"]);
const UNDRESSED = new Set(["bath", "bathtub", "bathroom", "shower", "naked", "underwear", "undies", "clothes", "shirt", "towel", "bed"]);
const picturesOfMe = (words: string[]) =>
  words.some(
    (word, i) =>
      PICTURES.has(word) && words[i + 1] === "of" && words[i + 2] === "me" && after(words, i + 2).some((w) => UNDRESSED.has(w)) &&
      !after(words, i + 2).includes("new")
  );

// Money or presents for a picture: "he gave me robux to send a pic"
const GIFTS = new Set(["robux", "vbucks", "money", "candy", "gift", "gifts", "giftcard", "presents", "skins", "coins", "gems"]);
const paidForPictures = (words: string[]) =>
  words.some((word, i) => GIFTS.has(word) && [...before(words, i, 6), ...after(words, i, 6)].some((w) => PICTURES.has(w)));

// Someone met through an app or a game, with what groomers ask for or say:
// pictures, clothes, secrets, gifts, "mature", "special", meeting, or being
// much older ("my discord friend is nineteen"). Held as worrying, whatever
// personal details it also has.
const PLATFORMS = new Set([
  "snapchat", "snap", "roblox", "discord", "fortnite", "tiktok", "instagram", "insta", "online",
  "minecraft", "whatsapp", "kik", "omegle", "messenger", "chat", "app", "game",
]);
const GROOMING = new Set([
  "shirt", "clothes", "secret", "secrets", "robux", "vbucks", "gift", "gifts", "presents",
  "mature", "special", "meet", "boyfriend", "girlfriend", "older", "address", "delete", "alone",
  "kiss", "body", "selfie", "selfies", "naked",
]);
// Pictures are a sign only when asked for, or of the child: "wants a
// picture", "asked for photos", "pics of me" (not "my friend sent me a
// funny picture of a cat")
const ASKS_FOR = new Set(["asked", "asks", "ask", "wants", "want", "wanted", "begged", "keeps"]);
const asksForPictures = (sentence: string[]) =>
  sentence.some(
    (w, j) =>
      PICTURES.has(w) &&
      (sentence.slice(Math.max(0, j - 4), j).some((x) => ASKS_FOR.has(x)) ||
        (sentence[j + 1] === "of" && (sentence[j + 2] === "me" || sentence[j + 2] === "you" || sentence[j + 2] === "myself")) ||
        sentence.slice(Math.max(0, j - 3), j).join(" ").includes("send me"))
  );
const AGE_WORDS = /\b(sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|1[6-9]|[2-9]\d)\b/;
const groomedOnline = (words: string[], text: string) =>
  words.some((word, i) => {
    if (!PLATFORMS.has(word)) return false;
    // (A game or a chat is a platform only for a person in it: "a man in a
    // game", "my discord friend", not "we played a game")
    const sentence = [...before(words, i, 12), word, ...after(words, i, 12)];
    if ((word === "game" || word === "chat" || word === "app") && !sentence.some((w) => isPerson(w) && w !== "i")) return false;
    if (sentence.some((w) => GROOMING.has(w)) || asksForPictures(sentence)) return true;
    if (sentence.join(" ").includes("dont tell") || sentence.join(" ").includes("not tell")) return true;
    return AGE_WORDS.test(sentence.join(" ")) && sentence.some((w) => isPerson(w) && w !== "i") && /\b(is|he's|hes|she's|shes|age|old)\b/.test(text.toLowerCase());
  });

// The child as the one it was done to: "I was beaten by my dad", "I was
// molested", "I get hit a lot by my mom". The worst are held however they're
// said; the rest only by a person ("I got hit by a ball" is fine).
const DONE_TO_ALWAYS = new Set([
  "beaten", "molested", "raped", "abused", "whipped", "choked", "strangled", "starved",
  "spanked",
]);
const DONE_TO_BY = new Set([
  "hit", "kicked", "punched", "slapped", "smacked", "pushed", "shoved", "touched", "burned",
  "burnt", "hurt", "grabbed", "attacked", "bitten", "thrown", "locked", "hitted", "beated", "beat",
  "slammed", "dragged", "pinched", "tripped", "bullied", "picked",
]);
const BEING = new Set(["was", "got", "get", "gets", "been", "being", "am", "im", "were", "keep", "getting"]);
const iWasHurt = (words: string[]) => {
  for (let i = 1; i < words.length; i++) {
    if (!BEING.has(words[i - 1])) continue;
    if (!before(words, i, 5).some((w) => w === "i" || w === "im" || w === "we")) continue;
    if (DONE_TO_ALWAYS.has(words[i])) return true;
    if (DONE_TO_BY.has(words[i])) {
      const rest = after(words, i, 6);
      const by = rest.indexOf("by");
      if (by >= 0 && rest.slice(by + 1, by + 5).some((w) => isPerson(w))) return true;
    }
  }
  return false;
};

// Hurting themselves: "kill myself", "gun myself" (🔫), "bit myself until
// I bled", "cut my arm", "I cut my leg on purpose", "I cuting my arms"
const TO_MYSELF = new Set([
  "kill", "killing", "hurt", "hurting", "cut", "cutting", "stab", "stabbing", "shoot",
  "shooting", "gun", "hang", "hanging", "harm", "harming", "burn", "burning", "starve",
  "starving", "choke", "choking", "drown", "drowning", "poison", "unalive", "knife", "end",
  "punch", "punching", "hit", "hitting", "slap", "rope", "strangle", "suffocate", "smother",
]);
const BIT = new Set(["bit", "bite", "bites", "biting", "scratch", "scratched", "scratching", "pinch", "pinched"]);
const CUTTING = new Set(["cut", "cuts", "cutting", "slice", "sliced", "slit", "slitting", "carve", "carved"]);
const SKIN = new Set(["arm", "arms", "wrist", "wrists", "thigh", "thighs", "skin"]);
// Any body part, cut on purpose or with no accident in the sentence
const BODY_PART = new Set([
  ...SKIN, "leg", "legs", "hand", "hands", "stomach", "belly", "tummy", "body", "face", "neck",
  "ankle", "ankles", "hip", "hips", "chest", "finger", "fingers",
]);
const ACCIDENT = new Set([
  "fell", "slipped", "tripped", "accident", "accidentally", "rock", "branch", "fence", "glass",
  "paper", "nail", "sheet", "can", "knife", "scissors", "broken", "tin", "while", "when", "on",
]);
const hurtsThemselves = (words: string[]) =>
  words.some((word, i) => {
    if (TO_MYSELF.has(word) && words[i + 1] === "myself") return true;
    if (BIT.has(word) && words[i + 1] === "myself" && after(words, i).some((w) => /^(bleed|bled|bleeds|bleeding|blood)$/.test(w))) return true;
    if (!CUTTING.has(word) || words[i + 1] !== "my" || !BODY_PART.has(words[i + 2])) return false;
    const rest = after(words, i + 2).join(" ");
    if (/\bon purpose\b/.test(rest) || SKIN.has(words[i + 2])) return true;
    return !after(words, i + 2).some((w) => ACCIDENT.has(w)) && !before(words, i).includes("finger");
  });

// Hurting someone else. Killing, shooting, stabbing or poisoning a person,
// by the child or meant by anyone ("I shot him", "I want to kill my
// teacher", "Dad said he will kill us", "I will bring dads gun and shoot
// everyone in class"); not a story told of someone else ("Godzilla killed
// everyone in the city"), and "I killed it in the game" isn't a person.
// Hitting, punching, smashing or beating up only when they mean to ("I'm
// going to beat up Liam", "I want to hurt him", "I'm gonna smash his
// face"). Meaning to stab anything is held too ("I will stab the
// snowman"); a stab that was ("the cold air stabbed my lungs") isn't.
const KILL = new Set([
  "kill", "kills", "killed", "killing", "murder", "murders", "murdered", "murdering", "stab",
  "stabs", "stabbed", "shoot", "shoots", "shot", "poison", "poisoned", "strangle", "strangled",
]);
const STAB = new Set(["stab", "stabbing"]);
const HARM = new Set(["hurt", "punch", "beat", "kick", "slap", "hit", "attack", "fight", "choke", "smash", "break", "stomp", "destroy", "get"]);
const MEAN_TO = new Set([
  "want", "going", "will", "ill", "gonna", "should", "got", "lets", "plan", "planning", "try",
  "wish", "would", "could", "gotta", "tomorrow",
]);
const FIRST_PERSON = new Set(["i", "im", "ill", "we", "ive", "id"]);
const SOMEONE = new Set([
  "him", "her", "them", "you", "us", "everyone", "everybody", "someone", "somebody", "people",
  "yourself", "himself", "herself", "themselves", "anyone", "anybody",
]);
const FACE = new Set(["face", "head", "nose", "teeth", "neck", "legs", "arms", "skull"]);
const hurtsSomeone = (words: string[]) => {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!KILL.has(word) && !HARM.has(word)) continue;
    const back = before(words, i);
    const meant = back.some((w) => MEAN_TO.has(w));
    if (STAB.has(word) && meant) return true;
    // "beat up Liam", "beat Liam up"
    const at = words[i + 1] === "up" ? i + 2 : i + 1;
    const next = words[at];
    const person =
      SOMEONE.has(next) ||
      FIRST.has(next) ||
      isPerson(next) ||
      (OWNERS.has(next) && [words[at + 1], words[at + 2], words[at + 3]].some((w) => isPerson(w) || isFamily(w))) ||
      // "smash his face", "break your legs"
      (word !== "get" && (next === "his" || next === "her" || next === "your" || next === "their") && FACE.has(words[at + 1]));
    if (!person || (word === "get" && !(SOMEONE.has(next) && meant))) continue;
    if (meant) return true;
    if (KILL.has(word) && back.some((w) => FIRST_PERSON.has(w))) return true;
  }
  return false;
};

// Being bullied, when it's happening to the child: "they take my lunch
// money", "they call me fat", "the big kids call me the n word every day"
// Calling them names now and again ("they call me", "keeps calling me"), not
// once ("my brother called me a retard" is held for its word)
const CALL = new Set(["call", "calls", "calling"]);
const CALLED_NAMES = new Set([...UNKIND_WORDS, "names", "fat", "ugly", "fatty", "fatso", "loser", "baby", "pig", "monkey", "slurs", "slur", "retard", "word"]);
const bulliedMe = (words: string[], text: string) =>
  words.some((word, i) => CALL.has(word) && words[i + 1] === "me" && after(words, i + 1, 4).some((w) => CALLED_NAMES.has(w) || isUnsafe(w))) ||
  /\b(take|takes|took|steal|steals|stole) my (lunch|lunch money|snack)\b/.test(words.join(" ")) ||
  /\bthe n word\b/i.test(text) && words.includes("me");

// "My mom is going to kill me", "Mum will kill me if I lose my gloves": a
// figure of speech about being in trouble (Day 34 asks for hyperbole). A
// sensitive hold, not a worrying one. Only with the family word right
// there: "Dad said he will kill me" stays worrying.
const PARENTS = new Set(["mom", "mommy", "mother", "dad", "daddy", "father", "parents", "teacher", "grandma", "grandpa", "sister", "brother"]);
const killMeAsAFigure = (words: string[], i: number) => {
  if (words[i] !== "kill" || words[i + 1] !== "me") return false;
  // "mom will kill me", "mom would kill me"
  if (["will", "would", "ill"].includes(words[i - 1]) && PARENTS.has(words[i - 2])) return true;
  if (words[i - 1] === "to" && words[i - 2] === "going") {
    const who = words[i - 3] === "is" || words[i - 3] === "are" ? words[i - 4] : words[i - 3];
    return who !== undefined && (PARENTS.has(who) || PARENTS.has(who.replace(/s$/, "")));
  }
  return false;
};
const withoutFigures = (words: string[]) => words.map((word, i) => (killMeAsAFigure(words, i) ? "kill(figure)" : word));

// No food at home, in any wording: "there is never any food in our house",
// "we have no food at home"
const NO = new Set(["no", "never", "nothing", "any", "isnt", "aint", "dont", "doesnt", "without"]);
const noFoodAtHome = (words: string[]) =>
  words.some(
    (word, i) =>
      (word === "food" || word === "eat" || word === "dinner" || word === "breakfast") &&
      before(words, i, 4).some((w) => NO.has(w)) &&
      [...before(words, i), ...after(words, i)].some((w) => w === "home" || w === "house" || w === "fridge")
  );

// An older boyfriend or girlfriend: "I got a boyfriend who is 19", "my
// online boyfriend is twenty five"
const OLDER_PARTNER =
  /\b(boyfriend|girlfriend|bf|gf)\b[^.!?]{0,30}?\b(1[6-9]|[2-9]\d|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty)\b/;

const WORRYING_PLAIN = plainPhrases(WORRYING_PHRASES);
const WORRYING_RUN_TOGETHER = runTogether(WORRYING_PLAIN);
// Run-together phrases inside a longer run of letters ("iwanttodie"), only
// in words that aren't English words themselves
const LONG_RUN_TOGETHER = [...WORRYING_RUN_TOGETHER].filter((joined) => joined.length >= 9);
// Shorter phrases spelled out letter by letter ("k i l l m e"), when the
// letters make no English word
const SHORT_RUN_TOGETHER = new Set(
  WORRYING_PLAIN.filter((parts) => parts.length > 1 && !parts.includes("$")).map((parts) => parts.join("")).filter((joined) => joined.length >= 6)
);

// Burning a home or a school down: "I'm going to burn down my teacher's
// house", "I will burn the school" (not "we burned marshmallows")
const BURN = new Set(["burn", "burns", "burning", "torch", "torching"]);
const BURNED_DOWN = new Set(["house", "home", "school", "classroom", "apartment", "flat", "car", "church"]);
const burnsItDown = (words: string[]) =>
  words.some(
    (word, i) =>
      BURN.has(word) &&
      after(words, i, 5).some((w) => BURNED_DOWN.has(w)) &&
      before(words, i).some((w) => MEAN_TO.has(w) || FIRST_PERSON.has(w))
  );
const FOREIGN_WORRY = new Set(FOREIGN_WORRYING);

// (Every phrase is matched on the plain reading, which includes the words
// as written, and again with end marks left out: "I want to kill. Myself.")
export const isWorrying = (text: string) => {
  const words = withoutFigures(plainWords(text));
  const joinedUp = words.filter((word) => word !== "$");
  return (
    WORRYING_PLAIN.some((parts) => hasParts(words, parts) || (!parts.includes("$") && hasParts(joinedUp, parts))) ||
    words.some(
      (word) =>
        WORRYING_RUN_TOGETHER.has(word) ||
        (SHORT_RUN_TOGETHER.has(word) && !inDictionaryLowerCase(word)) ||
        (word.length >= 10 && !inDictionaryLowerCase(word) && LONG_RUN_TOGETHER.some((joined) => word.includes(joined)))
    ) ||
    burnsItDown(words) ||
    someoneHurts(words) ||
    iWasHurt(words) ||
    hurtsThemselves(words) ||
    hurtsSomeone(words) ||
    inMyRoom(words) ||
    kissedOnTheLips(words) ||
    touchedMy(words) ||
    picturesOfMe(words) ||
    paidForPictures(words) ||
    groomedOnline(words, text) ||
    bulliedMe(words, text) ||
    noFoodAtHome(words) ||
    words.some((word) => FOREIGN_WORRY.has(word)) ||
    OLDER_PARTNER.test(plain(text))
  );
};

// Sensitive words held only with a person near them, read the plain way:
//   - "die" after "to", "could", "will" ... with "I", "you" or "we" just
//     before ("I wish I could die", "I want 2 die"): not "we watched Die
//     Hard" or "the batteries will die"
//   - "dying inside" (not "I'm dying, it's so cold!" or "dying to see")
//   - "mom is going to kill me" (a figure of speech, see killMeAsAFigure)
//   - "gun" with "I", "my", "we" or "bring" just before: not "the hunter
//     had a gun"
//   - "lonely" after "I'm", "feel", "so" ... with "I" just before: not "the
//     lonely tree"
//   - "beer", but not "root beer" or "ginger beer"
//   - "naked" with a person just before or after: "I saw my sister naked",
//     not "the naked trees"
//   - touching someone's chest, bottom or privates
//   - "bully" only with "me" ("bullies me" is worrying, "is a bully to me"):
//     not "the gale pushed the flowers around like a bully"
//   - drink or drugs, and someone asleep on the floor or passed out
const BEFORE_DIE = new Set(["to", "could", "should", "will", "would", "might", "may", "just", "ill", "i", "you", "gonna"]);
const ME = new Set(["i", "im", "me", "you", "we", "myself"]);
const DIE_IDIOM = new Set(["of", "for", "laughing", "from", "trying"]);
const BEFORE_LONELY = new Set(["im", "am", "feel", "feels", "felt", "feeling", "so", "very", "really", "always", "get", "gets", "got", "was", "too"]);
const GUN = new Set(["gun", "guns", "rifle", "pistol", "revolver"]);
const NEAR_GUN = new Set(["i", "im", "my", "we", "our", "bring", "brought", "ill"]);
const NEAR_NAKED = new Set([...PEOPLE, "i", "im", "me", "my", "him", "her", "them", "you", "we", "us", "his"]);
const TOUCHING = new Set(["touch", "touched", "touches", "touching", "grab", "grabbed", "grabs", "rub", "rubbed"]);
const WHOSE = new Set(["my", "his", "her", "your", "their"]);
const PRIVATE = new Set(["chest", "butt", "bum", "bottom", "breasts", "boobs", "crotch", "thigh", "privates", "private"]);
const BULLY = new Set(["bully", "bullies", "bullied", "bullying"]);
const DRINK = new Set(["drunk", "drinks", "drinking", "beer", "wine", "vodka", "drugs", "pills", "weed", "pipe", "needle", "needles"]);
const sensitiveNearAPerson = (words: string[]) =>
  words.some((word, i) => {
    const back = before(words, i, 4);
    const prev = words[i - 1];
    // Not "I would die for a hot chocolate", "I could die of cold", "did
    // you die in the game?"
    if (word === "die") {
      const inAGame = words[i + 1] === "in" && words.slice(i + 2, i + 6).includes("game");
      return BEFORE_DIE.has(prev) && back.some((w) => ME.has(w)) && !DIE_IDIOM.has(words[i + 1]) && !inAGame;
    }
    // "I'm dying, it's so cold!", "I'm dying to go sledding": nearly always
    // a figure of speech. Only "dying inside".
    if (word === "dying") return words[i + 1] === "inside";
    if (GUN.has(word)) return words.slice(Math.max(0, i - 3), i).some((w) => NEAR_GUN.has(w));
    if (word === "lonely") return BEFORE_LONELY.has(prev) && back.some((w) => w === "i" || w === "im" || w === "me");
    if (word === "beer" || word === "beers") return prev !== "root" && prev !== "ginger";
    if (word === "naked") return [...words.slice(Math.max(0, i - 3), i), ...words.slice(i + 1, i + 4)].some((w) => NEAR_NAKED.has(w));
    if (TOUCHING.has(word)) return WHOSE.has(words[i + 1]) && PRIVATE.has(words[i + 2]);
    if (BULLY.has(word)) return [...before(words, i), ...after(words, i)].some((w) => w === "me" || w === "i" || w === "my" || w === "im");
    if (word === "asleep" || word === "passed") {
      const sentence = [...before(words, i), ...after(words, i)];
      return sentence.some((w) => DRINK.has(w)) && (word === "asleep" ? sentence.includes("floor") : words[i + 1] === "out");
    }
    if (word === "needles" || word === "needle") return [...before(words, i), ...after(words, i)].some((w) => w === "home" || w === "house" || w === "moms" || w === "dads" || w === "'s");
    if (word === "pipe") return [...before(words, i, 6)].some((w) => w === "smokes" || w === "smoke" || w === "smoking" || w === "stuff");
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
    sensitiveNearAPerson(words) ||
    words.some((_, i) => killMeAsAFigure(words, i))
  );
};

// ---- Unkind, and naming someone ----------------------------------------------

// Words that link a person to what's said about them ("Liam is so fat")
const LINKS = new Set(["is", "are", "was", "were", "so", "such", "looks", "look", "looked", "be", "being", "really", "very", "always"]);
const UNKIND_WORD = new Set(UNKIND_WORDS);
const BODY_OR_BLAME = new Set(BODY_OR_BLAME_WORDS);
// Who an unkind word can be about, besides a name (apostrophes are left
// out: "he's" is "hes")
const SUBJECTS = new Set(["he", "she", "you", "they", "your", "youre", "ur", "u", "hes", "shes", "theyre"]);
// "She smells" or "Priya's lunch stinks like garbage", but not "Grandma
// smells like cookies"
const SMELLS = new Set(["smells", "smell", "stinks", "stink", "smelled", "stunk"]);
const SMELLS_BAD = new Set(["$", "bad", "gross", "disgusting", "weird", "so", "really", "haha", "lol"]);
const BAD_SMELL = new Set(["garbage", "trash", "poop", "poo", "pee", "farts", "fart", "dumpster", "sewer", "toilet", "skunk", "feet", "rotten", "dog"]);
const smellsBad = (words: string[], i: number) =>
  SMELLS_BAD.has(words[i + 1] ?? "$") ||
  (words[i + 1] === "like" && [words[i + 2], words[i + 3]].some((w) => w !== undefined && BAD_SMELL.has(w)));
// What's said about a name's things ("Ava's hat is weird", "Emma's snowman
// was fat") is about the thing, unless it's their body ("Kai's teeth are
// yellow and gross") or it's vile ("Mia's lunch looks like vomit")
const BODY = new Set([
  "teeth", "tooth", "hair", "face", "breath", "nose", "feet", "foot", "butt", "bum", "body", "skin",
  "legs", "arms", "ears", "head", "belly", "tummy", "eyes", "voice", "glasses",
]);
const VILE = new Set(["vomit", "puke", "barf", "disgusting", "poop"]);
const NOT_OWNED = new Set(["its", "thats", "whats", "theres", "whos", "heres", "lets", "wheres"]);
// Telling what someone said or did is about something else: "Emma said the
// lunch was gross"
const TELLING = new Set(["said", "says", "told", "tells", "thought", "thinks", "saw", "sees", "ate", "made", "gave", "asked"]);

// Titles and family words written with a capital: not a classmate's name
const NOT_A_NAME = new Set([
  "i", "mr", "mrs", "ms", "miss", "dr", "coach", "aunt", "auntie", "uncle", "grandma", "grandpa",
  "mom", "mommy", "mum", "dad", "daddy", "nana", "papa", "mama", "granny", "sir", "god",
]);
// Days, months and holidays have capitals too
const CALENDAR =
  /^(mon|tues|wednes|thurs|fri|satur|sun)days?$|^(january|february|march|april|may|june|july|august|september|october|november|december|christmas|easter|halloween|thanksgiving|hanukkah|diwali|eid|ramadan)s?$/;
// A pet's name isn't a classmate's: "My cat Luna is fat and fluffy"
const PETS = new Set([
  "cat", "cats", "dog", "dogs", "puppy", "kitten", "hamster", "pet", "fish", "goldfish", "bunny",
  "rabbit", "horse", "pony", "bird", "parrot", "pig", "guinea", "turtle", "lizard", "snake", "mouse",
]);

// Made-up people and places, taken out before the name and personal-details
// checks
const PRETEND = new RegExp(`\\b(${PRETEND_NAMES.join("|")})\\b`, "gi");

// The written words (lower case, apostrophes left out), which of them end
// in "'s", and which are names: a capital, and not a dictionary word in
// lower case ("Liam", "Priya", "Hoth"; not "Brown", "The"), or a common
// first name ("Lily"). A sentence's first word written small counts too
// ("liam is stupid"), and shouting in capitals is read as ordinary capitals
// ("LIAM IS STUPID"). Made-up characters, and a pet's name, are left out.
const namesIn = (text: string) => {
  const asWritten = (
    text
      .replace(PRETEND, " ")
      .replace(INVISIBLE, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’ʼ]/g, "'")
      .match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? []
  ).map((word) => (/^[A-Z]{2,}(?:'[A-Z]+)?$/.test(word) ? word[0] + word.slice(1).toLowerCase() : word));
  const words = asWritten.map((word) => word.toLowerCase().replace(/'/g, ""));
  const isName = asWritten.map((word, i) => {
    const bare = word.replace(/'s$/i, "");
    const lower = bare.toLowerCase();
    if (NOT_A_NAME.has(lower) || CALENDAR.test(lower) || PETS.has(words[i - 1])) return false;
    if (/^[A-Z][a-z]/.test(bare)) return FIRST.has(lower) || !inDictionaryLowerCase(lower);
    return i === 0 && /^[a-z]{2,}$/.test(bare) && (FIRST.has(lower) || !inDictionaryLowerCase(lower));
  });
  // ("He's", "she's", "it's" are "he is", not something of his)
  const owned = asWritten.map((word, i) => /'s$/i.test(word) && !SUBJECTS.has(words[i]) && !NOT_OWNED.has(words[i]));
  return { words, owned, isName };
};

// Something unkind said about someone ("Liam is so fat", "you are ugly",
// "she smells"), up to six words after them, or an unkind phrase ("loser",
// "nobody likes you", "everyone hates you"). Not "Liam was poor at
// sledding": a word before "at" is about a skill.
const UNKIND_PLAIN = plainPhrases(UNKIND_PHRASES);
const unkindAbout = (words: string[], owned: boolean[], isAbout: (i: number) => boolean) => {
  for (let i = 0; i < words.length; i++) {
    if (!isAbout(i)) continue;
    const next = words[i + 1];
    const aboutAThing = owned[i] && !BODY.has(next) && !PEOPLE.has(next) && !FAMILY.has(next) && !["moms", "mums", "dads", "mum", "mummy", "nan", "granny"].includes(next);
    let linked = false;
    for (let j = i + 1; j <= i + 6 && j < words.length; j++) {
      const word = words[j];
      if (TELLING.has(word) && !linked) break;
      if (SMELLS.has(word) && j <= i + 3 && smellsBad(words, j)) return true;
      if (linked && (aboutAThing ? VILE.has(word) : UNKIND_WORD.has(word)) && words[j + 1] !== "at") return true;
      if (LINKS.has(word)) linked = true;
    }
  }
  return false;
};

// A group: "Girls are dumb", "Black people are bad", "Mexicans are dirty"
const GROUPS = new Set([
  "people", "girls", "boys", "mexicans", "chinese", "asians", "africans", "blacks", "whites",
  "muslims", "jews", "christians", "hindus", "arabs", "indians", "immigrants", "gays", "latinos",
  "foreigners", "refugees", "americans", "english", "french", "germans", "russians", "koreans",
  "japanese", "pakistanis", "africans",
]);
const aboutAGroup = (words: string[]) =>
  words.some(
    (word, i) =>
      GROUPS.has(word) &&
      (words[i + 1] === "are" || words[i + 1] === "r") &&
      words.slice(i + 2, i + 5).some((w) => UNKIND_WORD.has(w))
  );

export const isUnkind = (text: string) => {
  const words = plainWords(text);
  if (UNKIND_PLAIN.some((parts) => hasParts(words, parts)) || aboutAGroup(words)) return true;
  const { words: written, owned, isName } = namesIn(text);
  // "Everyone hates Sophia" (but not "everyone hates Mondays")
  const hated = isName.some(
    (name, i) => name && written[i - 1] === "hates" && ["everyone", "everybody"].includes(written[i - 2])
  );
  return hated || unkindAbout(written, owned, (i) => SUBJECTS.has(written[i]) || isName[i]);
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
    if (owned[i]) return BODY_OR_BLAME.has(words[i + 1]);
    // After "is", "was", "so": "Liam is so skinny"
    let linked = false;
    for (let j = i + 1; j <= i + 4 && j < words.length; j++) {
      if (linked && (BODY_OR_BLAME.has(words[j]) || UNKIND_WORD.has(words[j])) && words[j + 1] !== "at") return true;
      if (LINKS.has(words[j])) linked = true;
    }
    return false;
  });
};

// ---- Not English -------------------------------------------------------------

// Small English words almost every English sentence has, however it's
// spelled. A child who spells most words their own way ("I wos so
// cowld.", "The trees wer frozn.") still writes these, and is sent back for
// spelling, not held.
const FUNCTION_WORDS = new Set([
  "i", "the", "a", "an", "is", "was", "my", "and", "to", "it", "so", "on", "in", "we", "he",
  "she", "they", "of", "at", "me", "you", "are", "were", "but", "with", "for", "his", "her",
  "our", "your", "im", "its", "this", "that", "be", "not", "do", "did", "had", "has", "have",
  "up", "out", "too", "very", "then", "when", "there", "them", "us", "am", "can", "if", "or",
  // ... as children often spell them
  "mi", "wer", "wos", "wuz", "iz", "ther", "thay", "sed", "cud", "wen", "wat", "da", "teh", "ur",
  "u", "r", "becuz", "cuz", "wiv", "wif",
]);

// Held as not English:
//   - letters from another script ("我想死", "Я хочу умереть"), or no
//     letters at all ("💀", "🔪🩸😈", "", "...")
//   - at least four words (names with a capital after the first word left
//     out), at least half of them not in the English dictionary, not
//     mostly sound words ("Brrr, zzz, achoo!"), and with almost none of the
//     small English words above ("Hace mucho frío hoy.")
// So a sentence the safety check and the word lists can't read as well is
// read by a person rather than sent back for its spelling.
export const isNotEnglish = (text: string) => {
  const visible = text.replace(INVISIBLE, "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const letters = visible.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  // (Letters that only look like ours, "shіt" with a Cyrillic і, are read as ours)
  if (letters.some((letter) => !/\p{Script=Latin}/u.test(ALPHABET_LOOKALIKES[letter.toLowerCase()] ?? letter))) return true;
  const words = visible.replace(/[‘’ʼ]/g, "'").match(/[A-Za-zß]+(?:'[A-Za-z]+)*/g) ?? [];
  const counted = words.filter((word, i) => i === 0 || !/^[A-Z]/.test(word));
  if (counted.length < 4) return false;
  const sounds = counted.filter((word) => isSoundWord(word)).length;
  if (sounds * 2 >= counted.length) return false;
  const small = counted.filter((word) => FUNCTION_WORDS.has(word.toLowerCase().replace(/'/g, ""))).length;
  if (small > (counted.length >= 10 ? 1 : 0)) return false;
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
    // (Not "LIAM IS STUPID": "Is" is no surname)
    if (FUNCTION_WORDS.has(match[2].toLowerCase())) continue;
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
const ROOM = /\b(?:in|from|to|at|of)\s+room\s*#?\s*\d{1,4}[a-z]?\b/i;
const NUMBERED_SCHOOL = /\bP\.?S\.?\s+\d{1,4}\b/;
const SAINT = /\bSt\.?\s+[A-Z][a-z]+(?:'s|s')(?!\s+(?:Day|day|Eve|eve))/;
const TEACHERS_CLASS = /\b(?:mrs|mr|ms|miss|mx|dr)\.?\s+[a-z]+(?:'s|s')\s+(?:class|classroom|room|grade|homeroom)\b/i;
// More streets with a house number ("47 Birch Crescent", "9 Birch Close"),
// and flats ("apartment 4B")
const NUMBERED_STREET =
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Crescent|Close|Drive|Way|Place|Terrace|Gardens|Grove|Row|Parade|Walk|Rise|Mews|Square|Hill)\b/;
const FLAT = /\b(?:apartment|apt|flat|unit)\.?\s*#?\s*\d{1,4}[a-z]?\b/i;
// A named school: "Westfield School", "Oakwood Academy" (a name, not an
// everyday word: "art school", "Sunday School" are fine)
const NAMED_SCHOOL = /\b([A-Z][a-z]{2,20})\s+(?:School|Academy|Primary)\b/g;
const hasNamedSchool = (text: string) => {
  for (const match of text.matchAll(NAMED_SCHOOL)) {
    const name = match[1].toLowerCase();
    if (!inDictionaryLowerCase(name) && !CALENDAR.test(name)) return true;
  }
  return false;
};
// Numbers written as words: an age ("I am eight years old") or a phone
// number ("five five five one two three four")
const NUMBER_WORD = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)";
const AGE_IN_WORDS = new RegExp(`\\b${NUMBER_WORD}\\s+(?:years?|yrs?)\\s+old\\b|\\b(?:i\\s+am|i'?m|i\\s+turned)\\s+${NUMBER_WORD}\\s*(?:[.!,]|$|years|and\\b)`, "i");
const PHONE_IN_WORDS = new RegExp(`\\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\\s,-]+){6,}(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\\b`, "i");
const MY_NUMBER = /\bmy\s+(?:phone|cell|mobile|number)\s+(?:number\s+)?is\s+(?:\d|\(|\+)/i;
// A UK mobile: 07911 123456, 07911123456, +44 7911 123456
const UK_MOBILE = /(?:\b0|\+44\s?)7\d{3}\s?\d{3}\s?\d{3}\b/;
// A gamer tag: "add me samcool123", "my username is CoolSam", "my tag is
// SamCool99" (a word with a digit, an underscore or a capital inside)
const GAMER_TAG = /\b(?:add me|my (?:user ?name|tag|gamer ?tag|ign) is)\s+@?(?=[A-Za-z0-9_]*(?:\d|_|[a-z][A-Z]))[A-Za-z0-9_]{3,}/i;
// A phone number, but not counting: "I counted 1 2 3 4 5 6 7 8 snowflakes"
const hasPhone = (text: string) => {
  const match = text.match(PHONE);
  if (!match) return false;
  const digits = match[0].replace(/\D/g, "");
  return !"0123456789".includes(digits) && !"9876543210".includes(digits);
};
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
    hasPhone(visible) ||
    MY_NUMBER.test(visible) ||
    UK_MOBILE.test(visible) ||
    GAMER_TAG.test(visible) ||
    PHONE_IN_WORDS.test(visible) ||
    hasAddress(visible) ||
    NUMBERED_STREET.test(visible) ||
    FLAT.test(visible) ||
    hasNamedSchool(visible) ||
    AGE_IN_WORDS.test(visible.replace(/[‘’ʼ]/g, "'")) ||
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
    anyPhrase(read(visible), PERSONAL_PHRASES) ||
    PERSONAL_PLAIN.some((parts) => hasParts(plainWords(visible), parts))
  );
};
const PERSONAL_PLAIN = plainPhrases(PERSONAL_PHRASES);

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
// person to judge. Anything else left once the Tell's words and the small
// words are taken out is the child's own too: letters in any script,
// digits or emoji ("It is cold outside. 😢😢", "It is cold outside 911",
// "It is cold outside 救命").
const OWN_CONTENT = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
// The Tell's instructions in brackets aren't part of it ("(Use a Simile)"),
// in the Tell or pasted into the Show
const withoutInstructions = (text: string) => text.replace(/\([^)]*\)/g, " ");
const copiesTell = (tell: string, show: string) => {
  const meaningful = (text: string) => read(text).words.filter((word) => !STOP.has(word));
  const tellWords = new Set(meaningful(withoutInstructions(tell)));
  const shown = withoutInstructions(show);
  if (tellWords.size === 0 || meaningful(shown).length === 0) return false;
  const left = plain(shown).replace(/[a-z]+(?:'[a-z]+)*/g, (word) => (tellWords.has(word) || STOP.has(word) ? " " : word));
  return !OWN_CONTENT.test(left);
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
