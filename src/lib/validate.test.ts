import { describe, expect, it } from "vitest";
import { validateChatBody } from "@/lib/validate";

const msg = (role: string, content: string) => ({ role, content });

describe("validateChatBody", () => {
  // r[verify abuse-protection.caps-message-and-history-size]
  it("accepts a valid history ending in a user message", () => {
    const r = validateChatBody({
      messages: [
        msg("user", "hi"),
        msg("assistant", "hello"),
        msg("user", "more"),
      ],
    });
    expect(r.ok).toBe(true);
  });

  // r[verify abuse-protection.caps-message-and-history-size]
  it("accepts a 1000 char message and rejects 1001", () => {
    expect(
      validateChatBody({ messages: [msg("user", "a".repeat(1000))] }).ok,
    ).toBe(true);
    expect(
      validateChatBody({ messages: [msg("user", "a".repeat(1001))] }).ok,
    ).toBe(false);
  });

  // r[verify abuse-protection.caps-message-and-history-size]
  it("accepts 20 messages and rejects 21", () => {
    const build = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", "x"),
      );
    expect(validateChatBody({ messages: build(19) }).ok).toBe(true);
    expect(validateChatBody({ messages: build(21) }).ok).toBe(false);
  });

  // r[verify abuse-protection.caps-message-and-history-size]
  it.each([
    ["null", null],
    ["string", "hi"],
    ["no messages key", {}],
    ["messages not array", { messages: "x" }],
    ["empty array", { messages: [] }],
    ["bad role", { messages: [msg("system", "x")] }],
    ["non-string content", { messages: [{ role: "user", content: 5 }] }],
    [
      "last is assistant",
      { messages: [msg("user", "a"), msg("assistant", "b")] },
    ],
    ["null entry", { messages: [null] }],
  ])("rejects malformed body: %s", (_n, body) => {
    expect(validateChatBody(body).ok).toBe(false);
  });
});
