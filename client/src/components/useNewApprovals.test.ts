import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNewApprovals } from "./useNewApprovals";

// Which approvals are new to the student: each is celebrated once
const key = "showme:seen-approved:g1";
const s = (id: string, approved: boolean) => ({ _id: id, approved });
const fresh = (sentences: { _id: string; approved: boolean }[], ready = true, userId: string | undefined = "g1") =>
  [...renderHook(() => useNewApprovals(userId, sentences, ready)).result.current].sort();

describe("useNewApprovals", () => {
  beforeEach(() => window.localStorage.clear());

  it("counts everything already approved as seen the first time, so nothing old is celebrated", () => {
    expect(fresh([s("a", true), s("b", false)])).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual(["a"]);
  });

  it("finds a sentence approved since the last look, once", () => {
    window.localStorage.setItem(key, JSON.stringify(["a"]));
    const mine = [s("a", true), s("b", true), s("c", false)];

    expect(fresh(mine)).toEqual(["b"]);
    // The next look (another page, or the same one again): already seen
    expect(fresh(mine)).toEqual([]);
  });

  it("keeps each student's approvals apart", () => {
    window.localStorage.setItem(key, JSON.stringify([]));
    expect(fresh([s("a", true)], true, "g2")).toEqual([]);
    expect(fresh([s("a", true)])).toEqual(["a"]);
  });

  it("waits for the student's list, and for someone signed in", () => {
    window.localStorage.setItem(key, JSON.stringify([]));
    expect(fresh([s("a", true)], false)).toEqual([]);
    const nobody = renderHook(() => useNewApprovals(undefined, [s("a", true)], true)).result.current;
    expect(nobody.size).toBe(0);
    // Nothing was marked seen while waiting
    expect(fresh([s("a", true)])).toEqual(["a"]);
  });

  it("celebrates nothing when the saved list can't be read", () => {
    window.localStorage.setItem(key, "not a list");
    expect(fresh([s("a", true)])).toEqual([]);
  });
});
