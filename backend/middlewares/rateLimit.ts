import type { Request } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";
import { readSession } from "./auth.js";
import { isTestAccount } from "../config/testAccounts.js";

// How many staging test logins the server takes in a minute, from everyone
// together: a full QA Wolf suite needs a few dozen, while a script guessing
// the secret gets nowhere. One shared count, as these requests carry no
// login to tell senders apart, and all arrive through Netlify's proxy.
export const TEST_LOGINS_PER_MINUTE = 60;
export const testLoginRateLimitStore = new MemoryStore();

export const testLoginRateLimit = rateLimit({
  store: testLoginRateLimitStore,
  windowMs: 60 * 1000,
  limit: TEST_LOGINS_PER_MINUTE,
  keyGenerator: () => "test-login",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many test logins. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many like requests (loading likes, liking, unliking) one signed-in user
// may send in a minute. Far more than anyone clicking hearts needs, while
// stopping a script from loading the database with them.
export const LIKE_REQUESTS_PER_MINUTE = 120;

// Limits each signed-in user, not each IP address: every request reaches the
// backend through Netlify's proxy (client/public/_redirects), so all students
// would share one address and one limit. It goes before the auth middleware,
// so that auth's own database lookup is limited too. So it reads the user
// from the login cookie itself: readSession checks the token's signature,
// which can't be forged, without touching the database. Requests without a
// valid login share one count; auth answers them 401 anyway.
//
// The count is kept in this server instance's memory. Cloud Functions may run
// several instances, each counting on its own, so this damps abuse rather
// than enforcing an exact limit.
// (Exported so the tests can start each test with every count at zero.)
export const likesRateLimitStore = new MemoryStore();

export const likesRateLimit = rateLimit({
  store: likesRateLimitStore,
  windowMs: 60 * 1000,
  limit: LIKE_REQUESTS_PER_MINUTE,
  keyGenerator: (req: Request) => {
    const session = readSession(req);
    return session ? `user:${session.id}` : "signed-out";
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  // These check how the IP address is read. This limiter never reads it,
  // and Netlify's forwarding headers would only make them log warnings.
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many times one signed-in user may load the Teacher page's tips
// (GET /Admin/tips) in a minute: once per page visit is all it needs. Counted
// per user from the login cookie, before auth's database lookup, the same
// way as the likes above.
export const REVIEW_TIP_REQUESTS_PER_MINUTE = 30;
export const reviewTipsRateLimitStore = new MemoryStore();

export const reviewTipsRateLimit = rateLimit({
  store: reviewTipsRateLimitStore,
  windowMs: 60 * 1000,
  limit: REVIEW_TIP_REQUESTS_PER_MINUTE,
  keyGenerator: (req: Request) => {
    const session = readSession(req);
    return session ? `user:${session.id}` : "signed-out";
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many sentences one signed-in user may save (POST and PATCH /MyPage),
// in a minute and in a day. Every save is sent to the AI reviewer, whose
// daily allowance everyone shares, so one account mustn't be able to use it
// up. A student writes one sentence a day and edits it a few times; a class
// lesson, or an automated browser test (the most a QA Wolf test saves is
// about a page of My sentences, 9), stays far below both. Counted per user
// from the login cookie, before auth's database lookup, like the likes above;
// and, like theirs, the counts are kept in each server instance's memory, so
// they damp abuse rather than enforce an exact limit. Requests without a
// valid login aren't counted: auth answers them 401, and a shared count
// would have one signed-out visitor's requests block another's with 429.
export const SENTENCE_WRITES_PER_MINUTE = 20;
export const SENTENCE_WRITES_PER_DAY = 200;
export const sentenceWritesPerMinuteStore = new MemoryStore();
export const sentenceWritesPerDayStore = new MemoryStore();

const perUser = (req: Request) => {
  const session = readSession(req);
  return session ? `user:${session.id}` : "signed-out";
};

const sentenceWritesPerMinute = rateLimit({
  store: sentenceWritesPerMinuteStore,
  windowMs: 60 * 1000,
  limit: SENTENCE_WRITES_PER_MINUTE,
  keyGenerator: perUser,
  skip: (req: Request) => !readSession(req),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many saves. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

const sentenceWritesPerDay = rateLimit({
  store: sentenceWritesPerDayStore,
  windowMs: 24 * 60 * 60 * 1000,
  limit: SENTENCE_WRITES_PER_DAY,
  keyGenerator: perUser,
  // The staging test login's accounts (ids starting "test-") are shared by
  // every run of the automated browser tests, all day long, so they would
  // add up to the daily limit where no student would. They only exist on
  // staging, which has its own reviewer allowance, and they still have the
  // per-minute limit.
  skip: (req: Request) => {
    const session = readSession(req);
    return !session || isTestAccount(session.id);
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "That's a lot of saving for one day! Try again tomorrow." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// Both limits, for POST and PATCH /MyPage (routes/routes.ts)
export const sentenceWritesRateLimit = [sentenceWritesPerMinute, sentenceWritesPerDay];

// How many times one signed-in user may pick a sentence's look in the gallery
// (PUT /MyPage/:id/look) in a minute. A student tries a few frames, never dozens a minute. Kept apart from the sentence-save limits:
// a look isn't sent to the AI reviewer, so it mustn't use up a day's saves.
export const LOOK_WRITES_PER_MINUTE = 30;
export const lookRateLimitStore = new MemoryStore();

export const lookRateLimit = rateLimit({
  store: lookRateLimitStore,
  windowMs: 60 * 1000,
  limit: LOOK_WRITES_PER_MINUTE,
  keyGenerator: perUser,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many tries. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many times one signed-in user may load or use the Teacher page's
// "Recent decisions" (GET /Admin/decisions, PATCH /Admin/undo) in a minute:
// a teacher opens the list and takes back a few decisions, never dozens a
// minute. Counted per user from the login cookie, before auth's database
// lookup, like the tips above.
export const DECISION_REQUESTS_PER_MINUTE = 30;
export const decisionsRateLimitStore = new MemoryStore();

export const decisionsRateLimit = rateLimit({
  store: decisionsRateLimitStore,
  windowMs: 60 * 1000,
  limit: DECISION_REQUESTS_PER_MINUTE,
  keyGenerator: (req: Request) => {
    const session = readSession(req);
    return session ? `user:${session.id}` : "signed-out";
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many times one signed-in user may ask how many sentences wait for
// them (GET /Admin/count, the badge on the Teacher link) in a minute. The
// site asks when a page loads, every few minutes while the tab is showing,
// and after each decision on the Teacher page: a teacher deciding quickly
// sends a few a minute, never dozens. Counted per user from the login
// cookie, before auth's database lookup, like the tips above.
export const REVIEW_COUNT_REQUESTS_PER_MINUTE = 60;
export const reviewCountRateLimitStore = new MemoryStore();

export const reviewCountRateLimit = rateLimit({
  store: reviewCountRateLimitStore,
  windowMs: 60 * 1000,
  limit: REVIEW_COUNT_REQUESTS_PER_MINUTE,
  keyGenerator: perUser,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});

// How many times one signed-in user may read or flip Scribbles' off switch
// (GET and PATCH /Admin/reviewer) in a minute. The Teacher page reads it
// once when it opens, and a teacher pauses or turns him back on now and
// then, never dozens of times a minute. Counted per user from the login
// cookie, before auth's database lookup, like the tips above.
export const REVIEWER_SWITCH_REQUESTS_PER_MINUTE = 30;
export const reviewerSwitchRateLimitStore = new MemoryStore();

export const reviewerSwitchRateLimit = rateLimit({
  store: reviewerSwitchRateLimitStore,
  windowMs: 60 * 1000,
  limit: REVIEWER_SWITCH_REQUESTS_PER_MINUTE,
  keyGenerator: perUser,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});
