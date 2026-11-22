import type { NextFunction, Request, Response } from "express";
import Profile from "../models/profile.js";
import { messageOf } from "../utils/errors.js";
import { isTestAccount } from "../config/testAccounts.js";

// Lets through only the site's owner: the signed-in account whose email is
// OWNER_EMAIL (a GitHub secret the deploy writes to the backend's settings,
// so no email is in the code). Used after auth and admin, for the Owner
// settings on the Teacher page. Nobody is the owner when OWNER_EMAIL isn't
// set, and a test account never is.
export const isOwnerEmail = (email: string | undefined, owner = process.env.OWNER_EMAIL) =>
  !!owner && !!email && email.trim().toLowerCase() === owner.trim().toLowerCase();

const owner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isTestAccount(req.userId)) {
      const user = await Profile.findOne({ id: req.userId }, { email: 1 }).lean<{ email?: string }>();
      if (isOwnerEmail(user?.email)) return next();
    }
    return res.status(403).json({ message: "Only the site's owner can use these settings." });
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

export default owner;
