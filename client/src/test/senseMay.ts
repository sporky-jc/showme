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
// the sense practice sets" workflow, scripts/judge-sense-sets.ts). It runs
// once; its answer is pasted here and frozen before the tagger is tuned
// again. Change it only by running the panel again, never by hand.
//
// Empty until the panel has run: every sense left out counts as wrong.
export const SENSE_MAY: Readonly<Record<string, readonly SenseKey[]>> = {};
