// Capitals, end marks and punctuation: the writing mistakes a program can
// find for certain, so a sentence with them is never approved into the
// gallery. Grammar beyond these (verb forms, missing words) needs to
// understand the sentence, so the AI reviewer judges it (prompt.ts).
//
// Like spelling.ts, these only ever stop an approval, after the safety
// checks (reviewer.ts): they never send a sentence back on their own.
import type { TipId } from "./tips.js";

export const MECHANICS = [
  "capital-start", // the sentence starts with a small letter
  "lowercase-i", // "i" on its own ("i saw", "i'm")
  "end-mark", // no . ! or ? at the end
  "space-before-mark", // "cold ." or "cold ,"
  "no-space-after-mark", // "cold,and"
  "repeated-word", // "the the" (not "crunch, crunch")
  "a-an", // "a apple", "an dog"
] as const;
export type Mechanic = (typeof MECHANICS)[number];

export interface MechanicsIssue {
  kind: Mechanic;
  // The words it's about, as written ("i", "the the", "a apple")
  text: string;
}

// The tip for each kind of mistake
export const MECHANIC_TIP: Record<Mechanic, TipId> = {
  "capital-start": "capitals",
  "lowercase-i": "capitals",
  "end-mark": "endMark",
  "space-before-mark": "punctuation",
  "no-space-after-mark": "punctuation",
  "repeated-word": "readAloud",
  "a-an": "readAloud",
};

// "an" goes before a vowel sound: "an hour", but "a unicorn", "a one"
const AN_BEFORE_CONSONANT = /^(hour|honest|honou?r|heir)/i;
const A_BEFORE_VOWEL = /^(uni|use|usu|uti|ure|one|once|eu|ewe|u-|ufo)/i;

export const mechanicsIssues = (text: string): MechanicsIssue[] => {
  const issues: MechanicsIssue[] = [];
  const add = (kind: Mechanic, found: string) => {
    if (!issues.some((issue) => issue.kind === kind && issue.text === found)) issues.push({ kind, text: found });
  };
  const trimmed = text.trim();
  if (trimmed === "") return issues;

  // The first letter (after any opening quote or bracket) is a capital
  if (/^["'“‘(\[]*[a-z]/.test(trimmed)) add("capital-start", trimmed.slice(0, trimmed.search(/\s|$/)));

  // "i" on its own is always a capital
  for (const match of trimmed.matchAll(/(?<![A-Za-z'’])i(?:['’](?:m|ll|ve|d))?(?![A-Za-z'’])/g)) {
    add("lowercase-i", match[0]);
  }

  // Ends with . ! ? or … (closing quotes and brackets may follow)
  if (!/[.!?…]["'”’)\]]*$/.test(trimmed)) {
    add("end-mark", trimmed.slice(trimmed.lastIndexOf(" ") + 1));
  }

  // No space before , . ! ? ; : (but "..." and quotes are fine)
  for (const match of trimmed.matchAll(/[A-Za-z0-9'’]+\s+[,.!?;:](?!\.)/g)) add("space-before-mark", match[0]);

  // A space after , ; : and after . ! ? between words, but not inside
  // numbers ("3.5", "1,000") or "..."
  const unabbreviated = trimmed.replace(/\b(?:[A-Za-z]\.){2,}/g, (abbreviation) => "X".repeat(abbreviation.length)); // "a.m."
  for (const match of unabbreviated.matchAll(/[A-Za-z'’]+[,;:!?.][A-Za-z'’]+/g)) add("no-space-after-mark", match[0]);

  const words = [...trimmed.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
  for (let i = 1; i < words.length; i++) {
    const before = words[i - 1];
    const word = words[i];
    const between = trimmed.slice(before.index! + before[0].length, word.index);

    // The same word twice in a row, with only a space between (a comma
    // means it's on purpose: "crunch, crunch")
    if (/^\s+$/.test(between) && before[0].toLowerCase() === word[0].toLowerCase()) {
      add("repeated-word", `${before[0]} ${word[0]}`);
    }

    // "a" or "an" before the next word
    if (/^\s+$/.test(between) && /^(a|an)$/i.test(before[0]) && !/^[A-Z]{2,}$/.test(word[0])) {
      const vowel = /^[aeiou]/i.test(word[0]);
      const wantsAn = (vowel && !A_BEFORE_VOWEL.test(word[0])) || AN_BEFORE_CONSONANT.test(word[0]);
      if (/^a$/i.test(before[0]) === wantsAn) add("a-an", `${before[0]} ${word[0]}`);
    }
  }

  return issues;
};
