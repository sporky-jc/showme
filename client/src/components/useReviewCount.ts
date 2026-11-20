import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import * as api from "../api";
import type { ReviewCounts } from "../api/types";
import type { RootState } from "../reducers/types";

// How often a teacher's open tab asks again how many sentences wait for
// them, while the tab is showing: a worrying sentence gets noticed within a
// few minutes, without every open tab asking all day long.
export const REVIEW_COUNT_EVERY_MS = 3 * 60 * 1000;

// A real answer, not something else: until the backend with GET
// /Admin/count is deployed (and on pull request previews, which use the
// staging backend) the request fails, and the badge just isn't shown
const isCounts = (data: unknown): data is ReviewCounts =>
  typeof (data as ReviewCounts)?.checkIn === "number" &&
  typeof (data as ReviewCounts)?.waiting === "number";

// How many sentences wait in the signed-in teacher's queue, and how many of
// them Scribbles held as worrying ("Check in" on the Teacher page), for the
// badge on the Teacher link: so a teacher notices even without opening the
// Teacher page. Null until the server has answered, and for anyone who
// isn't a teacher: students and visitors never ask (the server would
// refuse them anyway).
//
// Asked when a teacher signs in or the page loads, every few minutes while
// the tab is showing (not while it's hidden: when it shows again, at once),
// and whenever the Teacher page's queue changes, which is after each
// decision or undo there. A failed request is silent: the last count stays,
// or there's no badge.
export default function useReviewCount(isAdmin: boolean) {
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  // The Teacher page's queue in the store: a new list after every decision
  const queue = useSelector((state: RootState) => state.approvalsentences);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    // Not while the tab is hidden: it asks when it shows again (below)
    if (document.visibilityState === "hidden") return;
    let current = true;
    api
      .fetchReviewCounts()
      .then(({ data }) => {
        if (current && isCounts(data)) setCounts({ checkIn: data.checkIn, waiting: data.waiting });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [isAdmin, queue, tick]);

  // The timer, which stops while the tab is hidden and asks at once when it
  // shows again
  useEffect(() => {
    if (!isAdmin) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      timer ??= setInterval(() => setTick((n) => n + 1), REVIEW_COUNT_EVERY_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        setTick((n) => n + 1);
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [isAdmin]);

  // "(2) " at the start of the tab's title while there are sentences to
  // check in on, so a teacher sees it from another tab too
  const checkIn = isAdmin ? (counts?.checkIn ?? 0) : 0;
  useEffect(() => {
    if (checkIn === 0) return;
    const title = document.title;
    document.title = `(${checkIn}) ${title}`;
    return () => {
      document.title = title;
    };
  }, [checkIn]);

  return isAdmin ? counts : null;
}
