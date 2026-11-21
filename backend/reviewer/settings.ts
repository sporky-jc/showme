// Which reviewer runs, from the backend's settings (.env, written by the
// deploy from GitHub secrets and variables). Read each time, so a test can
// set its own. Nothing is set: the reviewer is off.
import type { ReviewProvider, SafetyCheck, WelfareCheck } from "./reviewer.js";
import { cloudflareReviewer, cloudflareSafety, cloudflareWelfare } from "./providers/cloudflare.js";
import { groqReviewer } from "./providers/groq.js";
import { REVIEWER_MODES, type ReviewerMode } from "./contract.js";

// The modes (off, suggest) are listed in contract.ts, so the API contract
// can send the mode to the Teacher page (GET /Admin/reviewer)
export { REVIEWER_MODES, type ReviewerMode };

export const reviewerMode = (env = process.env): ReviewerMode =>
  (REVIEWER_MODES as readonly string[]).includes(env.REVIEWER_MODE ?? "") ? (env.REVIEWER_MODE as ReviewerMode) : "off";

export interface ReviewerSetup {
  mode: ReviewerMode;
  safety?: SafetyCheck;
  // On whenever the Cloudflare reviewer is: without it, every sentence the
  // AI would read is held as worrying (reviewer.ts), so the queue reviews
  // nothing (queue.ts)
  welfare?: WelfareCheck;
  providers: ReviewProvider[];
}

export const reviewerSetup = (env = process.env): ReviewerSetup => {
  const mode = reviewerMode(env);
  const providers: ReviewProvider[] = [];
  let safety: SafetyCheck | undefined;
  let welfare: WelfareCheck | undefined;

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_TOKEN;
  if (accountId && token) {
    safety = cloudflareSafety({ accountId, token });
    welfare = cloudflareWelfare({ accountId, token });
    providers.push(cloudflareReviewer({ accountId, token, model: env.CLOUDFLARE_REVIEW_MODEL || undefined }));
  }

  // Groq only when asked for: its terms don't allow data about children
  // under 13 (providers/groq.ts)
  if (env.GROQ_API_KEY && env.REVIEWER_USE_GROQ === "yes") {
    providers.push(groqReviewer({ apiKey: env.GROQ_API_KEY }));
  }

  return { mode, safety, welfare, providers };
};
