import type { AxiosError } from "axios";
import * as api from "../api";
import type { ReviewDecision, SentenceWithAuthor } from "../api/types";
import type { AppThunk } from "../reducers/types";

// Fetch the sentences waiting for review. Answers whether they arrived, so
// the Teacher page can say so when they didn't.
export const fetchApprovalSentences = (): AppThunk<Promise<boolean>> => async (dispatch) => {
  try {
    const { data } = await api.fetchApprovalSentences();

    dispatch({ type: "FETCH_APPROVAL", payload: data });
    return true;
  } catch (error) {
    console.error((error as Error).message);
    return false;
  }
};

// Approve a sentence or send it back. Answers how it went: "saved", "stale"
// when the sentence changed or was already reviewed after the page loaded
// (the server refuses those with 409, see ReviewBody), or "failed".
export type ReviewOutcome = "saved" | "stale" | "failed";
export const updatePendingApprovalSentences =
  (status: ReviewDecision, sentence: SentenceWithAuthor): AppThunk<Promise<ReviewOutcome>> =>
  async (dispatch) => {
    try {
      const { data } = await api.updatePendingApprovalSentences(
        status,
        sentence
      );
      dispatch({ type: "UPDATE_APPROVAL_SENTENCES", payload: data });
      return "saved";
    } catch (error) {
      if ((error as AxiosError).response?.status === 409) return "stale";
      console.error(`Error updating sentence status to ${status}:`, error);
      return "failed";
    }
  };
