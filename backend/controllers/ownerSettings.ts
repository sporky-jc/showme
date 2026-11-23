import type { Request, Response } from "express";
import { OwnerSettings, OwnerSettingsBody } from "../contract/api.js";
import { readOwnerSettings, saveOwnerSettings, type StoredOwnerSettings } from "../models/ownerSettings.js";
import { Sentence } from "../models/sentences.js";
import { TAGS_PER_DAY, startOfToday } from "../tagger/queue.js";
import { taggerSetup } from "../tagger/settings.js";
import { answer } from "../utils/answer.js";
import { firstProblem, messageOf } from "../utils/errors.js";

// The Owner settings on the Teacher page (GET and PATCH /Admin/owner), for
// the site's owner only (middlewares/owner.ts): the two feature flags in
// models/ownerSettings.ts. A PATCH changes the flags it names. Who changed a setting, and
// when, is in the request's log line, as for the reviewer switch.

const settingsAnswer = async (stored: StoredOwnerSettings) => {
  const now = new Date();
  const [today, last] = await Promise.all([
    Sentence.countDocuments({ taggedAt: { $gte: startOfToday(now) } }),
    Sentence.findOne({ taggedAt: { $exists: true } }, { taggedAt: 1 })
      .sort({ taggedAt: -1 })
      .lean<{ taggedAt?: Date }>(),
  ]);
  return {
    senseTagger: {
      on: stored.senseTagger,
      ready: taggerSetup() !== null,
      ...(stored.senseTaggerChangedAt ? { changedAt: stored.senseTaggerChangedAt.toISOString() } : {}),
      today,
      perDay: TAGS_PER_DAY,
      ...(last?.taggedAt ? { lastTaggedAt: last.taggedAt.toISOString() } : {}),
    },
    showAiHighlights: {
      on: stored.showAiHighlights,
      ...(stored.showAiHighlightsChangedAt ? { changedAt: stored.showAiHighlightsChangedAt.toISOString() } : {}),
    },
  };
};

export const getOwnerSettings = async (_req: Request, res: Response) => {
  try {
    answer(res, 200, OwnerSettings, await settingsAnswer(await readOwnerSettings()));
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};

export const updateOwnerSettings = async (req: Request, res: Response) => {
  try {
    const body = OwnerSettingsBody.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: firstProblem(body.error) });
    }
    answer(res, 200, OwnerSettings, await settingsAnswer(await saveOwnerSettings(body.data)));
  } catch (error) {
    res.locals.error = error;
    res.status(500).json({ message: messageOf(error) });
  }
};
