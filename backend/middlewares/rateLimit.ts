import type { Request } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";
import { readSession } from "./auth.js";

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
