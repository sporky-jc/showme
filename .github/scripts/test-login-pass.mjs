// Short-lived passes for the staging test login, the door QA Wolf's flows
// sign in through (backend/controllers/testLogin.ts).
//
// A pass is "v1.<expiry, in Unix seconds>.<HMAC-SHA256 of 'v1.<expiry>'
// keyed with TEST_LOGIN_KEY, in hex>", exactly as backend/utils/testPass.ts
// builds and checks it. Only GitHub's secrets and the staging backend hold
// TEST_LOGIN_KEY; QA Wolf only ever gets passes, which expire.
//
// A pass is only ever saved as a QA Wolf environment variable, never sent
// with a deployment: QA Wolf writes a deployment's variables into the "run
// tests" link of its pull request comment, and this repository is public.
// Environment variables stay inside QA Wolf.
//
// Two modes, both saving a pass as the flows' TEST_LOGIN_SECRET:
//
//   node test-login-pass.mjs save
//     Saves a 24-hour pass in QA Wolf's staging environment, so every run
//     there can sign in, however it was started: by a deploy, by hand, or by
//     the QA Wolf AI. Run every hour (refresh-qawolf-test-pass.yml) and after
//     each staging deploy. Needs TEST_LOGIN_KEY and QAWOLF_API_KEY.
//
//   node test-login-pass.mjs pr
//     For a pull request preview, just before telling QA Wolf about it. QA
//     Wolf gives each pull request its own environment, copied from staging
//     when the first preview of it is tested. If that environment exists
//     (PR_ENVIRONMENT_NAME), a 24-hour pass is saved in it; if not yet, in
//     staging, so the copy starts with a fresh one. Then writes to
//     GITHUB_OUTPUT, as `variables`, the JSON for the deployment: only
//     TEST_LOGIN_APPROVED_PREVIEW_URL (from APPROVED_PREVIEW_URL), which some
//     flows check before using the test login on a preview. Not secret.
//     Needs TEST_LOGIN_KEY and QAWOLF_API_KEY: without them the step fails
//     rather than send a pass anywhere it would show.
//
// The key is read from the environment, never from the command line, where
// it would show in the runner's process list. In GitHub Actions the pass is
// masked before anything else is printed, so it never appears in the logs.
// No dependencies; needs Node 18+ (fetch).

import { createHmac } from "node:crypto";
import { appendFileSync } from "node:fs";

const WORKSPACE_ID = "xoniuprcn2am5nh63rx8fn6cotea"; // not a secret
// QA Wolf's address. QAWOLF_HOST_URL overrides it, as it does for QA Wolf's
// own CLI; the tests point it at a stand-in server.
const QAWOLF_HOST = process.env.QAWOLF_HOST_URL ?? "https://app.qawolf.com";
const QAWOLF_ENVIRONMENT = "staging"; // the QA Wolf environment's alias
const VARIABLE = "TEST_LOGIN_SECRET"; // the name the flows read
// The preview the pass is for (output mode, from APPROVED_PREVIEW_URL)
const PREVIEW_VARIABLE = "TEST_LOGIN_APPROVED_PREVIEW_URL";
const MIN_KEY_LENGTH = 32; // as the backend requires
// The refresh is scheduled hourly, but GitHub has run it only every 6 to 10
// hours, so a saved pass has to outlast the longest gap between runs. (The
// backend refuses passes over 26 hours.)
const SAVED_PASS_HOURS = 24;

const fail = (message) => {
  console.log(`::error::${message}`);
  process.exit(1);
};

const mintPass = (key, hours) => {
  const expiry = Math.floor(Date.now() / 1000) + hours * 60 * 60;
  const signature = createHmac("sha256", key)
    .update(`v1.${expiry}`)
    .digest("hex");
  const pass = `v1.${expiry}.${signature}`;
  // Hide it in this job's log output from here on
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::add-mask::${pass}`);
  return pass;
};

const keyOrUndefined = () => {
  const key = process.env.TEST_LOGIN_KEY ?? "";
  if (key === "") return undefined;
  if (key.length < MIN_KEY_LENGTH) {
    fail(`TEST_LOGIN_KEY must be at least ${MIN_KEY_LENGTH} characters`);
  }
  return key;
};

// Saves the variable through QA Wolf's public API (the same operation as
// `qawolf environment setVariable`). Retries network errors and server
// errors a few times; a refusal (4xx) is final. QA Wolf never sends the
// value back, so nothing secret is printed.
const apiKey = () => process.env.QAWOLF_API_KEY || fail("QAWOLF_API_KEY is not set");

const saveToQaWolf = async (pass, environmentId) => {
  const body = JSON.stringify({
    json: {
      workspaceId: WORKSPACE_ID,
      environmentId,
      name: VARIABLE,
      value: pass,
    },
  });
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(
        `${QAWOLF_HOST}/api/trpc/public.environment.setVariable`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey()}`,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (response.ok) return;
      const reason = `QA Wolf answered ${response.status}: ${(await response.text()).slice(0, 300)}`;
      if (response.status < 500) fail(reason);
      console.log(`::warning::${reason} (attempt ${attempt})`);
    } catch (error) {
      console.log(`::warning::Could not reach QA Wolf: ${error.message} (attempt ${attempt})`);
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
    }
  }
  fail("Could not save the test-login pass in QA Wolf");
};


// A read call to QA Wolf's public API (the input goes in the address as
// { json }), with the same retries as saving
const readQaWolf = async (procedure, input) => {
  const url = `${QAWOLF_HOST}/api/trpc/public.${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey()}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        const body = await response.json();
        return body.result?.data?.json ?? body.result?.data;
      }
      const reason = `QA Wolf answered ${response.status}: ${(await response.text()).slice(0, 300)}`;
      if (response.status < 500) fail(reason);
      console.log(`::warning::${reason} (attempt ${attempt})`);
    } catch (error) {
      console.log(`::warning::Could not reach QA Wolf: ${error.message} (attempt ${attempt})`);
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
    }
  }
  fail(`Could not read ${procedure} from QA Wolf`);
};

// The id of the pull request's own QA Wolf environment (named like
// "Sporky-jc-showme-pr-115"), or undefined if QA Wolf hasn't made it yet
const findPrEnvironment = async (name) => {
  let cursor;
  for (let page = 0; page < 5; page++) {
    const { environments = [], nextCursor } = await readQaWolf("environment.find", {
      workspaceId: WORKSPACE_ID,
      kind: "preview",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    const match = environments.find(
      (environment) =>
        environment.name?.toLowerCase() === name.toLowerCase() && !environment.terminatedAt
    );
    if (match) return match.id;
    if (!nextCursor) return undefined;
    cursor = nextCursor;
  }
  return undefined;
};

const mode = process.argv[2];
if (mode === "save") {
  const key = keyOrUndefined();
  if (!key) fail("TEST_LOGIN_KEY is not set");
  await saveToQaWolf(mintPass(key, SAVED_PASS_HOURS), QAWOLF_ENVIRONMENT);
  console.log(
    `Saved a ${SAVED_PASS_HOURS}-hour test-login pass as ${VARIABLE} in QA Wolf's ${QAWOLF_ENVIRONMENT} environment.`
  );
} else if (mode === "pr") {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) fail("GITHUB_OUTPUT is not set");
  const key = keyOrUndefined();
  if (!key) fail("TEST_LOGIN_KEY is not set");
  const name = process.env.PR_ENVIRONMENT_NAME;
  if (!name) fail("PR_ENVIRONMENT_NAME is not set");
  const prEnvironment = await findPrEnvironment(name);
  await saveToQaWolf(mintPass(key, SAVED_PASS_HOURS), prEnvironment ?? QAWOLF_ENVIRONMENT);
  console.log(
    prEnvironment
      ? `Saved a ${SAVED_PASS_HOURS}-hour test-login pass as ${VARIABLE} in QA Wolf's ${name} environment.`
      : `QA Wolf has no ${name} environment yet: saved a ${SAVED_PASS_HOURS}-hour test-login pass in ${QAWOLF_ENVIRONMENT}, which it is copied from.`
  );
  // Only what isn't secret goes with the deployment (see the top of this file)
  const variables = {};
  const previewUrl = process.env.APPROVED_PREVIEW_URL;
  if (previewUrl) variables[PREVIEW_VARIABLE] = previewUrl;
  appendFileSync(outputFile, `variables=${JSON.stringify(variables)}\n`);
} else {
  fail("Usage: node test-login-pass.mjs save|pr");
}
