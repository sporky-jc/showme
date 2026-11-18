import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Scribbles from "./Scribbles";

describe("Scribbles", () => {
  it("is an image called Scribbles the pencil", () => {
    render(<Scribbles />);
    expect(screen.getByRole("img", { name: "Scribbles the pencil" })).toBeInTheDocument();
  });

  it("is hidden from screen readers when decorative", () => {
    const { container } = render(<Scribbles decorative />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps his shape at any size", () => {
    const { container } = render(<Scribbles size={210} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "210");
    expect(svg).toHaveAttribute("height", "216");
  });

  it.each(["idle", "happy", "thinking"] as const)("shows the %s mood", (mood) => {
    const { container } = render(<Scribbles mood={mood} />);
    expect(container.querySelector("svg")).toHaveClass(`scribbles--${mood}`);
  });

  it("holds the prop for the page's job, and nothing by default", () => {
    const { container, rerender } = render(<Scribbles />);
    expect(container.querySelector("[data-held]")).toBeNull();
    for (const prop of ["note", "check", "brush", "tape"] as const) {
      rerender(<Scribbles prop={prop} />);
      expect(container.querySelectorAll("[data-held]")).toHaveLength(1);
      expect(container.querySelector(`[data-held="${prop}"]`)).not.toBeNull();
    }
  });
});
