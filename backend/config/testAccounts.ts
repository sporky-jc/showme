// Which accounts are the staging test login's (see controllers/testLogin.ts).
// Kept apart from the test login itself, with no imports, so code like the
// rate limits (middlewares/rateLimit.ts) can tell test accounts apart without
// loading the login code and Google's sign-in library with it.

// Every test account's id starts with this. Real accounts' ids are Google
// account ids, which are all digits, so none can.
export const TEST_ACCOUNT_PREFIX = "test-";
export const isTestAccount = (id: string | undefined) =>
  id?.startsWith(TEST_ACCOUNT_PREFIX) ?? false;
// Sentences written by test accounts (a sentence's GID is its author's id)
export const TEST_SENTENCES = new RegExp(`^${TEST_ACCOUNT_PREFIX}`);
