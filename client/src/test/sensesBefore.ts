import type { SenseKey } from "../senses";

// The sense word list as it was before word families (S1 of
// tasks/sense-words-plan.md), kept so a test can check that every word it
// matched still matches the same sense. Tests only; never grows.
export const SENSE_WORDS_BEFORE: Record<SenseKey, { words: readonly string[]; starts: readonly string[] }> = {
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

