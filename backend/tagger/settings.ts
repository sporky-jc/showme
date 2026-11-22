// The Cloudflare account and token the sense tagger uses (the same ones
// Scribbles uses), from the backend's settings (.env, written by the deploy
// workflows: .github/scripts/reviewer-env.sh). Whether it runs is the
// owner's switch (models/ownerSettings.ts), read at each scheduled run;
// without these it can't run, whatever the switch says.
import type { TaggerSettings } from "./tagger.js";

export const taggerSetup = (env = process.env): TaggerSettings | null => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_TOKEN;
  return accountId && token ? { accountId, token } : null;
};
