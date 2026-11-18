// Short-lived passes for the staging test login, the door QA Wolf's flows
// sign in through (backend/controllers/testLogin.ts).
//
// A pass is "v1.<expiry, in Unix seconds>.<HMAC-SHA256 of 'v1.<expiry>'
// keyed with TEST_LOGIN_KEY, in hex>", exactly as backend/utils/testPass.ts
// builds and checks it. Only GitHub's secrets and the staging backend hold
// TEST_LOGIN_KEY; QA Wolf only ever gets passes, which expire. So a pass
// that leaks (QA Wolf's pull request comments have shown run variables)
// soon stops working, and no one can make a new one without the key.
//
// Two ways to hand QA Wolf a pass, both as the flows' TEST_LOGIN_SECRET:
//
//   node test-login-pass.mjs save
//     Saves a 4-hour pass as the TEST_LOGIN_SECRET variable of QA Wolf's
//     staging environment, so every run there can sign in, however it was
//     started: by a deploy, by hand, or by the QA Wolf AI. Run every hour
//     (refresh-qawolf-test-pass.yml) and after each staging deploy.
//     Needs TEST_LOGIN_KEY and QAWOLF_API_KEY.
//
//   node test-login-pass.mjs output
//     Writes a 3-hour pass to GITHUB_OUTPUT as `variables`, the JSON the
//     notify-qawolf-on-deploy action passes to the runs that deployment
//     starts (used for pull request previews, whose environments are copies
//     made when the pull request opened). Without TEST_LOGIN_KEY it leaves
//     the pass out and warns, so the runs fall back to the environment's
//     variable. With APPROVED_PREVIEW_URL it also sends that address as
//     TEST_LOGIN_APPROVED_PREVIEW_URL, which some flows check before using
//     the test login on a preview.
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
const SAVED_PASS_HOURS = 4; // refreshed hourly, so it outlives a late run
const DEPLOY_PASS_HOURS = 3; // the backend refuses passes over 6 hours

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
const saveToQaWolf = async (pass) => {
  const apiKey = process.env.QAWOLF_API_KEY;
  if (!apiKey) fail("QAWOLF_API_KEY is not set");

  const body = JSON.stringify({
    json: {
      workspaceId: WORKSPACE_ID,
      environmentId: QAWOLF_ENVIRONMENT,
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
            Authorization: `Bearer ${apiKey}`,
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

const mode = process.argv[2];
if (mode === "save") {
  const key = keyOrUndefined();
  if (!key) fail("TEST_LOGIN_KEY is not set");
  await saveToQaWolf(mintPass(key, SAVED_PASS_HOURS));
  console.log(
    `Saved a ${SAVED_PASS_HOURS}-hour test-login pass as ${VARIABLE} in QA Wolf's ${QAWOLF_ENVIRONMENT} environment.`
  );
} else if (mode === "output") {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) fail("GITHUB_OUTPUT is not set");
  const key = keyOrUndefined();
  const variables = {};
  if (key) {
    variables[VARIABLE] = mintPass(key, DEPLOY_PASS_HOURS);
  } else {
    console.log(
      `::warning::No TEST_LOGIN_KEY secret: the runs use the ${VARIABLE} saved in QA Wolf`
    );
  }
  // Some flows only use the test login on a preview whose address is also
  // given here, so a pass can't be pointed at some other site by mistake
  const previewUrl = process.env.APPROVED_PREVIEW_URL;
  if (previewUrl) variables[PREVIEW_VARIABLE] = previewUrl;
  appendFileSync(outputFile, `variables=${JSON.stringify(variables)}\n`);
} else {
  fail("Usage: node test-login-pass.mjs save|output");
}
