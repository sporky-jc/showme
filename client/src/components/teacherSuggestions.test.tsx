import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { InternalAxiosRequestConfig } from "axios";
import type { ScribblesSuggestion } from "../api/types";
import { modelName } from "./modelName";
import { QUEUE_GROUPS, groupOf, groupPlace } from "./queueGroups";
import ScribblesNote from "./ScribblesNote";
import { SUGGESTION_PARTS } from "./suggestionParts";
import AtAGlance from "./AtAGlance";
import ReviewerSwitch from "./ReviewerSwitch";
import { renderWithApp } from "../test/testUtils";
import type { Outcome } from "../test/testUtils";

// The review line's suggestions on the Teacher page
// (spec/SPEC-teacher-suggestions.md). Made-up sentences and models only.

const GREAT = { id: "great", text: "Great picture! Keep painting with words." } as const;
const KIND = { id: "kindWords", text: "Use words that are kind and OK for school." } as const;
const step = (check: string, question: string, said: string, more: object = {}) => ({ check, question, said, why: false, ...more });
const TRAIL = [
  step("words", "rules", "nothing-found"),
  step("safety", "safety", "safe", { model: "llama-guard3:8b", version: "46f211c3" }),
  step("helper", "welfare", "worried", { model: "gemma4:e4b", version: "dc35e8d9", why: true }),
  step("helper", "welfare", "not-worried", { model: "qwen3.5:9b", version: "56671c2a" }),
  step("big-helper", "welfare", "worried", { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", hidden: 1, why: true }),
] as ScribblesSuggestion["trail"];

const suggestion = (more: Partial<ScribblesSuggestion>): ScribblesSuggestion => ({ verdict: "approve", tip: GREAT, reasons: ["ai"], ...more });

describe("model names", () => {
  it.each([
    ["gemma4:e4b", "Gemma 4 E4B"],
    ["qwen3.5:9b", "Qwen 3.5 9B"],
    ["llama-guard3:8b", "Llama Guard 3 8B"],
    ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Llama 3.3 70B"],
    // One it doesn't know is shown as it is
    ["mistral-small:24b", "mistral-small:24b"],
  ])("%s is %s", (id, name) => expect(modelName(id)).toBe(name));
});

describe("groups", () => {
  it.each([
    ["a worry", suggestion({ verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"] }), "needs-you"],
    ["clear worrying words", suggestion({ verdict: "unsure", tip: null, reasons: ["worrying"] }), "needs-you"],
    ["held by the rules", suggestion({ verdict: "unsure", tip: null, reasons: ["too-long"] }), "your-call"],
    ["couldn't decide", suggestion({ verdict: "unsure", tip: null }), "your-call"],
    ["not read at all", undefined, "your-call"],
    ["sent back with a note", suggestion({ verdict: "redo", tip: KIND, teacher: "worry" }), "fyi"],
    ["approved with a note", suggestion({ teacher: "review" }), "fyi"],
    ["plain approve", suggestion({}), "routine"],
    ["plain send back", suggestion({ verdict: "redo", tip: KIND }), "routine"],
    ["still being read", suggestion({ verdict: "unsure", tip: null, reasons: [], waiting: true }), "reading"],
  ])("%s goes in %s", (_, s, group) => expect(groupOf(s)).toBe(group));

  it("puts a card whose group was removed in routine, and orders groups by the list", () => {
    const withoutFyi = QUEUE_GROUPS.filter((g) => g.id !== "fyi");
    expect(groupOf(suggestion({ teacher: "review" }), withoutFyi)).toBe("routine");
    expect(QUEUE_GROUPS.map((g) => groupPlace(g.id))).toEqual([0, 1, 2, 3, 4]);
    expect(groupPlace("fyi", withoutFyi)).toBe(groupPlace("routine", withoutFyi));
  });
});

describe("the parts under a card", () => {
  it("shows the note, the FYI note and the folded trail for a decision with a note", () => {
    render(<ScribblesNote suggestion={suggestion({ verdict: "redo", tip: KIND, teacher: "worry", trail: TRAIL })} firstName="Ava" />);
    expect(screen.getByRole("note")).toHaveTextContent("My tip: “Use words that are kind and OK for school.”");
    expect(screen.getByText(/I'd send it back, and I wanted you to know/)).toHaveTextContent("It may be unkind about someone");
    // Folded until asked for
    const toggle = screen.getByRole("button", { name: "How Scribbles decided" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("opens the trail: each model's name and version from the answers, and why it's here", () => {
    render(<ScribblesNote suggestion={suggestion({ verdict: "unsure", tip: null, reasons: ["worrying", "welfare-check"], trail: TRAIL })} firstName="Ava" />);
    fireEvent.click(screen.getByRole("button", { name: "How Scribbles decided" }));
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual([
      "Word check: found nothing.",
      "Safety check Llama Guard 3 8B: safe.llama-guard3:8b · 46f211c3",
      "Helper Gemma 4 E4B: Is the child OK? worried. This is why it's here.gemma4:e4b · dc35e8d9",
      "Helper Qwen 3.5 9B: Is the child OK? not worried.qwen3.5:9b · 56671c2a",
      "Big helper Llama 3.3 70B: Is the child OK? worried, read with 1 contact detail hidden. This is why it's here.@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ]);
  });

  it("says it's still reading, with no note, while the models haven't finished", () => {
    render(<ScribblesNote suggestion={suggestion({ verdict: "unsure", tip: null, reasons: [], waiting: true, trail: TRAIL.slice(0, 2) })} firstName="Ava" />);
    expect(screen.getByText("Still reading this one.")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows the old reviewer's suggestions as before: the note alone", () => {
    render(<ScribblesNote suggestion={suggestion({})} firstName="Leo" />);
    expect(screen.getByRole("note")).toHaveTextContent("Ready for the gallery.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is one list: removing a part takes it off every card", () => {
    expect(SUGGESTION_PARTS.map((p) => p.id)).toEqual(["outcome", "teacher-note", "waiting", "trail"]);
    const trail = SUGGESTION_PARTS.findIndex((p) => p.id === "trail");
    const [removed] = SUGGESTION_PARTS.splice(trail, 1);
    try {
      render(<ScribblesNote suggestion={suggestion({ trail: TRAIL })} firstName="Leo" />);
      expect(screen.queryByRole("button", { name: "How Scribbles decided" })).not.toBeInTheDocument();
    } finally {
      SUGGESTION_PARTS.splice(trail, 0, removed);
    }
  });
});

describe("at a glance", () => {
  it("counts each group, and each count is a button that filters", () => {
    const onFilter = vi.fn();
    render(<AtAGlance counts={{ "needs-you": 2, fyi: 1, routine: 5 }} total={8} filter="all" onFilter={onFilter} />);
    const buttons = within(screen.getByRole("group", { name: "Scribbles' notes" })).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["All 8", "Needs you now 2", "FYI 1", "Routine 5"]);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(buttons[1]);
    expect(onFilter).toHaveBeenCalledWith("needs-you");
  });
});

describe("the Scribbles panel", () => {
  const STATUS = {
    mode: "suggest",
    paused: false,
    suggestionsFrom: "old",
    suggestionsDefault: "old",
    models: [
      { reader: "safety", model: "llama-guard3:8b", version: "46f211c3" },
      { reader: "first", model: "gemma4:e4b", version: "dc35e8d9" },
      { reader: "second", model: "qwen3.5:9b" },
      { reader: "hosted", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
    ],
  };

  it("names the models in use with their versions, and switches where the cards' notes come from", async () => {
    const sent: unknown[] = [];
    const onSourceChanged = vi.fn();
    renderWithApp(<ReviewerSwitch onSaid={vi.fn()} onSourceChanged={onSourceChanged} />, {
      respond: (config: InternalAxiosRequestConfig): Outcome => {
        if (config.method === "patch") {
          const body = JSON.parse(config.data);
          sent.push(body);
          const now = body.suggestionsFrom === "default" ? "old" : body.suggestionsFrom;
          return { status: 200, data: { ...STATUS, suggestionsFrom: now } };
        }
        return { status: 200, data: STATUS };
      },
    });
    // Folded until asked for
    fireEvent.click(await screen.findByRole("button", { name: "Models in use" }));
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Safety check Llama Guard 3 8B llama-guard3:8b · 46f211c3",
      "Helper Gemma 4 E4B gemma4:e4b · dc35e8d9",
      "Helper Qwen 3.5 9B qwen3.5:9b",
      "Big helper Llama 3.3 70B @cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ]);

    const group = screen.getByRole("group", { name: "Notes on the cards" });
    expect(within(group).getByRole("button", { name: "Old notes" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "New review line" }));
    expect(await screen.findByRole("button", { name: "Back to the default (old notes)" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "New review line" })).toHaveAttribute("aria-pressed", "true");
    expect(onSourceChanged).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to the default (old notes)" }));
    expect(await within(group).findByRole("button", { name: "Old notes" })).toHaveAttribute("aria-pressed", "true");
    expect(sent).toEqual([{ suggestionsFrom: "line" }, { suggestionsFrom: "default" }]);
  });
});
