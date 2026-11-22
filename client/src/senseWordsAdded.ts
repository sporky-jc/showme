import type { SenseKey } from "./senses";

// Sense words added by the weekly sense word job
// (.github/workflows/sense-words.yml, client/scripts/sense-words.ts), each
// in at least 3 approved sentences and given the same sense by the AI when
// asked twice in different ways, with every sense test still passing. The
// job rewrites this whole file, so change words in senses.ts instead; to
// take one of these out, move it to NEVER_ADD in scripts/senseWordJob.ts
// and delete it here.
export const ADDED_SENSE_WORDS: Record<SenseKey, { words: readonly string[]; describing: readonly string[] }> = {
  see: { words: [], describing: [] },
  hear: { words: [], describing: [] },
  feel: { words: [], describing: [] },
  smell: { words: [], describing: [] },
  taste: { words: [], describing: [] },
};
