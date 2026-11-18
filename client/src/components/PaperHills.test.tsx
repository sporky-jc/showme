import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import PaperHills from "./PaperHills";

describe("PaperHills", () => {
  it("draws three layers of hills", () => {
    const { container } = render(<PaperHills />);
    expect(container.querySelectorAll("svg > path")).toHaveLength(3);
  });

  it("is scenery: hidden from screen readers and not focusable", () => {
    const { container } = render(<PaperHills />);
    const hills = container.querySelector("svg");
    expect(hills).toHaveAttribute("aria-hidden", "true");
    expect(hills).toHaveAttribute("focusable", "false");
  });

  // The footer sizes and places the hills through this class
  it("stretches to whatever holds it, with the class it is given", () => {
    const { container } = render(<PaperHills className="paper-footer__hills" />);
    const hills = container.querySelector("svg");
    expect(hills).toHaveClass("paper-footer__hills");
    expect(hills).toHaveAttribute("preserveAspectRatio", "none");
  });
});
