// The line test on staging (spec/SPEC-line-testing.md):
//
//   node lib/scripts/line-test.js put smoke        put the 10-row smoke set on staging
//   node lib/scripts/line-test.js put decide-set   put the whole made-up set on staging
//   node lib/scripts/line-test.js report           how the line settled each row
//   node lib/scripts/line-test.js clear            take it all away again
//
// Run by the "Line test on staging" workflow. Made-up sentences only, under
// made-up students (emails ending in @linetest.example). The report gives
// row numbers and outcomes, never a sentence's words.
//
// Safety lock, as seed-dev.ts: it only runs on a database other than the
// production one.
import mongoose from "mongoose";
import { clearLineTest, lineTestReport, putLineTest, reportMarkdown } from "../reviewer/eval/lineTest.js";
import { LINE_TEST_SETS, type LineTestSet } from "../reviewer/eval/lineTestSets.js";
import { messageOf } from "../utils/errors.js";

const PRODUCTION_DB = "ShowME";

const dbName = process.env.DATABASE_NAME;
if (!dbName || dbName === PRODUCTION_DB) {
  console.error(`Refusing to run: DATABASE_NAME is "${dbName ?? "(not set)"}". This only runs on the practice database.`);
  process.exit(1);
}
const databaseAccess = process.env.DATABASE_ACCESS;
if (!databaseAccess) {
  console.error("Can't run: DATABASE_ACCESS is not set.");
  process.exit(1);
}

const [action, set] = process.argv.slice(2);

const run = async () => {
  switch (action) {
    case "put": {
      if (!(set in LINE_TEST_SETS)) throw new Error(`Which set? One of: ${Object.keys(LINE_TEST_SETS).join(", ")}`);
      const { put, cleared } = await putLineTest(set as LineTestSet);
      console.log(`Put ${put} made-up sentences on staging (cleared ${cleared.sentences} from an earlier test).`);
      break;
    }
    case "report":
      console.log(reportMarkdown(await lineTestReport()));
      break;
    case "clear": {
      const { sentences } = await clearLineTest();
      console.log(`Took away ${sentences} made-up sentences and their line records.`);
      break;
    }
    default:
      throw new Error("Say put <set>, report or clear.");
  }
};

mongoose
  .connect(databaseAccess, { dbName, serverSelectionTimeoutMS: 10000 })
  .then(run)
  .catch((error) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
