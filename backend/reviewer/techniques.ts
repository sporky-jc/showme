// What the code alone can tell about whether a Show sentence uses what its
// Tell asks for (contract/api.ts, TECHNIQUES): a simile, a sound word, or
// alliteration. It only ever says "yes, it does": a sentence it finds no
// sign of goes to a model to judge (decide.ts), so a gap here never sends
// a sentence back on its own. No AI, nothing sent anywhere.
import type { Technique } from "../contract/api.js";
import { SOUND_WORDS } from "./soundWords.js";

const words = (show: string) => show.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

// "like a cloud", "looked like", "as cold as ice". A bare "like" is often
// the verb ("I like snow"), so it needs a word after it that starts a
// thing, or a word before it that compares.
const SIMILE = [
  /\blike (?:a|an|the|my|his|her|their|our|your|some|two|tiny|little|big|giant|someone|something)\b/i,
  /\b(?:looks?|looked|feels?|felt|sounds?|sounded|smells?|smelled|tastes?|tasted|seems?|seemed|acts?|acted|moves?|moved|ran|run|runs) like\b/i,
  /\bas \w+ as\b/i,
];
export const hasSimile = (show: string) => SIMILE.some((pattern) => pattern.test(show));

// A sound word ("Crunch!", "Splash went the puddle."). Stretched spellings
// count ("Brrrrr", "Zzzzz"), read with their long letters cut to two, as in
// spelling.ts.
export const hasSoundWord = (show: string) =>
  words(show).some((word) => SOUND_WORDS.has(word.replace(/([a-z])\1{2,}/g, "$1$1")));

// Three words close together that start with the same letter ("silly snakes
// slither"), not counting the small words between them
const SMALL = new Set(["a", "an", "the", "and", "of", "to", "in", "on", "at", "by", "with", "my", "his", "her", "its"]);
export const hasAlliteration = (show: string) => {
  const big = words(show).filter((word) => !SMALL.has(word) && word.length > 1);
  return big.some((word, at) => at + 2 < big.length && big[at + 1][0] === word[0] && big[at + 2][0] === word[0]);
};

// true when the code finds the technique; undefined when it can't tell (a
// model judges)
export const techniqueFound = (technique: Technique, show: string): true | undefined => {
  if (technique === "simile" && hasSimile(show)) return true;
  if (technique === "onomatopoeia" && hasSoundWord(show)) return true;
  if (technique === "alliteration" && hasAlliteration(show)) return true;
  return undefined;
};
