import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Scribbles from "./Scribbles";

// jsdom has no AnimationEvent, so the name is set on a plain event. React
// listens for the prefixed name where the browser has no unprefixed
// animation (as in jsdom), so both are sent.
const animationEnd = (element: Element, animationName: string) =>
  act(() => {
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "animationName", { value: animationName });
      element.dispatchEvent(event);
    }
  });

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

  it.each(["idle", "happy", "thinking", "worried"] as const)("shows the %s mood", (mood) => {
    const { container } = render(<Scribbles mood={mood} />);
    expect(container.querySelector("svg")).toHaveClass(`scribbles--${mood}`);
  });

  it("looks worried (raised brows and a drop of sweat) only when worried", () => {
    const { container, rerender } = render(<Scribbles mood="worried" />);
    expect(container.querySelector("[data-worried]")).not.toBeNull();
    rerender(<Scribbles mood="thinking" />);
    expect(container.querySelector("[data-worried]")).toBeNull();
  });

  it("shows thought dots only while thinking", () => {
    const { container, rerender } = render(<Scribbles mood="thinking" />);
    expect(container.querySelector("[data-thinking]")).not.toBeNull();
    rerender(<Scribbles mood="idle" />);
    expect(container.querySelector("[data-thinking]")).toBeNull();
  });

  it("waves both arms when happy with nothing to hold", () => {
    const { container, rerender } = render(<Scribbles mood="happy" />);
    expect(container.querySelectorAll(".scribbles__arm")).toHaveLength(2);
    // Holding something, he keeps that hand still
    rerender(<Scribbles mood="happy" prop="check" />);
    expect(container.querySelectorAll(".scribbles__arm")).toHaveLength(1);
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

  it("reacts once, then goes back to his mood", () => {
    const { container } = render(<Scribbles mood="thinking" prop="note" reaction="catch" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("scribbles--thinking", "scribbles--catch");
    // Another animation ending doesn't stop it
    animationEnd(svg, "scribbles-catch");
    expect(svg).toHaveClass("scribbles--catch");
    animationEnd(svg, "scribbles-gotit");
    expect(svg).not.toHaveClass("scribbles--catch");
    expect(svg).toHaveClass("scribbles--thinking");
  });

  it("shows sparks only while cheering", () => {
    const { container } = render(<Scribbles mood="happy" prop="check" reaction="cheer" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveClass("scribbles--cheer");
    expect(container.querySelector("[data-sparks]")).not.toBeNull();
    animationEnd(svg, "scribbles-cheer");
    expect(container.querySelector("[data-sparks]")).toBeNull();
  });

  it("doesn't react unless asked", () => {
    const { container } = render(<Scribbles mood="happy" />);
    const svg = container.querySelector("svg")!;
    expect(svg).not.toHaveClass("scribbles--catch");
    expect(svg).not.toHaveClass("scribbles--cheer");
  });
});
