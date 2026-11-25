// A Claude Code hook (see "hooks" in .claude/settings.json). Runs just
// before Claude edits or writes a file, and stops it for two kinds of file:
//
// - Secret settings (.env, .env.local, .env.staging, Google credentials):
//   they hold real keys, and are never committed.
// - package-lock.json: npm writes it. A hand edit can leave it out of step
//   with package.json.
//
// Claude Code sends the tool call as JSON on standard input. Exit code 2
// stops the call and shows Claude the message; 0 lets it through.

import path from "node:path";

let input = {};
try {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  input = JSON.parse(text);
} catch {
  process.exit(0); // not a tool call we understand: don't get in the way
}

const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
// Windows paths use backslashes
const name = path.posix.basename(String(file).replaceAll("\\", "/"));

const isExample = /\.(example|sample|template)$/.test(name);
if ((/^\.env(\..+)?$/.test(name) && !isExample) || /^gha-creds-.*\.json$/.test(name)) {
  console.error(
    `Stopped: ${name} holds secrets, so Claude does not edit it. ` +
      "Tell the person which setting to add or change, and let them do it."
  );
  process.exit(2);
}
if (name === "package-lock.json") {
  console.error(
    "Stopped: package-lock.json is written by npm, not by hand. " +
      "Change package.json (or run npm install) and let npm update it."
  );
  process.exit(2);
}
process.exit(0);
