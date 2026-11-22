import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import { getTellSentences } from "../actions/tellsentences";
import { hasIds } from "../tells";
import { getUserSentences } from "../actions/usersentences";
import type { AppDispatch, RootState } from "../reducers/types";

// What a signed-in student's pages (Today, Write, My sentences) need before
// they can draw: the student's own sentences, fresh from the server, and the
// Tell sentences (the app asks for those when it opens; ask again if they
// still aren't here). A sentence's day is its place in the student's list,
// so a page that drew without both would show the wrong day.
//
// Nothing is asked for while nobody is signed in. `retry` asks again after a
// failure.
export function useStudentData() {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const user = useSelector((state: RootState) => state.user);
  // Who the data is for. An answer only counts for the student and the
  // request it was for: after a login runs out and someone signs in again on
  // the same page, the page waits for the new list instead of drawing from
  // the emptied one (which would call today "day 1").
  const who = Object.keys(user).length === 0 ? null : String(user.id ?? "signed in");
  const [attempt, setAttempt] = useState(0);
  const asked = who === null ? null : `${who}/${attempt}`;
  const [answer, setAnswer] = useState<{ asked: string; arrived: boolean } | null>(null);

  useEffect(() => {
    if (asked === null) return;
    let current = true;
    (async () => {
      const mine = await dispatch(getUserSentences());
      // A list saved before Tells had ids is fetched again (see tells.ts)
      const tells =
        hasIds(store.getState().tellsentences) || (await dispatch(getTellSentences()));
      if (current) setAnswer({ asked, arrived: mine && tells });
    })();
    return () => {
      current = false;
    };
  }, [dispatch, store, asked]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const loaded: "loading" | "ready" | "failed" =
    answer?.asked !== asked ? "loading" : answer.arrived ? "ready" : "failed";
  return { loaded, retry };
}
