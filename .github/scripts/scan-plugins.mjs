// Scans the Claude skills, agents, commands and plugins this repo uses, with
// NVIDIA SkillSpector, and writes a report. Run by
// .github/workflows/scan-plugins.yml. Needs `skillspector` and `git`.
//
//   node .github/scripts/scan-plugins.mjs [report.md]
//
// What it checks:
// 1. Every skill in .claude/skills/, and the agents, commands and references
//    folders.
// 2. .claude/settings.json: every marketplace it adds must be on GitHub (or
//    git) and pinned to one exact commit, and every plugin it turns on must
//    come from such a marketplace. Then it downloads each marketplace at that
//    commit and scans the skills inside.
//
// It fails (exit 1) when something is rated HIGH or CRITICAL, unless
// .github/plugin-review.json lists it as read by a person, with the same
// `sha256` the report prints. The sha256 is made from the files' contents, so
// when a skill changes, its old review no longer counts.
//
// Always offline (--no-llm): without that flag SkillSpector sends the files
// to an AI service.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REVIEW_FILE = ".github/plugin-review.json";
const SETTINGS_FILE = ".claude/settings.json";
// The most skills one marketplace may hold (each takes about 10 seconds)
const MAX_MARKETPLACE_SKILLS = 60;
const FAILING = new Set(["HIGH", "CRITICAL"]);
const FULL_SHA = /^[0-9a-f]{40}$/;

const reportPath = process.argv[2] ?? "plugin-scan-report.md";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-scan-"));

// Every file under a folder, as paths from that folder, in a fixed order
const filesIn = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .filter((file) => !file.split(path.sep).includes(".git"))
    .map((file) => file.split(path.sep).join("/"))
    .sort();

// One fingerprint for a folder: it changes when any file's name or contents do
const fingerprint = (dir) => {
  const hash = createHash("sha256");
  for (const file of filesIn(dir)) {
    hash.update(file + "\0");
    hash.update(fs.readFileSync(path.join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
};

let scanCount = 0;
// Runs SkillSpector on one folder and returns its JSON report, or null if it
// could not scan. (It exits 1 when it finds something: that is not an error.)
const scan = (dir, extraArgs = []) => {
  const out = path.join(tmp, `scan-${scanCount++}.json`);
  const run = spawnSync(
    "skillspector",
    ["scan", dir, "--no-llm", "--format", "json", "--output", out, ...extraArgs],
    { encoding: "utf8" }
  );
  if (!fs.existsSync(out)) {
    console.error(run.stdout, run.stderr);
    return null;
  }
  return JSON.parse(fs.readFileSync(out, "utf8"));
};

// What the report needs from one SkillSpector result
const summarize = (name, dir, result) => ({
  name,
  sha256: fingerprint(dir),
  ok: Boolean(result?.execution_successful),
  score: result?.risk_assessment?.score ?? null,
  severity: result?.risk_assessment?.severity ?? "UNKNOWN",
  issues: (result?.issues ?? []).map((issue) => ({
    severity: issue.severity,
    id: issue.id,
    what: issue.category ?? issue.pattern,
    where: `${issue.location?.file ?? "?"}:${issue.location?.start_line ?? "?"}`,
    found: String(issue.finding ?? "").replace(/\s+/g, " ").slice(0, 80),
  })),
});

const units = []; // everything scanned
const problems = []; // plain sentences: why the check fails

// 1. This repo's own skills (one scan for all of them), then the other folders
const skillsDir = ".claude/skills";
if (fs.existsSync(skillsDir)) {
  const names = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const withSkillFile = names.filter((name) =>
    fs.existsSync(path.join(skillsDir, name, "SKILL.md"))
  );
  for (const name of names) {
    if (!withSkillFile.includes(name)) {
      problems.push(`\`${skillsDir}/${name}\` has no SKILL.md, so it can't be scanned.`);
    }
  }
  if (withSkillFile.length > 0) {
    const all = scan(skillsDir, ["--recursive", "--max-skills", "200"]);
    // With a single skill in the folder, the report is that skill's own
    const results = all?.skills ?? (all ? [{ path: withSkillFile[0], ...all }] : []);
    for (const name of withSkillFile) {
      const result = results.find((skill) => skill.path === name);
      units.push(summarize(`skills/${name}`, path.join(skillsDir, name), result));
    }
  }
}
for (const folder of ["agents", "commands", "references"]) {
  const dir = path.join(".claude", folder);
  if (fs.existsSync(dir) && filesIn(dir).length > 0) {
    units.push(summarize(folder, dir, scan(dir)));
  }
}

// 2. Plugins and marketplaces turned on in .claude/settings.json
const settings = fs.existsSync(SETTINGS_FILE)
  ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))
  : {};
const marketplaces = settings.extraKnownMarketplaces ?? {};
const pinned = new Set();
for (const [name, { source = {} } = {}] of Object.entries(marketplaces)) {
  const url =
    source.source === "github" && source.repo
      ? `https://github.com/${source.repo}.git`
      : source.source === "git" && /^https:\/\//.test(source.url ?? "")
        ? source.url
        : null;
  if (!url) {
    problems.push(
      `Marketplace \`${name}\` in ${SETTINGS_FILE} is not a GitHub repo or an https git address, so it can't be pinned or scanned.`
    );
    continue;
  }
  if (!FULL_SHA.test(source.ref ?? "")) {
    problems.push(
      `Marketplace \`${name}\` in ${SETTINGS_FILE} is not pinned. Add \`"ref"\` with the full 40-letter commit that was reviewed, so the plugin can't change without a new review.`
    );
    continue;
  }
  pinned.add(name);
  // Download that one commit and scan every skill in it
  const clone = path.join(tmp, `marketplace-${pinned.size}`);
  try {
    const git = (...args) => execFileSync("git", args, { cwd: clone, stdio: "pipe" });
    fs.mkdirSync(clone);
    git("init", "-q");
    git("fetch", "-q", "--depth", "1", url, source.ref);
    git("checkout", "-q", "FETCH_HEAD");
  } catch (error) {
    problems.push(
      `Could not download marketplace \`${name}\` at ${source.ref}: ${String(error.stderr ?? error).trim().slice(0, 200)}`
    );
    continue;
  }
  const skillDirs = filesIn(clone)
    .filter((file) => path.posix.basename(file) === "SKILL.md")
    .map((file) => path.posix.dirname(file));
  if (skillDirs.length === 0) {
    problems.push(`Marketplace \`${name}\` has no SKILL.md files to scan. Read it by hand.`);
  }
  if (skillDirs.length > MAX_MARKETPLACE_SKILLS) {
    problems.push(
      `Marketplace \`${name}\` has ${skillDirs.length} skills; only the first ${MAX_MARKETPLACE_SKILLS} were scanned.`
    );
  }
  for (const dir of skillDirs.slice(0, MAX_MARKETPLACE_SKILLS)) {
    const full = path.join(clone, dir);
    units.push(summarize(`marketplace ${name}: ${dir}`, full, scan(full)));
  }
}
for (const [plugin, on] of Object.entries(settings.enabledPlugins ?? {})) {
  const marketplace = plugin.split("@")[1];
  if (on && !pinned.has(marketplace)) {
    problems.push(
      `Plugin \`${plugin}\` is turned on in ${SETTINGS_FILE}, but its marketplace is not listed there, pinned to a commit.`
    );
  }
}

// 3. Compare with the list of what a person has already read
const reviewed = fs.existsSync(REVIEW_FILE)
  ? (JSON.parse(fs.readFileSync(REVIEW_FILE, "utf8")).reviewed ?? {})
  : {};
for (const unit of units) {
  const review = reviewed[unit.name];
  unit.status = !unit.ok
    ? "scan failed"
    : !FAILING.has(unit.severity)
      ? "ok"
      : review?.sha256 === unit.sha256
        ? "reviewed"
        : review
          ? "changed since review"
          : "needs review";
  if (unit.status === "scan failed") {
    problems.push(`SkillSpector could not scan \`${unit.name}\`.`);
  } else if (unit.status === "changed since review") {
    problems.push(
      `\`${unit.name}\` is rated ${unit.severity} and has changed since it was reviewed.`
    );
  } else if (unit.status === "needs review") {
    problems.push(`\`${unit.name}\` is rated ${unit.severity} and nobody has reviewed it.`);
  }
}
for (const name of Object.keys(reviewed)) {
  if (!units.some((unit) => unit.name === name)) {
    console.log(`Note: ${REVIEW_FILE} lists "${name}", which is no longer scanned.`);
  }
}

// 4. The report
const cell = (text) => String(text).replaceAll("|", "\\|").replaceAll("`", "'");
const flagged = units.filter((unit) => unit.status !== "ok");
const lines = [
  "<!-- plugin-scan -->",
  `## Plugin and skill scan: ${problems.length ? "needs a look" : "all clear"}`,
  "",
];
if (problems.length) {
  lines.push(...problems.map((problem) => `- ${problem}`), "");
}
lines.push(
  `Scanned ${units.length} items with SkillSpector (offline). ` +
    `${units.filter((unit) => unit.status === "ok").length} rated below HIGH, ` +
    `${units.filter((unit) => unit.status === "reviewed").length} rated HIGH or CRITICAL but already read by a person and found harmless.`,
  ""
);
for (const unit of flagged) {
  lines.push(
    `### \`${unit.name}\`: ${unit.severity} (${unit.score ?? "?"}/100), ${unit.status}`,
    ""
  );
  if (unit.status !== "reviewed") {
    lines.push("| Level | Rule | What | Where | Matched text |", "|---|---|---|---|---|");
    for (const issue of unit.issues.slice(0, 25)) {
      lines.push(
        `| ${issue.severity} | ${issue.id} | ${cell(issue.what)} | \`${cell(issue.where)}\` | \`${cell(issue.found)}\` |`
      );
    }
    if (unit.issues.length > 25) lines.push("", `…and ${unit.issues.length - 25} more.`);
    lines.push(
      "",
      `Read the flagged lines. If they are harmless, add this to \`reviewed\` in \`${REVIEW_FILE}\` and say why:`,
      "",
      "```json",
      `${JSON.stringify(unit.name)}: {`,
      `  "sha256": "${unit.sha256}",`,
      `  "date": "${new Date().toISOString().slice(0, 10)}",`,
      `  "why": "…"`,
      "}",
      "```",
      ""
    );
  }
}
lines.push(
  "<details><summary>Every item</summary>",
  "",
  "| Item | Rating | Score | Status |",
  "|---|---|---|---|",
  ...units.map(
    (unit) => `| \`${unit.name}\` | ${unit.severity} | ${unit.score ?? "?"} | ${unit.status} |`
  ),
  "",
  "</details>",
  ""
);
const report = lines.join("\n");
fs.writeFileSync(reportPath, report);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
console.log(report);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(problems.length ? 1 : 0);
