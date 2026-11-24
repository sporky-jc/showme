import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { getFeatures } from "./actions/features";
import { NO_FEATURES, useFeature, type Feature } from "./features";
import reducer from "./reducers/features";
import { renderWithApp } from "./test/testUtils";

// Feature flags: everything is off unless the backend says it's on
const Shows = ({ name }: { name: Feature }) => <p>{useFeature(name) ? "on" : "off"}</p>;

describe("features", () => {
  it("has every feature off to begin with", () => {
    renderWithApp(<Shows name="senseHighlights" />);
    expect(screen.getByText("off")).toBeInTheDocument();
  });

  it("turns on what the backend says is on", async () => {
    const { store } = renderWithApp(<Shows name="senseCoach" />, {
      respond: (config) =>
        config.url === "/features" ? { status: 200, data: { senseHighlights: false, senseCoach: true } } : 200,
    });
    await store.dispatch(getFeatures());

    await waitFor(() => expect(screen.getByText("on")).toBeInTheDocument());
    expect(store.getState().features).toEqual({ senseHighlights: false, senseCoach: true });
  });

  it("keeps everything off when the backend can't be asked", async () => {
    for (const respond of [() => "offline" as const, () => 404, () => 500]) {
      const { store, unmount } = renderWithApp(<Shows name="senseCoach" />, { respond });
      await store.dispatch(getFeatures());
      expect(store.getState().features).toEqual(NO_FEATURES);
      unmount();
    }
  });

  it("only keeps flags it knows, and only a real true turns one on", () => {
    const sent = { senseCoach: "yes", senseHighlights: true, flyingCars: true } as never;
    expect(reducer(undefined, { type: "FETCH_FEATURES", payload: sent })).toEqual({
      senseHighlights: true,
      senseCoach: false,
    });
    // An old backend's page for a missing address isn't flags at all
    expect(reducer(undefined, { type: "FETCH_FEATURES", payload: "<html>" as never })).toEqual(NO_FEATURES);
  });
});
