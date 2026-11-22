import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import type { InternalAxiosRequestConfig } from "axios";
import Frame from "./Frame";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";
import type { OwnSentence, TellSentence } from "../api/types";

// Pick a frame: after a sentence is approved, its author picks the color of
// its picture's frame in the gallery.

const ada = { id: "g-ada", firstName: "Ada", lastName: "Lovelace" };

const tells: TellSentence[] = [1, 2].map((day) => ({
  key: day,
  id: `day${day}`,
  technique: "senses",
  title: `Day ${day}`,
  tell: `Tell ${day}`,
  image: `/day${day}.jpg`,
}));

const approved: OwnSentence = {
  _id: "s1",
  title: "day1",
  tell: "Tell 1",
  show: "Rain drummed on the roof.",
  approved: true,
  toRedo: false,
  createdAt: "2026-11-01T00:00:00.000Z",
};
const waiting: OwnSentence = { ...approved, _id: "s2", title: "day2", approved: false };

const renderFrame = ({
  route = "/Frame/s1",
  mine = [approved, waiting],
  save,
  user = ada,
}: {
  route?: string;
  mine?: OwnSentence[];
  save?: () => Outcome;
  user?: object;
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const view = renderWithApp(
    <Routes>
      <Route path="/Frame/:id" element={<Frame />} />
      <Route path="/Gallery" element={<p>The gallery</p>} />
      <Route path="*" element={<p>Another page</p>} />
    </Routes>,
    {
      state: { user, tellsentences: tells, usersentences: [] },
      route,
      respond: (config) => {
        requests.push(config);
        if (config.url === "/MyPage") return { status: 200, data: mine };
        if (config.url?.endsWith("/look")) {
          if (save) return save();
          const sentence = mine.find((s) => config.url === `/MyPage/${s._id}/look`);
          return { status: 200, data: { ...sentence, look: JSON.parse(config.data) } };
        }
        if (config.url === "/Login") return { status: 200, data: ada };
        return 200;
      },
    }
  );
  const picks = () => requests.filter((r) => r.url?.endsWith("/look"));
  return { ...view, picks };
};

const colors = () => screen.findByRole("group", { name: "Frame color" });
const preview = () => screen.getByRole("region", { name: "How it looks in the gallery" });
const previewFrame = () => preview().querySelector(".paper-gallery__frame") as HTMLElement;

describe("Pick a frame", () => {
  it("offers the four frames, starting on Grape for a sentence with none", async () => {
    renderFrame();

    const group = await colors();
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Grape",
      "Watermelon",
      "Ocean",
      "Sunshine",
    ]);
    expect(within(group).getByRole("radio", { name: "Grape" })).toBeChecked();
    expect(screen.getByRole("heading", { level: 1, name: "Pick a frame" })).toBeInTheDocument();
  });

  it("starts on the frame the sentence already has", async () => {
    renderFrame({ mine: [{ ...approved, look: { frame: "teal" } }] });

    expect(within(await colors()).getByRole("radio", { name: "Ocean" })).toBeChecked();
  });

  it("shows the card as the gallery will, in the frame being tried", async () => {
    const user = userEvent.setup();
    renderFrame();
    await colors();

    expect(within(preview()).getByText("Rain drummed on the roof.")).toBeInTheDocument();
    // First name and last initial, as in the gallery
    expect(within(preview()).getByText("Ada L.")).toBeInTheDocument();
    expect(previewFrame().style.getPropertyValue("--frame-color")).toBe("var(--paper-frame-violet)");

    await user.click(screen.getByRole("radio", { name: "Sunshine" }));

    expect(previewFrame().style.getPropertyValue("--frame-color")).toBe("var(--paper-frame-sun)");
  });

  it("saves the pick and opens the gallery", async () => {
    const user = userEvent.setup();
    const { picks } = renderFrame();
    await user.click(within(await colors()).getByRole("radio", { name: "Watermelon" }));

    await user.click(screen.getByRole("button", { name: "Hang it in the gallery" }));

    expect(await screen.findByText("The gallery")).toBeInTheDocument();
    expect(picks()).toHaveLength(1);
    expect(picks()[0].method).toBe("put");
    expect(picks()[0].url).toBe("/MyPage/s1/look");
    expect(JSON.parse(picks()[0].data)).toEqual({ frame: "coral" });
  });

  it("says so, and stays, when the pick isn't saved", async () => {
    const user = userEvent.setup();
    renderFrame({ save: () => 500 });
    await colors();

    await user.click(screen.getByRole("button", { name: "Hang it in the gallery" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save your frame. Check your internet connection, then try again."
    );
    expect(screen.queryByText("The gallery")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hang it in the gallery" })).toBeEnabled();
  });

  it("passes on the server's words when there were too many tries", async () => {
    const user = userEvent.setup();
    renderFrame({
      save: () => ({ status: 429, data: { message: "Too many tries. Wait a minute, then try again." } }),
    });
    await colors();

    await user.click(screen.getByRole("button", { name: "Hang it in the gallery" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries. Wait a minute, then try again.");
  });

  it("has nothing to pick for a sentence that isn't in the gallery yet", async () => {
    const { picks } = renderFrame({ route: "/Frame/s2" });

    expect(await screen.findByText(/isn't in the gallery yet/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Frame color" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My sentences" })).toHaveAttribute("href", "/MySentences");
    expect(picks()).toHaveLength(0);
  });

  it("or for a sentence that isn't theirs", async () => {
    renderFrame({ route: "/Frame/someone-else" });

    expect(await screen.findByText(/isn't in the gallery yet/)).toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in", async () => {
    renderFrame({ user: {} });

    await waitFor(() => expect(screen.queryByRole("group", { name: "Frame color" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Pick a frame" })).toBeInTheDocument();
  });
});
