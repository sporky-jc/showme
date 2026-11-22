import type { AxiosError } from "axios";
import * as api from "../api";
import type { Technique } from "../api/types";
import type { AppThunk } from "../reducers/types";

// Retrieve user info
export const fetchUser = (): AppThunk => async (dispatch) => {
  try {
    const { data } = await api.fetchUser();
    dispatch({ type: "FIND_USER", payload: data });
  } catch (error) {
    // 401 just means "nobody is logged in", which is normal for visitors
    const { response, message } = error as AxiosError;
    if (response?.status !== 401) console.error(message);
  }
};

// When the app opens, ask the server who is logged in. The httpOnly login
// cookie is the proof; what redux-persist restored from the browser's storage
// is only a memory of a login. So:
//   - valid cookie: show that user (even if nothing was remembered, e.g. the
//     storage was cleared, or a test robot logged in through the test door)
//   - no or expired cookie (401): the interceptor logs out
//   - no answer (offline): leave things as they are
// Whatever the answer, mark the check done: pages that depend on who is logged
// in (Admin) wait for it instead of judging by what was remembered.
export const checkSession = (): AppThunk => async (dispatch) => {
  try {
    await dispatch(fetchUser());
  } finally {
    dispatch({ type: "SESSION_CHECKED" });
  }
};

// The student has seen a refresher: noted on screen at once, then on the
// server (their profile, so it holds on any device). If the server can't be
// told, it may open by itself once more next time; nothing else is lost.
export const markRefresherSeen =
  (technique: Technique): AppThunk =>
  async (dispatch) => {
    dispatch({ type: "SAW_REFRESHER", payload: technique });
    try {
      const { data } = await api.markRefresherSeen(technique);
      // The student as the server has them now (an older server may answer
      // with nothing: then the screen keeps what it has)
      if (data && typeof data.id === "string") dispatch({ type: "FIND_USER", payload: data });
    } catch (error) {
      console.log((error as Error).message);
    }
  };

// Logout User. The backend cancels the login and deletes the httpOnly cookie
// (JavaScript can't). Whatever happens, forget the user on screen too.
export const logoutUser = (): AppThunk => async (dispatch) => {
  try {
    await api.logoutUser();
  } catch (error) {
    console.error((error as Error).message);
  } finally {
    dispatch({ type: "LOGOUT" });
  }
};
