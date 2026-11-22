// Settings come from .env (and .env.local in the emulator). Firebase loads
// them into process.env before this file runs, both when deployed and in the
// emulator, so no library is needed here.
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/logger";
import mongoose from "mongoose";
import app from "./app.js";
import { connectWithRetry } from "./config/db.js";
import { RUN_DEADLINE_MS as REVIEW_DEADLINE_MS, reviewWaitingSentences } from "./reviewer/queue.js";
import { reviewerSetup } from "./reviewer/settings.js";
import { tagApprovedSentences } from "./tagger/queue.js";
import { taggerSetup } from "./tagger/settings.js";
import { readOwnerSettings } from "./models/ownerSettings.js";

mongoose.set("strictQuery", false);
// Connect to mongodb via mongoose. DATABASE_NAME overrides the database in the
// connection string; set it in .env.local so only the emulator uses the dev DB.
// Requests that arrive before the connection is ready wait for it (mongoose
// holds them for up to 10 seconds), so the function can start serving at once.
const databaseAccess = process.env.DATABASE_ACCESS;
if (databaseAccess) {
  connectWithRetry(() =>
    mongoose.connect(databaseAccess, {
      dbName: process.env.DATABASE_NAME,
      // Give up on one attempt after 10s (default 30s), so a retry comes sooner
      serverSelectionTimeoutMS: 10000,
    })
  );
} else {
  logger.error("DATABASE_ACCESS is not set; the database is unavailable.");
}

// 2nd generation: one instance serves many requests at once.
export const apiv2 = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    // Up to 80 requests share one instance before another one starts.
    concurrency: 80,
    // A spending cap: never run more than 10 instances, whatever the traffic.
    maxInstances: 10,
  },
  app
);

// Every 10 minutes: the sense tagger, then Scribbles the reviewer.
//
// Scribbles the reviewer: suggestions for the sentences
// waiting for the teacher (reviewer/queue.ts). It does nothing unless
// REVIEWER_MODE is "suggest" and a provider is set up, and nothing while a
// teacher has paused it from the Teacher page; and nothing it does
// changes what students or the gallery see. Google's Cloud Scheduler runs
// it (free for up to 3 schedules per billing account).
export const reviewer = onSchedule(
  {
    schedule: "every 10 minutes",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 300,
    // One run at a time
    maxInstances: 1,
    // A missed run is simply picked up by the next one
    retryCount: 0,
  },
  async () => {
    // The sense tagger first (tagger/queue.ts): highlights for approved
    // sentences, from two models that must agree. It runs whether or not
    // Scribbles is on, only while the owner's switch is on (Owner settings
    // on the Teacher page) and the Cloudflare keys are set, and starts no
    // new sentence after 45 seconds. Scribbles gets the rest of its 240.
    const started = Date.now();
    const tagger = taggerSetup();
    if (tagger && (await readOwnerSettings()).senseTagger) {
      const { tagged, unreadable, stopped } = await tagApprovedSentences(tagger);
      if (tagged > 0 || stopped) {
        logger.info(
          `Sense tagger saved ${tagged} sentence(s)${unreadable ? `, ${unreadable} with unreadable answers` : ""}${stopped ? `, stopped: ${stopped}` : ""}`
        );
      }
    }

    const setup = reviewerSetup();
    if (setup.mode === "off") return;
    // No new review starts after 240 seconds (RUN_DEADLINE_MS), well inside
    // the 300 above
    const { reviewed, stopped } = await reviewWaitingSentences(setup, {
      deadlineMs: Math.max(0, REVIEW_DEADLINE_MS - (Date.now() - started)),
    });
    // Paused from the Teacher page before anything was saved: the reviewer
    // has already said so, in one line
    if (stopped === "paused" && reviewed === 0) return;
    logger.info(`Reviewer saved ${reviewed} suggestion(s)${stopped ? `, stopped early: ${stopped}` : ""}`);
  }
);
