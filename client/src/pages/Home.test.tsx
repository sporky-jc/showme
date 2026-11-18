import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import Home from "./Home";
import { renderWithApp } from "../test/testUtils";

describe("Home page", () => {
  it("welcomes a visitor who isn't signed in", () => {
    renderWithApp(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Don't just tell it. Show it!");
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("shows a signed-in student their Today page", async () => {
    renderWithApp(<Home />, {
      state: { user: { firstName: "Ada", isAdmin: false } },
      respond: (config) => (config.url === "/MyPage" ? { status: 200, data: [] } : 200),
    });

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Hi Ada!");
    expect(screen.queryByRole("button", { name: "Sign in with Google" })).not.toBeInTheDocument();
  });

  // In JSX, anything written after a tag is text on the page, so a stray
  // character there (like a ";" after the page) shows up for visitors
  it("has no stray text around the page", () => {
    const { container } = renderWithApp(<Home />);

    const page = container.querySelector(".contenthome");
    const strayText = [...(page?.childNodes ?? [])]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .filter((text) => text?.trim());
    expect(strayText).toEqual([]);
  });
});
