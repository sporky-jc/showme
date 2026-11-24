// Feature flags: things that are still being tried out. Each one is off
// unless this backend's FEATURES setting names it, so production stays
// simple and staging can try them.
//
// FEATURES is a list of names with commas between them, written into .env by
// each deploy workflow (.github/scripts/reviewer-env.sh): staging's lists the
// features to try, production's is empty. The website asks GET /features
// once when it opens and shows only what is on (client/src/features.ts).
//
// To add a flag: add its name here, then use it on the website (and here, if
// the server does something for it). To try it, add its name to staging's
// FEATURES in .github/workflows/test-and-deploy-staging.yml.
//
// The AI reviewer has its own setting, REVIEWER_MODE (reviewer/settings.ts).
export const FEATURES = [
  // Sense words lit up in the gallery and on a picture's frame, with the
  // row of sense dots and the "find by sense" buttons
  "senseHighlights",
  // The sense buttons and Scribbles' sense tips on the Write page, and his
  // sense tip on the home page
  "senseCoach",
] as const;

export type Feature = (typeof FEATURES)[number];
export type Features = Record<Feature, boolean>;

// Which features are on here. A name FEATURES doesn't list is ignored.
export const features = (env: NodeJS.ProcessEnv = process.env): Features => {
  const on = new Set((env.FEATURES ?? "").split(",").map((name) => name.trim()));
  return Object.fromEntries(FEATURES.map((name) => [name, on.has(name)])) as Features;
};
