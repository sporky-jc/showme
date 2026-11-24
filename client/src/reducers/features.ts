import type { Features } from "../api/types";
import { NO_FEATURES } from "../features";
import type { AppAction } from "./types";

// Which features being tried out are on (see features.ts). Everything is
// off until the backend says otherwise. Whatever it sends, only the flags
// this website knows are kept, and only a real `true` turns one on.
const features = (features: Features = NO_FEATURES, action: AppAction): Features => {
  switch (action.type) {
    case "FETCH_FEATURES": {
      const sent: Partial<Record<string, unknown>> = action.payload ?? {};
      const names = Object.keys(NO_FEATURES) as (keyof Features)[];
      return Object.fromEntries(names.map((name) => [name, sent[name] === true])) as Features;
    }
    default:
      return features;
  }
};

export default features;
