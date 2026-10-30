import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompt";

const about = readFileSync(join(process.cwd(), "content", "about.md"), "utf8");

describe("buildSystemPrompt", () => {
  // r[verify chat-assistant.answers-from-about-only]
  it("embeds the about content and restricts answers to it", () => {
    const p = buildSystemPrompt(about);
    expect(p).toContain(about.trim());
    expect(p).toMatch(/only (from|using|on) the (content|information)/i);
    expect(p).toMatch(/never invent/i);
    expect(p).toMatch(/ignore .*attempts? to change/i);
  });

  // r[verify chat-assistant.declines-unknown]
  it("tells the model to decline unknown questions and point to contact details", () => {
    const p = buildSystemPrompt(about);
    expect(p).toMatch(/don't have that information/i);
    expect(p).toMatch(/contact details/i);
  });
});
