import axios from "axios";
import type {
  EditSentenceBody,
  GallerySentence,
  LoginBody,
  NewSentenceBody,
  OwnSentence,
  QueueSentence,
  ReviewBody,
  ReviewDecision,
  ReviewTip,
  ReviewTipId,
  SentenceLikes,
  SentenceWithAuthor,
  TellSentence,
  UndoAnswer,
  UndoBody,
  User,
} from "./types";

// Every request goes to /api on this same site. A proxy forwards it to the
// backend: the proxy in vite.config.ts during `npm start`, public/_redirects on Netlify.
// Because the browser only ever talks to this site, it automatically sends the
// httpOnly login cookie with each request; no code here touches the token.
export const API = axios.create({ baseURL: "/api" });

// retrieve tell sentences
export const fetchTellSentences = () => API.get<TellSentence[]>("/");

// exchange the Google ID token for our login cookie
export const loginUser = (token: string) =>
  API.post("/auth", { token } satisfies LoginBody);

// retrieve the signed-in user's info
export const fetchUser = () => API.get<User>("/Login");

// retrieve/create/update user sentences on mypage
export const fetchUserSentences = () => API.get<OwnSentence[]>("/MyPage");
export const createSentence = (newSentence: NewSentenceBody) =>
  API.post<OwnSentence>("/MyPage", newSentence);
export const editUserSentences = (editedSentence: EditSentenceBody) =>
  API.patch<OwnSentence>("/MyPage", editedSentence);

// logout User
export const logoutUser = () => API.post("/Logout");

// retrieve/approve/reject sentences awaiting approval
export const fetchApprovalSentences = () =>
  API.get<QueueSentence[]>("/Admin");
export const updatePendingApprovalSentences = (
  status: ReviewDecision,
  sentence: SentenceWithAuthor | QueueSentence,
  // With "redo": the tip the student sees, or none
  tip: ReviewTipId | null = null
) => {
  // The sentence as the page shows it, without Scribbles' suggestion (the
  // server only reads its id and date, see ReviewBody). The server answers
  // with the queue as it is after this decision.
  const { suggestion: _suggestion, ...shown } = sentence as QueueSentence;
  return API.patch<QueueSentence[]>("/Admin", {
    status,
    sentence: shown,
    tip,
  } satisfies ReviewBody);
};
// The tips a teacher can send back with "Try again"
export const fetchReviewTips = () => API.get<ReviewTip[]>("/Admin/tips");

// The sentences approved or sent back most recently, and taking one of those
// decisions back so it waits for review again. `status` is the decision
// being taken back. The server answers with the queue and the recent
// decisions as they are after it.
export const fetchRecentDecisions = () => API.get<SentenceWithAuthor[]>("/Admin/decisions");
export const undoDecision = (status: ReviewDecision, sentence: SentenceWithAuthor) =>
  API.patch<UndoAnswer>("/Admin/undo", {
    status,
    // Only its id and date: the server checks it still has the decision and
    // the words the page showed (see UndoBody)
    sentence: { _id: sentence._id, createdAt: sentence.createdAt },
  } satisfies UndoBody);

// Likes on the gallery page, for signed-in users only: every approved
// sentence's likes, and liking or unliking one (each answers with that
// sentence's likes after the change)
export const fetchLikes = () => API.get<SentenceLikes[]>("/Collections/likes");
export const likeSentence = (id: string) =>
  API.put<SentenceLikes>(`/Collections/${encodeURIComponent(id)}/like`);
export const unlikeSentence = (id: string) =>
  API.delete<SentenceLikes>(`/Collections/${encodeURIComponent(id)}/like`);

// On a fresh load of some pages, index.html starts a request before the app's
// code has even downloaded (see vite.config.ts). Each one is handed over once:
// coming back to the page later asks the server again, for a fresh answer.
const takeEarlyRequest = (path: string) => {
  const early = window.earlyRequests?.[path];
  if (early) delete window.earlyRequests?.[path];
  return early;
};

// retrieve approved sentences: index.html may have asked already. If that
// didn't work, ask again the usual way, which reports failures as usual.
export const fetchApprovedSentences = async (): Promise<{
  data: GallerySentence[];
}> => {
  const early = takeEarlyRequest("/Collections");
  if (early) {
    try {
      const response = await early;
      if (response.ok) return { data: await response.json() };
    } catch {
      // no answer (e.g. offline): ask again below
    }
  }
  return API.get<GallerySentence[]>("/Collections");
};
