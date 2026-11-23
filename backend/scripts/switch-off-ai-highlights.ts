// Turns "AI highlights for kids" off (models/ownerSettings.ts,
// switchOffAiHighlights), for the "Measure the sense tagger" workflow when
// the measure fails (Stage A7 of tasks/sense-words-plan.md). It only ever
// turns that one switch off: AI reading keeps going, and nothing is turned
// on.
//
//   node lib/scripts/switch-off-ai-highlights.js
//
// Needs DATABASE_ACCESS (and DATABASE_NAME for staging's database). Prints
// what it did, and adds it to the workflow's summary.
import { appendFileSync } from "node:fs";
import mongoose from "mongoose";
import { switchOffAiHighlights } from "../models/ownerSettings.js";
import { messageOf } from "../utils/errors.js";

const databaseAccess = process.env.DATABASE_ACCESS;
if (!databaseAccess) {
  console.error("Can't run: DATABASE_ACCESS is not set.");
  process.exit(1);
}

try {
  await mongoose.connect(databaseAccess, {
    dbName: process.env.DATABASE_NAME || undefined,
    autoIndex: false,
    autoCreate: false,
  });
  const { wasOn } = await switchOffAiHighlights();
  const said = wasOn
    ? `AI highlights for kids were on in "${mongoose.connection.name}": switched off. Kids see the word list's highlights only. Turn them back on from Owner settings once the measure passes.`
    : `AI highlights for kids were already off in "${mongoose.connection.name}": nothing changed.`;
  console.log(said);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n**Switch:** ${said}\n`);
} catch (error) {
  console.error(`Couldn't switch AI highlights off: ${messageOf(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
