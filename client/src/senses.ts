// Which senses a Show sentence uses, from a short word list per sense. It's a
// hint for the Write page (stickers, lit-up sense buttons, Scribbles' picture)
// and the gallery, not a grade: it will miss some words, and Scribbles'
// review decides.
//
// The list keeps base words only, and works out their family itself (see
// baseForms below): "scream" also finds screams, screamed and screaming, and
// "loud" also finds louder, loudest and loudly. A few word starts cover a
// family the rules can't ("sparkl" for sparkle, sparkled, sparkling,
// sparkly). Matching is by whole word, so "red" doesn't hide in "tired" and
// "fur" doesn't hide in "furious".

import { ADDED_SENSE_WORDS } from "./senseWordsAdded";

export type SenseKey = "see" | "hear" | "feel" | "smell" | "taste";

export const SENSE_KEYS: readonly SenseKey[] = ["see", "hear", "feel", "smell", "taste"];

type SenseList = {
  // Words found only as they are: irregular forms, and words whose family
  // means something else ("licked" a cheek is a feeling, not a taste)
  exact: readonly string[];
  // Doing and naming words, also found with -s, -es, -ed and -ing
  words: readonly string[];
  // Describing words, also found with -er, -est and -ly
  describing: readonly string[];
  // Word starts: any word that starts with one of these
  starts: readonly string[];
};

const SENSE_WORDS: Record<SenseKey, SenseList> = {
  see: {
    exact: ["saw", "seen", "shone"],
    words: ["see", "look", "watch", "stare", "shine", "glow", "flash", "dim", "shadow"],
    describing: [
      "bright", "shiny", "glowy", "dim", "dark", "blurry", "pale", "colorful", "spotted",
      "striped", "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown",
      "black", "white", "gray", "gold", "golden", "silver", "rainbow",
    ],
    starts: ["sparkl", "glitter", "shimmer", "twinkl", "gleam", "glisten"],
  },
  hear: {
    exact: ["heard", "rang", "sang"],
    words: [
      "hear", "listen", "sound", "noise", "bark", "thump", "drum", "buzz", "crash", "bang",
      "boom", "pop", "snap", "crack", "click", "ring", "yap", "howl", "growl", "whine",
      "pant", "splash", "hum", "sing", "song", "shout", "scream", "yell",
      "cheer", "roar", "thunder", "beep", "tick",
      // Crunching under boots is a sound; "crunchy" food is a taste
      "crunch",
      // Scribbles' sound words (backend/reviewer/soundWords.ts) that are
      // always a sound. senses.test.ts says which of the others aren't.
      "achoo", "ahem", "burp", "gasp", "ha", "haha", "hah", "hee", "hehe", "hic", "hiccup",
      "huff", "hush", "psst", "shh", "shush", "sigh", "snore", "sob", "zz",
      "bam", "biff", "bonk", "bop", "clang", "clank", "clatter", "clonk", "kaboom", "kapow",
      "kerplunk", "knock", "pow", "smack", "smash", "splat", "thud", "thunk", "thwack",
      "wallop", "wham", "whack", "whomp", "gurgle", "patter", "pitter", "plink", "plip",
      "plonk", "plop", "splish", "splosh", "sploosh", "squelch", "swish", "whoosh", "swoosh",
      "rumble", "crackle", "sizzle", "hiss", "fizz", "boing", "clack", "clickety",
      "clink", "ding", "dong", "honk", "ping", "tock", "toot", "vroom", "whee", "whir",
      "whirr", "whiz", "whizz", "baa", "cluck", "cockadoodledoo", "grr", "hoot", "meow",
      "miaow", "moo", "neigh", "oink", "purr", "quack", "ribbit", "squawk", "tweet", "woof",
    ],
    describing: ["loud", "quiet", "silent", "noisy"],
    starts: ["whisper", "squeak", "rumbl", "crackl", "sizzl", "giggl", "creak", "chirp", "rattl", "jingl"],
  },
  feel: {
    // "feeling" and "feels" are mostly about how someone feels inside
    exact: ["feel", "felt", "stung"],
    words: [
      "touch", "fur", "lick", "hug", "squeeze", "burn", "sting", "ache", "sweat",
      "tremble",
    ],
    describing: [
      "warm", "cold", "hot", "cool", "icy", "freezing", "soft", "rough", "smooth", "bumpy",
      "sharp", "wet", "damp", "dry", "sticky", "slimy", "furry", "fuzzy", "fluffy", "prickly",
      "itchy", "sweaty", "heavy",
    ],
    starts: ["tickl", "shiver", "nuzzl", "squish", "tingl", "wiggl"],
  },
  smell: {
    exact: ["stank"],
    words: ["smell", "stink", "scent", "whiff", "smoke", "perfume"],
    describing: ["smelly", "stinky", "smoky", "fresh", "rotten", "musty"],
    starts: ["sniff", "fragran", "aroma"],
  },
  taste: {
    exact: ["bit", "lick"],
    words: ["taste", "chew", "bite", "sip", "yum"],
    describing: [
      "tasty", "salty", "sour", "sweet", "bitter", "spicy", "juicy", "yummy", "chewy",
      "sugary", "minty", "tangy", "crispy", "crunchy",
    ],
    starts: ["munch", "slurp", "gulp"],
  },
};

// Forms that look like a family member but almost never are
const NOT_FORMS = new Set(["pants"]);

// The base words a word could be a form of, by the usual spelling rules:
// screams, crashes and cries; screamed, stared, hummed and cried; screaming,
// shining and humming for doing words; louder, paler, hotter, noisier,
// loudest, loudly and noisily for describing words. Bases shorter than three
// letters are left out, so "has" isn't a form of "ha".
export function baseForms(word: string): { doing: string[]; describing: string[] } {
  const doing: string[] = [];
  const describing: string[] = [];
  // "stem" with its last letter undoubled too: humm → hum
  const undoubled = (stem: string) =>
    stem.length > 1 && stem.at(-1) === stem.at(-2) ? [stem, stem.slice(0, -1)] : [stem];
  // "stem", stem + "e" (shin → shine), and stem undoubled
  const withE = (stem: string) => [...undoubled(stem), stem + "e"];

  if (word.endsWith("ies")) doing.push(word.slice(0, -3) + "y");
  if (word.endsWith("es")) doing.push(word.slice(0, -2));
  if (word.endsWith("s") && !word.endsWith("ss")) doing.push(word.slice(0, -1));
  if (word.endsWith("ied")) doing.push(word.slice(0, -3) + "y");
  if (word.endsWith("ed")) {
    doing.push(...undoubled(word.slice(0, -2)));
    // stared → stare, but not seed → see
    if (!word.endsWith("eed")) doing.push(word.slice(0, -1));
  }
  if (word.endsWith("ing")) doing.push(...withE(word.slice(0, -3)));

  if (word.endsWith("ier")) describing.push(word.slice(0, -3) + "y");
  if (word.endsWith("iest")) describing.push(word.slice(0, -4) + "y");
  if (word.endsWith("ily")) describing.push(word.slice(0, -3) + "y");
  if (word.endsWith("er")) describing.push(...withE(word.slice(0, -2)));
  if (word.endsWith("est")) describing.push(...withE(word.slice(0, -3)));
  if (word.endsWith("ly")) describing.push(word.slice(0, -2));

  const long = (base: string) => base.length >= 3;
  return { doing: doing.filter(long), describing: describing.filter(long) };
}

// The list above, with the words the weekly sense word job added
const LISTS = Object.fromEntries(
  SENSE_KEYS.map((sense) => [
    sense,
    {
      exact: new Set([...SENSE_WORDS[sense].exact, ...ADDED_SENSE_WORDS[sense].exact]),
      words: new Set([...SENSE_WORDS[sense].words, ...ADDED_SENSE_WORDS[sense].words]),
      describing: new Set([...SENSE_WORDS[sense].describing, ...ADDED_SENSE_WORDS[sense].describing]),
      starts: SENSE_WORDS[sense].starts,
    },
  ])
) as Record<SenseKey, { exact: Set<string>; words: Set<string>; describing: Set<string>; starts: readonly string[] }>;

// Words that only tell how something is or feels. When the Tell sentence uses
// one and the Show sentence repeats it, the student is telling again. (The
// weekly sense word job never adds one: scripts/senseWordJob.ts)
export const TELL_WORDS = new Set([
  "happy", "happier", "happiest", "happily", "sad", "sadly", "mad", "angry", "scared", "afraid",
  "excited", "bored", "boring", "fun", "good", "great", "bad", "nice", "pretty", "beautiful",
  "ugly", "cold", "hot", "big", "small", "little", "huge", "tiny", "messy", "clean", "tired",
  "rich", "poor", "fast", "slow", "loud", "quiet", "delicious", "gross", "colorful", "hard",
  "easy", "dark", "scary", "funny", "cute", "brave", "hungry", "sick", "hurt", "hurts",
]);

// The words of a sentence, lowercased, with apostrophes kept ("can't")
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z']+/g) ?? [];

const matches = (word: string, sense: SenseKey) => {
  const { exact, words, describing, starts } = LISTS[sense];
  if (exact.has(word) || words.has(word) || describing.has(word)) return true;
  if (starts.some((start) => word.startsWith(start))) return true;
  if (NOT_FORMS.has(word)) return false;
  const bases = baseForms(word);
  return bases.doing.some((base) => words.has(base)) || bases.describing.some((base) => describing.has(base));
};

// The sense highlights the sense tagger saved for an approved sentence: the
// words two AI models agree show a sense in that sentence
// (backend/tagger/, sent with gallery sentences). The sense they agree on
// wins over the word list's for that word ("sweet perfume" is a smell, not
// a taste); every other word is read with the list.
export type SenseTag = { word: string; sense: SenseKey };
const taggedSenses = (tags: readonly SenseTag[] | undefined) =>
  new Map((tags ?? []).map(({ word, sense }) => [word.toLowerCase().replace(/[’‘]/g, "'"), sense]));

// Does this word use this sense: as tagged, or else by the list
const uses = (word: string, sense: SenseKey, tagged: Map<string, SenseKey>) => {
  const tag = tagged.get(word);
  return tag ? tag === sense : matches(word, sense);
};

// For each sense, the first word in the sentence that uses it, or null.
// With a sentence's saved tags (above), the tagged words count for the sense
// they were tagged with.
export function senseWords(text: string, tags?: readonly SenseTag[]): Record<SenseKey, string | null> {
  const words = wordsOf(text);
  const tagged = taggedSenses(tags);
  const found = {} as Record<SenseKey, string | null>;
  for (const sense of SENSE_KEYS) found[sense] = words.find((word) => uses(word, sense, tagged)) ?? null;
  return found;
}

// A sentence cut into pieces that read as the whole sentence again, each word
// that uses a sense a piece of its own with that sense (as tagged, or else
// the first one it matches), for the gallery to light up
export type SensePiece = { text: string; sense: SenseKey | null };

export function sensePieces(text: string, tags?: readonly SenseTag[]): SensePiece[] {
  const tagged = taggedSenses(tags);
  const pieces: SensePiece[] = [];
  const add = (piece: string, sense: SenseKey | null) => {
    if (piece === "") return;
    const last = pieces[pieces.length - 1];
    if (sense === null && last?.sense === null) last.text += piece;
    else pieces.push({ text: piece, sense });
  };
  // Words as wordsOf reads them, and everything between them as it is
  for (const part of text.split(/([A-Za-z'’‘]+)/)) {
    const word = wordsOf(part)[0];
    const sense = word === undefined ? null : (tagged.get(word) ?? SENSE_KEYS.find((key) => matches(word, key)) ?? null);
    add(part, /[A-Za-z]/.test(part) ? sense : null);
  }
  return pieces;
}

// The telling word the Show sentence repeats from the Tell sentence, if any:
// "happy" in "The dog was so happy" for the Tell "The dog was happy."
export function repeatedTellWord(show: string, tell: string): string | null {
  const telling = new Set(wordsOf(tell).filter((word) => TELL_WORDS.has(word)));
  if (telling.size === 0) return null;
  return wordsOf(show).find((word) => telling.has(word)) ?? null;
}

// What each sense is called on the page
export const SENSE_NAMES: Record<SenseKey, string> = {
  see: "See",
  hear: "Hear",
  feel: "Feel",
  smell: "Smell",
  taste: "Taste",
};

// For each sense, how many of these sentences use it (a sentence counts once
// per sense, however many of its words use that sense)
export function senseCounts(sentences: readonly string[]): Record<SenseKey, number> {
  const counts = { see: 0, hear: 0, feel: 0, smell: 0, taste: 0 };
  for (const sentence of sentences) {
    const found = senseWords(sentence);
    for (const sense of SENSE_KEYS) if (found[sense]) counts[sense] += 1;
  }
  return counts;
}

// Questions Scribbles asks to get a writer going with each sense. They are
// general on purpose: they work for any Tell sentence.
export const SENSE_TIPS: Record<SenseKey, readonly string[]> = {
  see: [
    "What would a camera catch? Colors, shapes, tiny details!",
    "Zoom in close. What is the smallest thing you can see?",
    "What is moving, and how does it move?",
  ],
  hear: [
    "Close your eyes. What sounds are there?",
    "Is it loud or quiet? What makes the noise?",
    "Could someone say something? What would they say?",
  ],
  feel: [
    "What does it feel like on your skin?",
    "Is it rough, smooth, sticky, cold or warm?",
    "What does your body do? Shiver, sweat, yawn?",
  ],
  smell: [
    "Take a big sniff. What is in the air?",
    "Does it smell fresh, sweet, smoky or stinky?",
    "What does the smell remind you of?",
  ],
  taste: [
    "Is there anything to taste? Sweet, salty, sour?",
    "What would it taste like if you took a bite?",
    "Does the air leave a taste on your tongue?",
  ],
};

// The sense to try next: the one these counts use least, so one never tried
// comes first. Ties go to the earlier sense in SENSE_KEYS.
export function leastUsedSense(counts: Record<SenseKey, number>): SenseKey {
  return SENSE_KEYS.reduce((least, sense) => (counts[sense] < counts[least] ? sense : least));
}
