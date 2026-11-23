// The Cloudflare account and token the sense tagger uses, from the
// backend's settings (.env, written by the deploy workflows:
// .github/scripts/reviewer-env.sh). The sense account
// (CLOUDFLARE_SENSE_ACCOUNT_ID and CLOUDFLARE_SENSE_AI_TOKEN) when both are
// set: senses on one account, approvals (Scribbles) on another, so neither
// uses up the other's free Neurons. Otherwise the main account, the one
// Scribbles uses. Never one account's id with another's token.
//
// Whether it runs is the owner's switch (models/ownerSettings.ts), read at
// each scheduled run; without an account it can't run, whatever the switch
// says.
import type { TaggerSettings } from "./tagger.js";

export const taggerSetup = (env = process.env): TaggerSettings | null => {
  if (env.CLOUDFLARE_SENSE_ACCOUNT_ID && env.CLOUDFLARE_SENSE_AI_TOKEN) {
    return { accountId: env.CLOUDFLARE_SENSE_ACCOUNT_ID, token: env.CLOUDFLARE_SENSE_AI_TOKEN };
  }
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_TOKEN;
  return accountId && token ? { accountId, token } : null;
};
