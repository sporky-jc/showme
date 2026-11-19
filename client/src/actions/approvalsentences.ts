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

// Approve a sentence or send it back. Answers whether the server took it.
export const updatePendingApprovalSentences =
  (status: ReviewDecision, sentence: SentenceWithAuthor): AppThunk<Promise<boolean>> =>
  async (dispatch) => {
    try {
      const { data } = await api.updatePendingApprovalSentences(
        status,
        sentence
      );
      dispatch({ type: "UPDATE_APPROVAL_SENTENCES", payload: data });
      return true;
    } catch (error) {
      console.error(`Error updating sentence status to ${status}:`, error);
      return false;
    }
  };
