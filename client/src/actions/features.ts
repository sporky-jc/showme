import * as api from "../api";
import type { AppThunk } from "../reducers/types";

// Ask the backend which features being tried out are on. If it can't be
// asked (offline, or a backend from before flags), they all stay off.
export const getFeatures = (): AppThunk => async (dispatch) => {
  try {
    const { data } = await api.fetchFeatures();
    dispatch({ type: "FETCH_FEATURES", payload: data });
  } catch (error) {
    console.log((error as Error).message);
  }
};
