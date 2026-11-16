import crypto from "node:crypto";

// Short-lived passes for the staging test login (controllers/testLogin.ts).
//
// The deploy workflows mint one for each QA Wolf run they start and hand it
// to QA Wolf as that run's TEST_LOGIN_SECRET. A pass says when it expires and
// is signed with TEST_LOGIN_KEY, which only GitHub's secrets and the staging
// backend know; QA Wolf never sees the key. So a pass that leaks (QA Wolf's
// pull request comments have shown run variables before) stops working
// within hours, and no one can make a new one without the key.
//
// A pass is "v1.<expiry, in Unix seconds>.<HMAC-SHA256 of 'v1.<expiry>' with
// the key, in hex>". The workflows build it with openssl (see
// .github/workflows/); mintTestPass does the same, for the tests.

const VERSION = "v1";

// The longest a pass may still have to run. The workflows mint them for 3
// hours; a pass claiming a later expiry is refused even if its signature is
// right, so a mistake with the key can't produce one that lasts for weeks.
export const MAX_PASS_SECONDS = 6 * 60 * 60;

const signature = (key: string, expiry: number) =>
  crypto.createHmac("sha256", key).update(`${VERSION}.${expiry}`).digest("hex");

export const mintTestPass = (key: string, expiry: number) =>
  `${VERSION}.${expiry}.${signature(key, expiry)}`;

// Whether `given` is a pass signed with `key` that hasn't expired, at `now`
// (Unix seconds)
export const isValidTestPass = (
  given: string,
  key: string,
  now = Math.floor(Date.now() / 1000)
) => {
  const match = /^v1\.(\d{1,12})\.([0-9a-f]{64})$/.exec(given);
  if (!match) return false;
  const expiry = Number(match[1]);
  if (expiry <= now || expiry > now + MAX_PASS_SECONDS) return false;
  // Compared in constant time, so the signature can't be guessed a character
  // at a time from how fast wrong ones are refused
  const expected = Buffer.from(signature(key, expiry), "hex");
  const actual = Buffer.from(match[2], "hex");
  return crypto.timingSafeEqual(expected, actual);
};
