import type { SenseKey } from "./senses";

// Sense words added by the weekly sense word job
// (.github/workflows/sense-words.yml, scripts/sense-words.ts). Each one
// cleared every gate in tasks/sense-words-plan.md (S3). The job rewrites
// this whole file, one word per line, so change words in senses.ts instead.
// To take one out for good, add it to NEVER_ADD in scripts/senseWordJob.ts;
// the next run removes it here.
//
// - exact: found only as written ("barked", when kids haven't shown the
//   whole family means the sense)
// - words: doing and naming words, with -s, -es, -ed and -ing
// - describing: describing words, with -er, -est and -ly
export const ADDED_SENSE_WORDS: Record<
  SenseKey,
  { exact: readonly string[]; words: readonly string[]; describing: readonly string[] }
> = {
  see: { exact: [], words: [], describing: [] },
  hear: { exact: [], words: [], describing: [] },
  feel: { exact: [], words: [], describing: [] },
  smell: { exact: [], words: [], describing: [] },
  taste: { exact: [], words: [], describing: [] },
};
