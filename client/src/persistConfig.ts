import storage from "redux-persist/es/storage";
import type { PersistConfig, PersistedState } from "redux-persist";
import type { RootState } from "./reducers/types";

// Never saved in the browser between visits:
// - `session`, whether the server has confirmed who is logged in, and
//   `features`, which features being tried out are on. Both must start over
//   on every visit, or pages would trust a remembered user, or show a
//   feature that has since been turned off.
// - `approvalsentences`, the Teacher page's queue (students' full names,
//   writing nobody has approved, Scribbles' "Check in" notes), and
//   `usersentences`, a student's own list. On a shared school computer the
//   next person could read a saved copy, and nothing is lost by not keeping
//   one: both pages ask the server again before they draw (pages/Admin.tsx,
//   components/useStudentData.ts).
const NEVER_SAVED: (keyof RootState)[] = ["session", "features", "approvalsentences", "usersentences"];

// Browsers that used the site before a part joined that list still hold a
// copy of it: left out when the saved state is read back, and gone from the
// browser the next time the state is saved (the app saves as it starts).
// Raise `version` whenever NEVER_SAVED grows.
const dropNeverSaved = async (state: PersistedState): Promise<PersistedState> => {
  if (!state) return state;
  const kept: Record<string, unknown> = { ...state };
  for (const part of NEVER_SAVED) delete kept[part];
  return kept as PersistedState;
};

// What redux-persist saves in the browser between visits: everything else
// (the public Tell list and gallery, and who was signed in).
const persistConfig: PersistConfig<RootState> = {
  key: "root",
  version: 2,
  storage,
  blacklist: NEVER_SAVED,
  migrate: dropNeverSaved,
};

export default persistConfig;
