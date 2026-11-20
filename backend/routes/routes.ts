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
  fetchApprovedSentences,
  logoutUser,
} from "../controllers/routes.js";
import { googleAuth } from "../controllers/auth.js";
import { testLogin } from "../controllers/testLogin.js";
import {
  getLikes,
  likeSentence,
  unlikeSentence,
} from "../controllers/likes.js";
import auth from "../middlewares/auth.js";
import admin from "../middlewares/admin.js";
import {
  likesRateLimit,
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
router.post("/MyPage", auth, createNewUserSentence);
router.patch("/MyPage", auth, editUserSentence);

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
// The tips a teacher can send back with "Try again"
router.get("/Admin/tips", auth, admin, getReviewTips);

// Route for getting approved sentences
router.get("/Collections", fetchApprovedSentences);

// Likes on approved sentences: signed-in users only (see controllers/likes.ts),
// and limited per user (see middlewares/rateLimit.ts)
router.get("/Collections/likes", likesRateLimit, auth, getLikes);
router.put("/Collections/:id/like", likesRateLimit, auth, likeSentence);
router.delete("/Collections/:id/like", likesRateLimit, auth, unlikeSentence);

export default router;
