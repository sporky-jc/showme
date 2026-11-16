import type { Request } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";

// How many like requests (loading likes, liking, unliking) one signed-in user
// may send in a minute. Far more than anyone clicking hearts needs, while
// stopping a script from loading the database with them.
export const LIKE_REQUESTS_PER_MINUTE = 120;

// Limits each signed-in user, not each IP address: every request reaches the
// backend through Netlify's proxy (client/public/_redirects), so all students
// would share one address and one limit. It goes after the auth middleware,
// which has checked the login and set req.userId.
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
  // auth runs first, so there is always a user id here
  keyGenerator: (req: Request) => req.userId ?? "",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Wait a minute, then try again." },
  // These check how the IP address is read. This limiter never reads it,
  // and Netlify's forwarding headers would only make them log warnings.
  validate: { xForwardedForHeader: false, forwardedHeader: false },
});
