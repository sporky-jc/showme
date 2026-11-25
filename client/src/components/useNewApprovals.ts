import { useEffect, useState } from "react";
import type { Sentence } from "../api/types";

// Which of the student's sentences were approved since they last looked:
// each is celebrated once (see GalleryJoined.tsx), on Home or My sentences,
// whichever the student opens first.
//
// The approvals already seen are kept in this browser, by student. The first
// time this runs for a student, everything already approved counts as seen,
// so nobody gets a pile of old celebrations. On another computer a sentence
// may be celebrated once more, and if the browser keeps nothing (a private
// window, blocked storage) nothing is celebrated: nothing else depends on it.
const keyFor = (userId: string) => `showme:seen-approved:${userId}`;

const readSeen = (userId: string): string[] | null => {
  try {
    const saved = window.localStorage.getItem(keyFor(userId));
    if (saved === null) return null;
    const ids: unknown = JSON.parse(saved);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return null;
  }
};

const writeSeen = (userId: string, ids: string[]) => {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(ids));
  } catch {
    // Nothing kept: see above
  }
};

const NONE: ReadonlySet<string> = new Set();

// `ready`: the student's list has arrived (useStudentData). Worked out once
// per visit to the page, so the celebration stays while the page is open.
export function useNewApprovals(
  userId: string | undefined,
  sentences: Pick<Sentence, "_id" | "approved">[],
  ready: boolean
): ReadonlySet<string> {
  const [found, setFound] = useState<{ userId: string; fresh: ReadonlySet<string>; approved: string[] } | null>(
    null
  );

  // Worked out while drawing, the first time the list is there (React's
  // pattern for state that follows from what's on screen)
  if (ready && userId && found?.userId !== userId) {
    const approved = sentences.filter((sentence) => sentence.approved).map((sentence) => sentence._id);
    const seen = readSeen(userId);
    const fresh = seen === null ? NONE : new Set(approved.filter((id) => !seen.includes(id)));
    setFound({ userId, fresh, approved: [...new Set([...(seen ?? []), ...approved])] });
  }

  // Remembered once the page has drawn them
  useEffect(() => {
    if (found) writeSeen(found.userId, found.approved);
  }, [found]);

  return found?.fresh ?? NONE;
}
