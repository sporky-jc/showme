// Whether the sense tagger runs, from the backend's settings (.env, written
// by the deploy workflows: .github/scripts/reviewer-env.sh). It runs only
// when SENSE_TAGGER is "on" and the Cloudflare account and token are set
// (the same ones Scribbles uses); otherwise it's off, and nothing changes.
import type { TaggerSettings } from "./tagger.js";

export const taggerSetup = (env = process.env): TaggerSettings | null => {
  if (env.SENSE_TAGGER !== "on") return null;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_TOKEN;
  return accountId && token ? { accountId, token } : null;
};
