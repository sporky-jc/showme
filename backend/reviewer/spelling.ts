// Spelling: the words in a Show sentence that aren't in the English
// dictionary, so a sentence with mistakes isn't approved into the gallery.
//
// Uses nspell with the en-US Hunspell dictionary (dictionary-en), both by
// the same author, pinned exactly, with no network access: the check runs
// here on the server. Like the libraries in libraries.ts, it never sends a
// sentence back on its own (reviewer.ts): it only stops an approval, after
// the safety checks, so a misspelled worrying sentence still reaches a
// person.
import nspell from "nspell";
import dictionary from "dictionary-en";

// Loaded on first use (about a tenth of a second), then kept
let checker: ReturnType<typeof nspell> | undefined;
const spell = () => (checker ??= nspell(Buffer.from(dictionary.aff), Buffer.from(dictionary.dic)));

// Sound words and everyday words children write that the dictionary lacks
// (stretched ones too: "Brrrrr" and "Wheee" are read as "brr" and "whee")
const ALLOWED = new Set([
  "ok", "okay", "brr", "shh", "hmm", "zz", "ugh", "ahh", "ooh", "aww", "eww", "yay", "wow",
  "whoa", "oof", "phew", "yum", "yummy", "boom", "zoom", "whee", "yippee", "achoo", "grr",
]);
const sound = (word: string) => word.toLowerCase().replace(/([a-z])\1{2,}/g, "$1$1");

// Is this a sound word children write ("Brrrr", "Wheee")?
export const isSoundWord = (word: string) => ALLOWED.has(sound(word));

// Is this word, in lower case, an English word? Names are in the dictionary
// only with their capital ("Springfield"), so "springfield" isn't: this
// tells an ordinary word ("brown", "wow") from a name or a foreign word.
export const inDictionaryLowerCase = (word: string) => spell().correct(word.toLowerCase());

// The misspelled words, each once, as written. Words written with a capital
// after the first word are names ("Lily", "Minecraft") and aren't checked;
// nor are words with digits or symbols in them.
export const misspelledWords = (text: string): string[] => {
  const words = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? [];
  const found = new Set<string>();
  words.forEach((word, index) => {
    const plain = word.replace(/’/g, "'");
    if (index > 0 && /^[A-Z]/.test(plain)) return;
    if (ALLOWED.has(sound(plain))) return;
    if (spell().correct(plain) || spell().correct(plain.toLowerCase())) return;
    found.add(word);
  });
  return [...found];
};
