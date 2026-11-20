// Gives every approved sentence that has no tip the praise tip, so students
// see Scribbles' "Great picture!" bubble on sentences approved before tips
// existed (utils/backfillPraise.ts).
//
//   node lib/scripts/backfill-praise.js            count only, changes nothing
//   node lib/scripts/backfill-praise.js --apply    give them the praise tip
//
// Run by the "Backfill the praise tip" workflow, on staging or production.
// It prints counts only, never a student's words.
import mongoose from "mongoose";
import { backfillPraise, countWithoutPraise } from "../utils/backfillPraise.js";
import { messageOf } from "../utils/errors.js";

const databaseAccess = process.env.DATABASE_ACCESS;
if (!databaseAccess) {
  console.error("Can't run: DATABASE_ACCESS is not set.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

try {
  // DATABASE_NAME picks the database, as in index.ts; without it, the one
  // named in DATABASE_ACCESS
  await mongoose.connect(databaseAccess, { dbName: process.env.DATABASE_NAME || undefined });
  console.log(`Connected to database "${mongoose.connection.name}".`);

  const { approved, withoutTip } = await countWithoutPraise();
  console.log(`${approved} approved sentences, ${withoutTip} of them without a tip.`);

  if (!apply) {
    console.log("Counted only, nothing changed. Run with --apply to give them the praise tip.");
  } else {
    console.log(`Gave ${await backfillPraise()} approved sentences the praise tip.`);
  }
} catch (error) {
  console.error(messageOf(error));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
