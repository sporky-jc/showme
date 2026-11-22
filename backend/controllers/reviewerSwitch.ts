import type { Request, Response } from "express";
import { ReviewerStatus, ReviewerSwitchBody } from "../contract/api.js";
import { readReviewerSwitch, setReviewerPaused } from "../models/reviewerSwitch.js";
import { reviewerMode } from "../reviewer/settings.js";
import { isTestAccount } from "../config/testAccounts.js";
import { answer } from "../utils/answer.js";
import { firstProblem, messageOf } from "../utils/errors.js";

// The Teacher page's off switch for Scribbles (models/reviewerSwitch.ts).
// The admin middleware on these routes has already checked isAdmin.

// Scribbles' mode as the deploy set it, and whether he's paused
export const getReviewerStatus = async (req: Request, res: Response) => {
  try {
    answer(res, 200, ReviewerStatus, { mode: reviewerMode(), ...(await readReviewerSwitch()) });
  } catch (error) {
    // Saved for this request's log line (see middlewares/requestLog.ts)
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

// Pauses Scribbles, or turns him back on. Who did it, and when, is in the
// request's log line (its userId, see middlewares/requestLog.ts).
export const updateReviewerSwitch = async (req: Request, res: Response) => {
  try {
    // The switch is one for the whole site, every teacher's sentences
    // included, while the test admin (QA Wolf's browser tests) only ever
    // sees test accounts' sentences. A test run mustn't be able to stop
    // Scribbles for real teachers, so the test admin may look but not
    // flip it.
    if (isTestAccount(req.userId)) {
      return res.status(403).json({ message: "Test accounts can't pause Scribbles." });
    }
    const body = ReviewerSwitchBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    const stored = await setReviewerPaused(body.data.paused);
    answer(res, 200, ReviewerStatus, { mode: reviewerMode(), ...stored });
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};
