import { beforeEach, describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";
import persistConfig from "./persistConfig";
import reducers from "./reducers";
import type { AppAction, RootState } from "./reducers/types";

// The app's store, built as index.tsx builds it, once what was saved in the
// browser has been read back
const openApp = async () => {
  const store = configureStore({
    reducer: persistReducer<RootState, AppAction>(persistConfig, reducers),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
  const persistor = persistStore(store);
  await new Promise<void>((resolve) => {
    const check = () => persistor.getState().bootstrapped && (stop(), resolve());
    const stop = persistor.subscribe(check);
    check();
  });
  return { store, persistor };
};

// What redux-persist keeps in the browser: one JSON object, each part of the
// state a JSON string inside it
const saved = () => JSON.parse(localStorage.getItem("persist:root") ?? "{}") as Record<string, string>;
const save = (state: Record<string, unknown>, version: number) =>
  localStorage.setItem(
    "persist:root",
    JSON.stringify({
      ...Object.fromEntries(Object.entries(state).map(([key, value]) => [key, JSON.stringify(value)])),
      _persist: JSON.stringify({ version, rehydrated: true }),
    })
  );

describe("what the browser remembers between visits", () => {
  beforeEach(() => localStorage.clear());

  // If the browser remembered "the server has said who is logged in", the next
  // visit would believe it before asking, and the Admin page could again judge
  // by a remembered user (see pages/Admin.tsx).
  it("never includes whether the login was checked: each visit asks the server again", () => {
    expect(persistConfig.blacklist).toContain("session");
  });

  // The Teacher page's queue has students' full names, writing nobody has
  // approved and Scribbles' "Check in" notes; a student's own list has their
  // unshared writing. On a shared school computer the next person could read
  // what the browser kept. Both pages ask the server again before they draw
  // (Admin.tsx, useStudentData.ts), so keeping them bought nothing.
  it("never keeps the teacher's queue or a student's own sentences", async () => {
    const { store, persistor } = await openApp();
    store.dispatch({
      type: "FETCH_APPROVAL",
      payload: [{ _id: "1", show: "A secret.", name: "Sam Example" }],
    } as unknown as AppAction);
    store.dispatch({ type: "FETCH_ALL", payload: [{ _id: "2", show: "Mine." }] } as unknown as AppAction);
    store.dispatch({ type: "FETCH_APPROVED", payload: [{ _id: "3", show: "Shared." }] } as unknown as AppAction);
    await persistor.flush();

    expect(Object.keys(saved())).not.toContain("approvalsentences");
    expect(Object.keys(saved())).not.toContain("usersentences");
    expect(localStorage.getItem("persist:root")).not.toContain("Sam Example");
    // The gallery is public: still kept, so it shows at once next visit
    expect(saved().approvedsentences).toContain("Shared.");
  });

  // Browsers that used the site before this rule still hold the old copy
  it("throws away a queue and a student's list saved by an older version", async () => {
    save(
      {
        approvalsentences: [{ _id: "1", show: "A secret.", name: "Sam Example" }],
        usersentences: [{ _id: "2", show: "Mine." }],
        approvedsentences: [{ _id: "3", show: "Shared." }],
        user: { id: "g-1", name: "Teacher" },
      },
      1
    );

    const { store, persistor } = await openApp();
    expect(store.getState().approvalsentences).toEqual([]);
    expect(store.getState().usersentences).toEqual([]);
    // What may be kept is still read back
    expect(store.getState().approvedsentences).toEqual([{ _id: "3", show: "Shared." }]);
    expect(store.getState().user).toMatchObject({ id: "g-1" });

    // ... and the old copy is gone from the browser, without waiting for
    // anything else to change
    await persistor.flush();
    expect(localStorage.getItem("persist:root")).not.toContain("Sam Example");
    expect(localStorage.getItem("persist:root")).not.toContain("Mine.");
  });
});
