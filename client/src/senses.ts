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

// A sentence cut into pieces that read as the whole sentence again, each word
// that uses a sense a piece of its own with that sense (the first one it
// matches), for the gallery to light up
export type SensePiece = { text: string; sense: SenseKey | null };

export function sensePieces(text: string): SensePiece[] {
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
    const sense = word === undefined ? null : (SENSE_KEYS.find((key) => matches(word, key)) ?? null);
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
