import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The theme's colors, read from paper.css, so a new color that's too faint
// fails here instead of on a student's screen. (Read from disk: the tests
// load stylesheets as empty files.) Run from client/ or the repo's root.
const file = ["src/theme/paper.css", "client/src/theme/paper.css"].map((p) => resolve(p)).find(existsSync);
const css = file ? readFileSync(file, "utf8") : "";
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
const token = (name: string): string => {
  const match = root.match(new RegExp(`--paper-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`No --paper-${name} color in paper.css`);
  return match[1];
};

// WCAG 2 relative luminance and contrast ratio
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme colors", () => {
  // Text: at least 4.5:1
  it.each([
    ["ink", "sky"],
    ["ink", "white"],
    ["muted", "sky"],
    ["muted", "white"],
    ["action-ink", "action"],
    ["done-ink", "done-bg"],
    ["turn-ink", "turn-bg"],
    ["retry-ink", "retry-bg"],
  ])("%s text on %s is easy to read", (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  // Sense buttons and stickers: ink on each sense's color
  it.each(["see", "hear", "feel", "smell", "taste"])("ink on the %s color is easy to read", (sense) => {
    expect(contrast(token("ink"), token(`sense-${sense}`))).toBeGreaterThanOrEqual(4.5);
  });

  // Big, bold text only (the logo's "ME"): at least 3:1
  it("brand-ink on brand is readable as big text", () => {
    expect(contrast(token("brand-ink"), token("brand"))).toBeGreaterThanOrEqual(3);
  });

  // Outlines of boxes and buttons: at least 3:1
  it.each(["white", "sky"])("the control edge stands out on %s", (background) => {
    expect(contrast(token("control-edge"), token(background))).toBeGreaterThanOrEqual(3);
  });
});
