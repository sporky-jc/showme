import * as api from "../api";
import { isAxiosError } from "axios";
import type { EditSentenceBody, NewSentenceBody, OwnSentence } from "../api/types";
import type { AppThunk } from "../reducers/types";

// Retrieve user sentences. Answers whether they arrived, for pages that
// can't show the right thing without them (Today).
export const getUserSentences = (): AppThunk<Promise<boolean>> => async (dispatch) => {
  try {
    const { data } = await api.fetchUserSentences();

    dispatch({ type: "FETCH_ALL", payload: data });
    return true;
  } catch (error) {
    console.log((error as Error).message);
    return false;
  }
};

// What happened to a sentence sent to the server (POST or PATCH /MyPage), so
// the Write page can say the right thing (and keep the student's words if it
// wasn't saved):
// - saved: the sentence as the server saved it
// - already-sent: there's already a sentence for that day (409), most often
//   this same one, saved by an earlier press whose answer got lost. With
//   it, the student's sentence for that day, once their list is reloaded.
// - too-many: the server's rate limit (429), with its message
// - refused: the server turned the sentence down (400, or 404 for an edit)
// - unreachable: no answer, or the server broke (5xx): worth trying again
export type SaveResult =
  | { kind: "saved"; sentence: OwnSentence }
  | { kind: "already-sent"; sentence?: OwnSentence }
  | { kind: "too-many"; message?: string }
  | { kind: "refused" }
  | { kind: "unreachable" };

const failureOf = (error: unknown): SaveResult => {
  console.log((error as Error).message);
  if (!isAxiosError<{ message?: unknown }>(error) || !error.response) {
    return { kind: "unreachable" };
  }
  const { status, data } = error.response;
  if (status === 409) return { kind: "already-sent" };
  if (status === 429) {
    const message = typeof data?.message === "string" ? data.message : undefined;
    return { kind: "too-many", message };
  }
  if (status >= 400 && status < 500) return { kind: "refused" };
  return { kind: "unreachable" };
};

// Update an edited sentence
export const editSentences =
  (editedSentence: EditSentenceBody): AppThunk<Promise<SaveResult>> =>
  async (dispatch) => {
    try {
      const { data } = await api.editUserSentences(editedSentence);
      dispatch({ type: "EDIT", payload: data });
      return { kind: "saved", sentence: data };
    } catch (error) {
      return failureOf(error);
    }
  };

// Create a new sentence. If the day already has one (409), the student's
// list is reloaded, so the page shows what the server has, and the answer
// carries their sentence for that day.
export const createSentence =
  (newSentence: NewSentenceBody): AppThunk<Promise<SaveResult>> =>
  async (dispatch) => {
    try {
      const { data } = await api.createSentence(newSentence);

      dispatch({ type: "CREATE", payload: data });
      return { kind: "saved", sentence: data };
    } catch (error) {
      const failure = failureOf(error);
      if (failure.kind !== "already-sent") return failure;
      try {
        const { data } = await api.fetchUserSentences();
        dispatch({ type: "FETCH_ALL", payload: data });
        const sentence = data.find(({ title }) => title === newSentence.title);
        return { kind: "already-sent", sentence };
      } catch {
        return failure;
      }
    }
  };

export const clearAllSentences = (): AppThunk => async (dispatch) => {
  dispatch({ type: "CLEAR_ALL" });
};
