import * as api from "../api";
import type { AppThunk } from "../reducers/types";

// Retrieve tell sentences. Answers whether they arrived.
export const getTellSentences = (): AppThunk<Promise<boolean>> => async (dispatch) => {
  try {
    const { data } = await api.fetchTellSentences();

    dispatch({ type: "FETCH_TELL", payload: data });
    return true;
  } catch (error) {
    console.log((error as Error).message);
    return false;
  }
};
