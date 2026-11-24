import storage from "redux-persist/es/storage";
import type { PersistConfig } from "redux-persist";
import type { RootState } from "./reducers/types";

// What redux-persist saves in the browser between visits: everything except
// `session`, whether the server has confirmed who is logged in, and
// `features`, which features being tried out are on. Both must start over on
// every visit, or pages would trust a remembered user, or show a feature
// that has since been turned off.
const persistConfig: PersistConfig<RootState> = {
  key: "root",
  version: 1,
  storage,
  blacklist: ["session", "features"],
};

export default persistConfig;
