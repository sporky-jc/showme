import { useSelector } from "react-redux";
import type { Features } from "./api/types";
import type { RootState } from "./reducers/types";

// Feature flags: things still being tried out. The backend says which are
// on (GET /features, see backend/config/features.ts): staging tries them,
// production keeps them off. Until the answer arrives, and if it never
// does, every feature is off: the simple site is the safe one to show.

export type Feature = keyof Features;

export const NO_FEATURES: Features = { senseHighlights: false, senseCoach: false };

// Whether a feature is on. Use it to decide what a page shows:
//   const coach = useFeature("senseCoach");
export const useFeature = (name: Feature): boolean =>
  useSelector((state: RootState) => state.features[name] === true);
