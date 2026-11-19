import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { SentenceLikes } from "../api/types";

// Each approved sentence's likes, by sentence id
export type LikesById = Record<string, SentenceLikes>;

// The likes the server sent, and who for: they say what that user liked, so
// they're never shown to anyone else (say, after logging out and back in as
// someone else on the same page)
interface Loaded {
  forUser: string;
  byId: LikesById;
}

const byId = (list: SentenceLikes[]): LikesById =>
  Object.fromEntries(list.map((entry) => [entry._id, entry]));

// The gallery's likes. Only signed-in users see or give likes, so
// with nobody signed in (`userId` undefined) there are none: `likes` is null
// and nothing is asked of the server. They're kept here, not in the Redux
// store, so they're never saved in the browser and go as soon as the user
// logs out.
//
// `toggle(id)` likes the sentence, or unlikes it if the user already does.
// The heart changes at once; the server's answer then sets the count (others
// may have liked it meanwhile), or, if the request fails, it's put back.
// While one request for a sentence is on its way, more clicks on it are
// ignored, so a double click can't send a like and an unlike.
//
// `reload`: changing it asks the server again (the gallery's Try again)
export function useLikes(userId: string | undefined, reload = 0) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The sentences with a like or unlike on its way. A ref, not state, so
  // it's up to date even between two quick clicks, before React has redrawn.
  const sending = useRef(new Set<string>());

  useEffect(() => {
    if (!userId) return;
    let stillHere = true;
    api
      .fetchLikes()
      .then(({ data }) => {
        if (stillHere) setLoaded({ forUser: userId, byId: byId(data) });
      })
      .catch((error: Error) => {
        // No likes to show; the sentences themselves still are
        console.log(error.message);
      });
    return () => {
      stillHere = false;
    };
  }, [userId, reload]);

  const likes = userId && loaded?.forUser === userId ? loaded.byId : null;

  // Replace one sentence's likes, if they're still this user's
  const put = useCallback(
    (forUser: string, entry: SentenceLikes) =>
      setLoaded((now) =>
        now?.forUser === forUser
          ? { forUser, byId: { ...now.byId, [entry._id]: entry } }
          : now
      ),
    []
  );

  const toggle = useCallback(
    async (id: string) => {
      const before = likes?.[id];
      if (!userId || !before || before.mine || sending.current.has(id)) return;

      const like = !before.likedByMe;
      sending.current.add(id);
      put(userId, {
        ...before,
        likedByMe: like,
        likes: before.likes + (like ? 1 : -1),
      });
      try {
        const { data } = await (like
          ? api.likeSentence(id)
          : api.unlikeSentence(id));
        put(userId, data);
      } catch (error) {
        console.log((error as Error).message);
        put(userId, before);
      } finally {
        sending.current.delete(id);
      }
    },
    [likes, userId, put]
  );

  return { likes, toggle };
}
