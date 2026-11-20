// Fills the PRACTICE database (ShowME-dev, which local testing and staging
// share) with made-up students and sentences (utils/sampleData.ts), so every
// page has realistic things to show: the Gallery, My sentences with
// Scribbles' tips and praise, and the Teacher page with every kind of note.
//
//   npm run seed:dev                      add/refresh the sample data
//   npm run seed:dev -- --review          also have Scribbles review the
//                                         waiting sample sentences now
//   npm run seed:dev -- --admin <email>   also make that practice profile an admin
//   npm run seed:dev -- --demo <email>    also give that account sample
//                                         sentences in every state, and make
//                                         it a teacher (it must have signed in)
//
// Run on staging by the "Fill staging with sample data" workflow.
//
// Safety lock: it only runs when DATABASE_NAME names a database other than
// the production one, and it only ever deletes the sample data it created
// itself (emails ending in @seed.example).
// Settings come from Node's built-in --env-file flags in package.json:
// .env first, then .env.local, whose DATABASE_NAME wins.
import mongoose from "mongoose";
import Profile from "../models/profile.js";
import { SAMPLE_SENTENCES, seedDemoAccount, seedSampleData } from "../utils/sampleData.js";
import { reviewWaitingSentences } from "../reviewer/queue.js";
import { reviewerSetup } from "../reviewer/settings.js";
import { messageOf } from "../utils/errors.js";

const PRODUCTION_DB = "ShowME";

const dbName = process.env.DATABASE_NAME;
if (!dbName || dbName === PRODUCTION_DB) {
  console.error(
    `Refusing to run: DATABASE_NAME is "${dbName ?? "(not set)"}". ` +
      "Set DATABASE_NAME=ShowME-dev in .env.local so this can never touch production."
  );
  process.exit(1);
}
const databaseAccess = process.env.DATABASE_ACCESS;
if (!databaseAccess) {
  console.error("Can't run: DATABASE_ACCESS (from .env) is not set.");
  process.exit(1);
}

// The value after a flag, if given
const flag = (name: string) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1]?.trim() || undefined;
};

const seed = async () => {
  const { students, waiting } = await seedSampleData();
  const count = (key: "approved" | "redo" | "waiting") => SAMPLE_SENTENCES.filter(([, , , state]) => key in state).length;
  console.log(
    `Seeded ${students} students: ${count("approved")} approved, ` +
      `${count("redo")} sent back with a tip, ${count("waiting")} waiting for review.`
  );

  // The email is never printed: the run's log may be read by others
  const demo = flag("--demo");
  if (demo) {
    const result = await seedDemoAccount(demo);
    if (!result) {
      console.error("No account with that email here yet: sign in to staging with it once, then run this again.");
      process.exitCode = 1;
    } else {
      console.log(
        `The demo account got ${result.added} sample sentences and is a teacher` +
          (result.skipped ? ` (${result.skipped} skipped: it already wrote for those Tells).` : ".")
      );
      waiting.push(...result.waiting);
    }
  }

  if (process.argv.includes("--review")) {
    // Scribbles reviews just the waiting sample sentences, as the scheduled
    // reviewer would (reviewer/queue.ts). Needs REVIEWER_MODE=suggest and the
    // Cloudflare keys; otherwise the scheduled reviewer does it later.
    const setup = reviewerSetup();
    if (setup.mode === "off" || !setup.safety || setup.providers.length === 0) {
      console.log("The reviewer isn't set up here, so Scribbles will review them on a later scheduled run.");
      return;
    }
    const { reviewed } = await reviewWaitingSentences(setup, { limit: waiting.length, only: { _id: { $in: waiting } } });
    console.log(`Scribbles reviewed ${reviewed} of the ${waiting.length} waiting sample sentences.`);
    if (reviewed < waiting.length) {
      console.log("The rest will be reviewed on a later scheduled run.");
    }
  }
};

const makeAdmin = async (email: string) => {
  const result = await Profile.updateOne({ email }, { $set: { isAdmin: true } });
  if (result.matchedCount === 0) {
    console.error(`No profile with email ${email} in ${dbName}. Log in once locally first.`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now an admin in ${dbName}.`);
  }
};

try {
  await mongoose.connect(databaseAccess, { dbName });
  console.log(`Connected to database "${mongoose.connection.name}".`);
  await seed();
  const adminFlag = process.argv.indexOf("--admin");
  if (adminFlag !== -1) {
    await makeAdmin(process.argv[adminFlag + 1]);
  }
} catch (error) {
  console.error(messageOf(error));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
