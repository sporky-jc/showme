import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Lets through only Scribbles' worker on the VM (tasks/scribbles-worker-spec.md,
// T9): a request with "Authorization: Bearer <WORKER_KEY>". The key is a
// GitHub secret the deploy writes to the backend's settings, and lives on
// the VM readable only by the worker's own user. With no key set (or one
// too short to be safe), nobody gets in: the routes answer as if they
// weren't there.
export const MIN_KEY_LENGTH = 32;

const matches = (given: string, key: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
};

const workerKey = (req: Request, res: Response, next: NextFunction) => {
  const key = process.env.WORKER_KEY ?? "";
  const given = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1] ?? "";
  if (key.length >= MIN_KEY_LENGTH && matches(given, key)) return next();
  return res.status(404).json({ message: "Not found." });
};

export default workerKey;
