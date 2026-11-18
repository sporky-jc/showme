import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "./Logo";

describe("Logo", () => {
  it("is one image called Show ME, so screen readers don't spell out its pieces", () => {
    render(<Logo />);
    const logo = screen.getByRole("img", { name: "Show ME" });
    expect(logo).toBeInTheDocument();
    // The words and the drawings inside are hidden from screen readers
    expect(screen.queryByText("Show")?.getAttribute("aria-hidden")).toBe("true");
    expect(logo.querySelectorAll("svg[aria-hidden]")).toHaveLength(2);
  });

  it("scales with its size", () => {
    render(<Logo size={40} />);
    expect(screen.getByRole("img", { name: "Show ME" })).toHaveStyle({ fontSize: "40px" });
  });
});
