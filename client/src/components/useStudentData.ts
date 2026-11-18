import { useCallback, useEffect, useState } from "react";
import { useDispatch, useStore } from "react-redux";
import { getTellSentences } from "../actions/tellsentences";
import { getUserSentences } from "../actions/usersentences";
import type { AppDispatch, RootState } from "../reducers/types";

// What a signed-in student's pages (Today, Write, My sentences) need before
// they can draw: the student's own sentences, fresh from the server, and the
// Tell sentences (the app asks for those when it opens; ask again if they
// still aren't here). A sentence's day is its place in the student's list,
// so a page that drew without both would show the wrong day.
//
// `enabled`: false while nobody is signed in (there is nothing to ask for).
// `retry` asks again after a failure.
export function useStudentData(enabled = true) {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const [loaded, setLoaded] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    (async () => {
      const mine = await dispatch(getUserSentences());
      const tells =
        store.getState().tellsentences.length > 0 || (await dispatch(getTellSentences()));
      if (current) setLoaded(mine && tells ? "ready" : "failed");
    })();
    return () => {
      current = false;
    };
  }, [dispatch, store, attempt, enabled]);

  const retry = useCallback(() => {
    setLoaded("loading");
    setAttempt((n) => n + 1);
  }, []);

  return { loaded, retry };
}
