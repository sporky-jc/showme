import type { SenseKey } from "../senses";

// The judgment calls in the practice sets (test/senseSet.ts and
// test/senseHeldOut.ts): senses a sentence doesn't mainly show, but that a
// teacher could fairly accept ("The chips were salty and crunchy." shows
// taste, and crunchy is also a sound). Scoring counts them neither right nor
// wrong (test/senseScoring.ts), so a defensible extra highlight isn't a
// mistake, and the bar for real mistakes stays as strict.
//
// Nobody picks these by hand, and the AI being scored doesn't either: a
// panel of three other AI families decides, each asked about every sense a
// sentence's labels leave out, and only a unanimous yes counts (the "Judge
// the sense practice sets" workflow, scripts/judge-sense-sets.ts). Change it
// only by running the panel again, never by hand.
//
// Last judged 2026-11-24, by @cf/google/gemma-4-26b-a4b-it, @cf/zai-org/glm-4.7-flash, @cf/openai/gpt-oss-120b:
// 1 sentences with judgment calls.
export const SENSE_MAY: Readonly<Record<string, readonly SenseKey[]>> = {
  "The fire alarm screeched, and we covered our ears.": ["feel"],
};
