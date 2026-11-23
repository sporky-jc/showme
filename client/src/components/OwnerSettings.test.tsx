import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InternalAxiosRequestConfig } from "axios";
import OwnerSettings from "./OwnerSettings";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";

// The Owner settings on the Teacher page: only the site's owner gets an
// answer, so only the owner sees them. Two switches: AI reading (the sense
// tagger runs and saves what it finds) and AI highlights for kids (the
// Gallery shows it).

type Flags = { senseTagger: boolean; showAiHighlights?: boolean };

const answer = ({ senseTagger, showAiHighlights }: Flags, extra: object = {}) => ({
  senseTagger: { on: senseTagger, ready: true, today: 12, perDay: 150, ...extra },
  ...(showAiHighlights === undefined ? {} : { showAiHighlights: { on: showAiHighlights } }),
});

const renderSettings = ({
  settings = { status: 200, data: answer({ senseTagger: false, showAiHighlights: false }) } as Outcome,
  change,
}: {
  settings?: Outcome;
  change?: (config: InternalAxiosRequestConfig) => Outcome;
} = {}) => {
  const requests: InternalAxiosRequestConfig[] = [];
  const onSaid = vi.fn();
  // The server's flags, changed by each PATCH
  const flags: Flags = { senseTagger: false, showAiHighlights: false };
  const view = renderWithApp(<OwnerSettings onSaid={onSaid} />, {
    respond: (config) => {
      requests.push(config);
      if (config.url !== "/Admin/owner") return 404;
      if (config.method !== "patch") return settings;
      if (change) return change(config);
      Object.assign(flags, JSON.parse(config.data));
      return { status: 200, data: answer(flags) };
    },
  });
  const patches = () => requests.filter((r) => r.method === "patch").map((r) => JSON.parse(r.data));
  return { ...view, onSaid, patches, requests };
};

const reading = () => screen.getByRole("group", { name: "AI reading" });
const highlights = () => screen.getByRole("group", { name: "AI highlights for kids" });

describe("OwnerSettings", () => {
  it("shows both switches, off, with today's count", async () => {
    renderSettings();

    expect(await screen.findByRole("heading", { name: "Owner settings" })).toBeInTheDocument();
    expect(within(reading()).getByText("AI reading: off.")).toBeInTheDocument();
    expect(within(reading()).getByText("Read today: 12 of 150 sentences.")).toBeInTheDocument();
    expect(within(highlights()).getByText("AI highlights for kids: off.")).toBeInTheDocument();
    expect(screen.queryByText(/Cloudflare keys/)).not.toBeInTheDocument();
  });

  it("turns AI reading on, and off again, without showing kids anything", async () => {
    const { onSaid, patches } = renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Turn AI reading on" }));
    expect(await within(reading()).findByText("AI reading: on.")).toBeInTheDocument();
    expect(onSaid).toHaveBeenLastCalledWith("AI reading is on. Kids don't see its highlights yet.");
    expect(within(highlights()).getByText("AI highlights for kids: off.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn AI reading off" }));
    expect(await within(reading()).findByText("AI reading: off.")).toBeInTheDocument();
    expect(patches()).toEqual([{ senseTagger: true }, { senseTagger: false }]);
  });

  it("shows AI highlights to kids, and hides them again", async () => {
    const { onSaid, patches } = renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: "Show AI highlights to kids" }));
    expect(await within(highlights()).findByText("AI highlights for kids: on.")).toBeInTheDocument();
    expect(onSaid).toHaveBeenLastCalledWith("Kids now see the AI highlights in the Gallery.");

    fireEvent.click(screen.getByRole("button", { name: "Hide AI highlights from kids" }));
    expect(await within(highlights()).findByText("AI highlights for kids: off.")).toBeInTheDocument();
    expect(onSaid).toHaveBeenLastCalledWith("Kids see only the word list's highlights.");
    expect(patches()).toEqual([{ showAiHighlights: true }, { showAiHighlights: false }]);
  });

  it("says when the Cloudflare keys aren't set", async () => {
    renderSettings({ settings: { status: 200, data: answer({ senseTagger: false, showAiHighlights: false }, { ready: false }) } });
    expect(await screen.findByText("It needs the Cloudflare keys before it can run.")).toBeInTheDocument();
  });

  it("shows only AI reading when the server doesn't know the highlights switch yet", async () => {
    renderSettings({ settings: { status: 200, data: answer({ senseTagger: true }) } });

    expect(await screen.findByText("AI reading: on.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "AI highlights for kids" })).not.toBeInTheDocument();
  });

  it("shows nothing to anyone but the owner (the server says 403)", async () => {
    const { requests } = renderSettings({ settings: { status: 403, data: { message: "Only the site's owner can use these settings." } } });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Owner settings" })).not.toBeInTheDocument();
  });

  it("says so beside the switch when a change doesn't save, and keeps it as it was", async () => {
    renderSettings({ change: () => 500 });

    fireEvent.click(await screen.findByRole("button", { name: "Show AI highlights to kids" }));

    expect(await within(highlights()).findByRole("alert")).toHaveTextContent("That didn't change.");
    expect(within(highlights()).getByText("AI highlights for kids: off.")).toBeInTheDocument();
    expect(within(reading()).queryByRole("alert")).not.toBeInTheDocument();
  });
});
