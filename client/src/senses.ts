// Which senses a Show sentence uses, from a short word list per sense. It's a
// hint for the Write page (stickers, lit-up sense buttons, Scribbles' picture),
// not a grade: it will miss some words, and Scribbles' review decides.
//
// Matching is by whole word, so "red" doesn't hide in "tired" or "bored" and
// "fur" doesn't hide in "furious". A few word starts cover a family of forms
// ("sparkl" for sparkle, sparkled, sparkling, sparkly).

export type SenseKey = "see" | "hear" | "feel" | "smell" | "taste";

export const SENSE_KEYS: readonly SenseKey[] = ["see", "hear", "feel", "smell", "taste"];

const SENSE_WORDS: Record<SenseKey, { words: readonly string[]; starts: readonly string[] }> = {
  see: {
    words: [
      "see", "saw", "seen", "look", "looked", "looks", "watch", "watched", "stare", "stared",
      "bright", "shiny", "shine", "shined", "shone", "glow", "glowed", "glowing", "glowy",
      "flash", "flashed", "flashing", "dim", "dark", "shadow", "shadows", "blurry",
      "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "black", "white",
      "gray", "gold", "golden", "silver", "rainbow", "colorful", "spotted", "striped", "pale",
    ],
    starts: ["sparkl", "glitter", "shimmer", "twinkl", "gleam", "glisten"],
  },
  hear: {
    words: [
      "hear", "heard", "listen", "listened", "sound", "sounds", "noise", "noisy",
      "bark", "barked", "barking", "thump", "thumped", "thumping", "drum", "drummed", "drumming",
      "buzz", "buzzed", "buzzing", "crash", "crashed", "bang", "banged", "boom", "boomed",
      "pop", "popped", "snap", "snapped", "crack", "cracked", "click", "clicked", "ring", "rang",
      "loud", "quiet", "silent", "yap", "yapped", "howl", "howled", "growl", "growled",
      "whine", "whined", "pant", "panted", "panting", "splash", "splashed", "hum", "hummed",
      "sang", "sing", "song", "shout", "shouted", "scream", "screamed", "yell", "yelled",
      "cheer", "cheered", "roar", "roared", "thunder", "beep", "beeped", "tick", "ticked",
      // Crunching under boots is a sound; "crunchy" food is a taste
      "crunch", "crunched", "crunching",
    ],
    starts: ["whisper", "squeak", "rumbl", "crackl", "sizzl", "giggl", "creak", "chirp", "rattl", "jingl"],
  },
  feel: {
    words: [
      "feel", "felt", "touch", "touched", "warm", "cold", "hot", "cool", "icy", "freezing",
      "soft", "rough", "smooth", "bumpy", "sharp", "wet", "damp", "dry", "sticky", "slimy",
      "fur", "furry", "fuzzy", "fluffy", "prickly", "itchy", "lick", "licked", "licking",
      "hug", "hugged", "squeeze", "squeezed", "burn", "burned", "burning", "sting", "stung",
      "ache", "ached", "sweat", "sweaty", "heavy",
    ],
    starts: ["tickl", "shiver", "nuzzl", "squish", "tingl", "wiggl"],
  },
  smell: {
    words: [
      "smell", "smelled", "smells", "smelly", "stink", "stinky", "stank", "scent", "whiff",
      "smoky", "smoke", "fresh", "perfume", "rotten", "musty",
    ],
    starts: ["sniff", "fragran", "aroma"],
  },
  taste: {
    words: [
      "taste", "tasted", "tastes", "tasty", "salty", "sour", "sweet", "bitter", "spicy", "juicy",
      "yum", "yummy", "chew", "chewed", "chewy", "bite", "bit", "sip", "sipped", "lick",
      "sugary", "minty", "tangy", "crispy", "crunchy",
    ],
    starts: ["munch", "slurp", "gulp"],
  },
};

// Words that only tell how something is or feels. When the Tell sentence uses
// one and the Show sentence repeats it, the student is telling again.
const TELL_WORDS = new Set([
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
  const { words, starts } = SENSE_WORDS[sense];
  return words.includes(word) || starts.some((start) => word.startsWith(start));
};

// For each sense, the first word in the sentence that uses it, or null
export function senseWords(text: string): Record<SenseKey, string | null> {
  const words = wordsOf(text);
  const found = {} as Record<SenseKey, string | null>;
  for (const sense of SENSE_KEYS) found[sense] = words.find((word) => matches(word, sense)) ?? null;
  return found;
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

// The sentence's first word that uses a sense, with that sense: the sticker a
// gallery card leads with. Null when the sentence uses none.
export function firstSenseWord(text: string): { sense: SenseKey; word: string } | null {
  for (const word of wordsOf(text)) {
    const sense = SENSE_KEYS.find((key) => matches(word, key));
    if (sense) return { sense, word };
  }
  return null;
}
