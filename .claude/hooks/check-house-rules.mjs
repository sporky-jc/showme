// A Claude Code hook (see "hooks" in .claude/settings.json). Runs when
// Claude finishes a turn. If client/src changed since the last check, it
// runs the fast house-rule checks, so a slip shows up now and not in CI:
//
// - client/src/wording.test.ts: American spelling, short plain words
// - client/src/theme/contrast.test.ts: colors readable on their backgrounds
// - ESLint on the changed files
//
// Takes about 3 seconds, and nothing when client/src has not changed.
// Exit code 2 tells Claude what failed, so it fixes it before stopping;
// 0 means all is well (or there was nothing to check).

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let input = {};
try {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  input = JSON.parse(text);
} catch {
  // Run by hand, with nothing on standard input: check anyway
}
// Claude is already answering this hook's last report: don't ask twice in a
// row (CI still checks everything)
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const client = path.join(root, "client");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

let state, changed, gitDir;
try {
  // What client/src looks like now: the committed files plus edits not yet
  // committed
  const committed = git("rev-parse", "HEAD:client/src").trim();
  const status = git("status", "--porcelain", "--", "client/src");
  const edits = git("diff", "HEAD", "--", "client/src");
  state = createHash("sha256").update(committed + status + edits).digest("hex");
  changed = status
    .split("\n")
    .filter((line) => line && !line.startsWith(" D") && !line.startsWith("D"))
    .map((line) => line.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""));
  gitDir = path.resolve(root, git("rev-parse", "--git-dir").trim());
} catch {
  process.exit(0); // not a git checkout, or no client/src: nothing to check
}

// Remembered between turns, inside .git so it is never committed
const memory = path.join(gitDir, "claude-house-rules-checked");
const last = fs.existsSync(memory) ? fs.readFileSync(memory, "utf8") : null;
if (last === state) process.exit(0);
// First run in this checkout with nothing edited: just remember the state
if (last === null && changed.length === 0) {
  fs.writeFileSync(memory, state);
  process.exit(0);
}
// The client's tools are not installed (npm install not run): can't check
if (!fs.existsSync(path.join(client, "node_modules", ".bin"))) process.exit(0);

const run = (args) =>
  spawnSync("npx", ["--no-install", ...args], {
    cwd: client,
    encoding: "utf8",
    shell: process.platform === "win32", // npx is npx.cmd on Windows
    timeout: 60_000,
  });
const failures = [];

const tests = run(["vitest", "run", "src/wording.test.ts", "src/theme/contrast.test.ts"]);
if (tests.status !== 0) {
  failures.push(
    "The wording or contrast test fails (cd client && npx vitest run src/wording.test.ts src/theme/contrast.test.ts):\n" +
      (tests.stdout + tests.stderr).trim().slice(-3000)
  );
}

const toLint = changed
  .filter((file) => /^client\/src\/.*\.(ts|tsx)$/.test(file))
  .filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => file.replace(/^client\//, ""));
if (toLint.length > 0) {
  const lint = run(["eslint", ...toLint]);
  if (lint.status !== 0) {
    failures.push(
      "ESLint reports problems (cd client && npx eslint <file>):\n" +
        (lint.stdout + lint.stderr).trim().slice(-3000)
    );
  }
}

if (failures.length > 0) {
  // Not remembered: the next turn checks again
  console.error("House-rule checks failed. Fix these before finishing:\n\n" + failures.join("\n\n"));
  process.exit(2);
}
fs.writeFileSync(memory, state);
process.exit(0);
