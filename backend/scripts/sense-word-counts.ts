// Step 1 of the weekly sense word job (.github/workflows/sense-words.yml):
// counts the words in approved Show sentences and writes the ones it may ask
// the AI about to a JSON file (utils/senseWordCounts.ts says which). Step 2
// is client/scripts/sense-words.ts.
//
//   node lib/scripts/sense-word-counts.js <out.json>
//
// Read-only: it only ever finds. Only single words are written, never a
// sentence, a name or an account. Test accounts' sentences are left out.
import { writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { Sentence } from "../models/sentences.js";
import { TEST_SENTENCES } from "../config/testAccounts.js";
import { countWords } from "../utils/senseWordCounts.js";
import { messageOf } from "../utils/errors.js";

const databaseAccess = process.env.DATABASE_ACCESS;
const out = process.argv[2];
if (!databaseAccess || !out) {
  console.error("Can't run: needs DATABASE_ACCESS and an output file.");
  process.exit(1);
}

try {
  await mongoose.connect(databaseAccess, {
    dbName: process.env.DATABASE_NAME || undefined,
    autoIndex: false,
    autoCreate: false,
  });
  console.log(`Connected to database "${mongoose.connection.name}" (read-only).`);
  const approved = await Sentence.find({ approved: true }, { GID: 1, show: 1, title: 1 }).lean<
    { GID: string; show: string; title: string }[]
  >();
  const shows = approved
    .filter((sentence) => !TEST_SENTENCES.test(sentence.GID))
    .map((sentence) => ({ show: sentence.show, author: sentence.GID, tell: sentence.title }));
  const counts = countWords(shows);
  writeFileSync(out, JSON.stringify(counts, null, 2));
  console.log(`${shows.length} approved sentences; ${counts.length} words to ask about, in ${out}.`);
} catch (error) {
  console.error(`Couldn't count the words: ${messageOf(error)}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
