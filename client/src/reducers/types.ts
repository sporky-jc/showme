import type { ThunkAction, ThunkDispatch } from "@reduxjs/toolkit";
import type {
  Features,
  GallerySentence,
  OwnSentence,
  QueueSentence,
  Technique,
  TellSentence,
  User,
} from "../api/types";
import type { RootState } from "./index";

export type { RootState };

// Every action the store understands, and what each one carries. Dispatching
// an action that isn't listed here, or with the wrong payload, is an error.
export type AppAction =
  | { type: "FETCH_TELL"; payload: TellSentence[] }
  | { type: "FETCH_FEATURES"; payload: Features }
  | { type: "FIND_USER"; payload: User }
  | { type: "SESSION_CHECKED" }
  | { type: "SAW_REFRESHER"; payload: Technique }
  | { type: "LOGOUT" }
  | { type: "FETCH_ALL"; payload: OwnSentence[] }
  | { type: "CREATE"; payload: OwnSentence }
  | { type: "EDIT"; payload: OwnSentence }
  | { type: "CLEAR_ALL" }
  | { type: "FETCH_APPROVAL"; payload: QueueSentence[] }
  | { type: "UPDATE_APPROVAL_SENTENCES"; payload: QueueSentence[] }
  | { type: "FETCH_APPROVED"; payload: GallerySentence[] };

// The store's dispatch, which also runs the async actions in src/actions/
export type AppDispatch = ThunkDispatch<RootState, unknown, AppAction>;

// An async action (a "thunk"): a function the store runs with its dispatch.
// `Result` is what dispatching it returns, usually a promise to wait on.
export type AppThunk<Result = Promise<void>> = ThunkAction<
  Result,
  RootState,
  unknown,
  AppAction
>;
