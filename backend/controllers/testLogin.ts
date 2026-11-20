import type { Request, Response } from "express";
import { TestLoginBody } from "../contract/api.js";
import Profile from "../models/profile.js";
import { Sentence } from "../models/sentences.js";
import { messageOf } from "../utils/errors.js";
import { startSession } from "./auth.js";
import { isValidTestPass } from "../utils/testPass.js";
import { TEST_ACCOUNT_PREFIX } from "../config/testAccounts.js";

// A login door for automated browser tests (QA Wolf) on the STAGING backend.
// A robot can't click through "Sign in with Google", so instead it sends a
// short-lived pass (see utils/testPass.ts) and gets logged in as one of a few
// fixed test accounts.
// With `fresh: true` it first deletes that test account's own sentences, and
// takes back every like it gave, so a test starts from a clean slate (Day 1,
// nothing liked) every run; the app itself has no way to delete a sentence.
//
// Each browser test that wipes sentences gets its own student account, so
// tests running at the same time can't wipe each other's sentences.
//
// The door is shut (the route answers 404, as if it didn't exist) unless ALL
// of these hold:
//   - TEST_LOGIN_KEY is set (only the staging deploy writes it), and is at
//     least 32 characters long, so it can't be guessed
//   - the code is not running in the production Firebase project, so even a
//     key copied there by mistake can't open it
const PRODUCTION_PROJECT = "showme-backend-789";
const MIN_KEY_LENGTH = 32;

// Every test account's id starts with TEST_ACCOUNT_PREFIX (see
// config/testAccounts.ts)
export {
  TEST_ACCOUNT_PREFIX,
  TEST_SENTENCES,
  isTestAccount,
} from "../config/testAccounts.js";

// Every test student has the same name, so pages show "Test S." whichever
// one a test uses; only the id and email (built from the role) differ
interface TestAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

const testStudent = (role: string): TestAccount => ({
  id: `${TEST_ACCOUNT_PREFIX}${role}`,
  firstName: "Test",
  lastName: "Student",
  email: `test-${role}@showme.test`,
  isAdmin: false,
});

// Every test teacher is "Test Admin"; the id and email come from the role
const testAdmin = (role: string): TestAccount => ({
  id: `${TEST_ACCOUNT_PREFIX}${role}`,
  firstName: "Test",
  lastName: "Admin",
  email: `test-${role}@showme.test`,
  isAdmin: true,
});

const TEST_ACCOUNTS: Record<string, TestAccount> = {
  student: testStudent("student"),
  "student-approve": testStudent("student-approve"),
  "student-redo": testStudent("student-redo"),
  "student-withdraw": testStudent("student-withdraw"),
  "student-pagination": testStudent("student-pagination"),
  "student-sort": testStudent("student-sort"),
  "student-double-submit": testStudent("student-double-submit"),
  "student-mobile": testStudent("student-mobile"),
  "student-likes": testStudent("student-likes"),
  // Writes a sentence and has it approved, so it needs its own account: a
  // fresh login as student-likes (the like-and-unlike test) would delete it
  "student-likes-own": testStudent("student-likes-own"),
  // A send that fails, then saves once on the retry
  "student-retry": testStudent("student-retry"),
  // The Today page: prompt, writing, and the latest sentences
  "student-today": testStudent("student-today"),
  // Two students taking turns on one device, so neither may see or change
  // the other's sentences
  "student-tablet-a": testStudent("student-tablet-a"),
  "student-tablet-b": testStudent("student-tablet-b"),
  // The Write page's sense tips and word count
  "student-senses": testStudent("student-senses"),
  // Edits a sentence while a teacher's page still shows the old words, so
  // the teacher's out-of-date Approve is refused (see ReviewBody)
  "student-stale-approval": testStudent("student-stale-approval"),
  admin: testAdmin("admin"),
  // Logs out, which ends every session of its account (see logout in
  // routes.ts), so it needs its own: logging out as "admin" would sign out
  // the other teacher tests running at the same time
  "admin-menu": testAdmin("admin-menu"),
};

// Firebase tells the code which project it's running in
const currentProject = () => {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
  } catch {
    return undefined;
  }
};

// The key that signs the short-lived passes GitHub gives QA Wolf (see
// utils/testPass.ts). It counts only if it's long enough not to be guessed.
const testLoginKey = () => {
  const key = process.env.TEST_LOGIN_KEY ?? "";
  return key.length >= MIN_KEY_LENGTH ? key : undefined;
};

const doorIsOpen = () =>
  testLoginKey() !== undefined && currentProject() !== PRODUCTION_PROJECT;

// Only a pass signed with the key that hasn't expired
const opensTheDoor = (given: string) => {
  const key = testLoginKey();
  return key !== undefined && isValidTestPass(given, key);
};

export const testLogin = async (req: Request, res: Response) => {
  if (!doorIsOpen()) {
    return res.status(404).json({ message: "Not found" });
  }

  // The pass first: if it's missing, isn't text or isn't valid, that's all the
  // sender learns (401), whatever else the request holds.
  // (The request calls it "secret", the name QA Wolf's flows send it under.)
  const secret = TestLoginBody.shape.secret.safeParse(req.body?.secret);
  if (!secret.success || !opensTheDoor(secret.data)) {
    return res.status(401).json({ message: "Invalid test login secret" });
  }

  // Then the rest, which must name one of the test accounts. Object.hasOwn,
  // so built-in names like "toString" don't count as roles.
  const body = TestLoginBody.safeParse(req.body);
  if (!body.success || !Object.hasOwn(TEST_ACCOUNTS, body.data.role)) {
    return res
      .status(400)
      .json({ message: `role must be one of: ${Object.keys(TEST_ACCOUNTS).join(", ")}` });
  }
  const { role, fresh } = body.data;
  const account = TEST_ACCOUNTS[role];

  try {
    // Only ever the test account's own sentences (matched by its fixed id),
    // both the sentences themselves and the profile's list of them, and its
    // own likes on other students' sentences
    if (fresh === true) {
      await Sentence.deleteMany({ GID: account.id });
      const existing = await Profile.findOneAndUpdate(
        { id: account.id },
        { $set: { ownSentences: [] } },
        { projection: "_id" }
      );
      if (existing) {
        await Sentence.updateMany(
          { likedBy: existing._id },
          { $pull: { likedBy: existing._id } }
        );
      }
    }

    // Create the test account the first time; reuse it after that
    const user = await Profile.findOneAndUpdate(
      { id: account.id },
      { $setOnInsert: account },
      { upsert: true, returnDocument: "after" }
    );

    startSession(res, user);
  } catch (error) {
    // Saved for this request's log line (see middlewares/requestLog.ts)
    res.locals.error = error;
    res
      .status(500)
      .json({ message: "Test login failed", error: messageOf(error) });
  }
};
