import express from "express";
import {
  getUserSentences,
  createNewUserSentence,
  editUserSentence,
  getTellSentences,
  getUserInfo,
  getPendingApprovalSentences,
  updatePendingApprovalSentences,
  getReviewTips,
  getReviewCounts,
  getRecentDecisions,
  undoDecision,
  fetchApprovedSentences,
  logoutUser,
} from "../controllers/routes.js";
import { googleAuth } from "../controllers/auth.js";
import { getReviewerStatus, updateReviewerSwitch } from "../controllers/reviewerSwitch.js";
import { testLogin } from "../controllers/testLogin.js";
import {
  getLikes,
  likeSentence,
  unlikeSentence,
} from "../controllers/likes.js";
import auth from "../middlewares/auth.js";
import admin from "../middlewares/admin.js";
import {
  decisionsRateLimit,
  likesRateLimit,
  reviewCountRateLimit,
  reviewerSwitchRateLimit,
  reviewTipsRateLimit,
  sentenceWritesRateLimit,
  testLoginRateLimit,
} from "../middlewares/rateLimit.js";

const router = express.Router();

router.get("/", getTellSentences); // Fetch Tell sentences on the home route

// Which git commit this server was deployed from (APP_VERSION is written by
// the deploy workflows). Used by "Promote to production" to know what is on
// staging and to confirm what reached production.
router.get("/version", (req, res) => {
  res.json({ version: process.env.APP_VERSION || "local" });
});

router.post("/auth", googleAuth); // Google authentication route
// Login for automated browser tests; only works on staging (see controllers/testLogin.ts)
router.post("/auth/test", testLoginRateLimit, testLogin);

// Route for create/update/fetch user sentences
router.get("/MyPage", auth, getUserSentences);
// Saving a sentence is limited per user (see middlewares/rateLimit.ts): each
// save is sent to the AI reviewer
router.post("/MyPage", sentenceWritesRateLimit, auth, createNewUserSentence);
router.patch("/MyPage", sentenceWritesRateLimit, auth, editUserSentence);

// // Route for fetching Tell sentences
// router.get("/Login", getTellSentences);
// Route for getting user info
router.get("/Login", auth, getUserInfo);

// Route for logging out user
router.post("/Logout", logoutUser);

// Route for getting sentences awaiting approval
router.get("/Admin", auth, admin, getPendingApprovalSentences);
// Route for updating status on sentences awaiting approval
router.patch("/Admin", auth, admin, updatePendingApprovalSentences);
// The sentences approved or sent back most recently, and taking one of those
// decisions back (out of the gallery, or no longer sent back), so it waits
// for review again. Protected like the decisions themselves, and limited
// per user like the tips (see middlewares/rateLimit.ts).
router.get("/Admin/decisions", decisionsRateLimit, auth, admin, getRecentDecisions);
router.patch("/Admin/undo", decisionsRateLimit, auth, admin, undoDecision);
// The tips a teacher can send back with "Try again", limited per user (see
// middlewares/rateLimit.ts)
router.get("/Admin/tips", reviewTipsRateLimit, auth, admin, getReviewTips);
// How many sentences wait for this teacher, and how many to check in on,
// for the badge on the Teacher link. Protected like the queue itself, and
// limited per user (see middlewares/rateLimit.ts): every teacher's open tab
// asks every few minutes.
router.get("/Admin/count", reviewCountRateLimit, auth, admin, getReviewCounts);
// Scribbles' off switch: whether he's on, paused or off (set by the deploy),
// and pausing him or turning him back on, at once and with no deploy (see
// models/reviewerSwitch.ts). Protected like the queue, and limited per user
// (see middlewares/rateLimit.ts). A test account may read it but not flip
// it (controllers/reviewerSwitch.ts).
router.get("/Admin/reviewer", reviewerSwitchRateLimit, auth, admin, getReviewerStatus);
router.patch("/Admin/reviewer", reviewerSwitchRateLimit, auth, admin, updateReviewerSwitch);

// Route for getting approved sentences
router.get("/Collections", fetchApprovedSentences);

// Likes on approved sentences: signed-in users only (see controllers/likes.ts),
// and limited per user (see middlewares/rateLimit.ts)
router.get("/Collections/likes", likesRateLimit, auth, getLikes);
router.put("/Collections/:id/like", likesRateLimit, auth, likeSentence);
router.delete("/Collections/:id/like", likesRateLimit, auth, unlikeSentence);

export default router;
