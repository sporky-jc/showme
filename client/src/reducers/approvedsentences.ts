import type { GallerySentence } from "../api/types";
import type { AppAction } from "./types";

//  Approved sentences reducer, keep track of approved sentences
const approvedsentences = (
  approvedsentences: GallerySentence[] = [],
  action: AppAction
): GallerySentence[] => {
  switch (action.type) {
    case "FETCH_APPROVED":
      return action.payload;
    default:
      return approvedsentences;
  }
};

export default approvedsentences;
