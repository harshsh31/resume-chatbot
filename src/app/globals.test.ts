import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("mobile layout (manual check: open at 375px width, expect no horizontal scroll)", () => {
  // r[verify chat-ui.mobile-friendly]
  it("has flex column full-height layout and wrapping rules", () => {
    expect(css).toMatch(/display:\s*flex/);
    expect(css).toMatch(/flex-direction:\s*column/);
    expect(css).toMatch(/min-height:\s*100dvh|height:\s*100dvh/);
    expect(css).toMatch(/min-width:\s*0/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  });

  // r[verify chat-ui.mobile-friendly]
  it("uses input font-size of at least 16px and no widths above 100%", () => {
    const input = css.match(/\.chat-input[^{]*\{[^}]*font-size:\s*(\d+)px/);
    expect(input && Number(input[1])).toBeGreaterThanOrEqual(16);
    for (const m of css.matchAll(/(?<!max-|min-)width:\s*(\d+)(%|vw)/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(100);
    }
    // fixed pixel widths are banned (1px is the visually-hidden helper)
    expect(css).not.toMatch(/(?<!max-|min-)width:\s*(?!1px)\d+px/);
  });

  // r[verify chat-ui.mobile-friendly]
  it("is imported by layout with a viewport export", () => {
    expect(layout).toContain('import "./globals.css"');
    expect(layout).toMatch(/export const viewport/);
  });
});
