import * as api from "../api";
import type { EditSentenceBody, NewSentenceBody } from "../api/types";
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

// update edited sentences
export const editSentences =
  (editedSentence: EditSentenceBody): AppThunk =>
  async (dispatch) => {
    try {
      const { data } = await api.editUserSentences(editedSentence);
      dispatch({ type: "EDIT", payload: data });
    } catch (error) {
      console.log((error as Error).message);
    }
  };

// Create new sentences
export const createSentence =
  (newSentence: NewSentenceBody): AppThunk =>
  async (dispatch) => {
    try {
      const { data } = await api.createSentence(newSentence);

      dispatch({ type: "CREATE", payload: data });
    } catch (error) {
      console.log((error as Error).message);
    }
  };

export const clearAllSentences = (): AppThunk => async (dispatch) => {
  dispatch({ type: "CLEAR_ALL" });
};
