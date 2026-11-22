import { describe, expect, it } from "vitest";
import user from "./user";

const ada = { id: "g-ada", firstName: "Ada", email: "ada@example.com", isAdmin: false };

describe("user reducer", () => {
  it("notes a refresher as seen at once, only once", () => {
    const once = user({ ...ada, seenRefreshers: ["senses"] }, { type: "SAW_REFRESHER", payload: "simile" });
    expect(once.seenRefreshers).toEqual(["senses", "simile"]);
    expect(user(once, { type: "SAW_REFRESHER", payload: "simile" })).toBe(once);
  });

  it("starts the list for a login saved before it existed", () => {
    expect(user(ada, { type: "SAW_REFRESHER", payload: "senses" }).seenRefreshers).toEqual(["senses"]);
  });
});
