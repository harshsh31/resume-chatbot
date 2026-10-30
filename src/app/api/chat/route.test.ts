import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mocks.stream };
    constructor(opts: unknown) {
      mocks.ctor(opts);
    }
  },
}));

import { POST } from "@/app/api/chat/route";

const KEY = "sk-ant-test-secret-key-123";
let ipCounter = 0;

function req(body: unknown, ip = `203.0.113.${++ipCounter}`, raw?: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `${ip}, 10.0.0.1`,
    },
    body: raw ?? JSON.stringify(body),
  });
}

const valid = {
  messages: [{ role: "user", content: "Where did Harsh work?" }],
};

function events(...texts: string[]) {
  return (async function* () {
    for (const text of texts) {
      yield {
        type: "content_block_delta",
        delta: { type: "text_delta", text },
      };
    }
    yield { type: "message_stop" };
  })();
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  vi.stubEnv("CHAT_MODEL", "");
  vi.unstubAllEnvs();
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
  delete process.env.CHAT_MODEL;
  mocks.stream.mockReset();
  mocks.ctor.mockReset();
  mocks.stream.mockImplementation(() => events("Hello", " world"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/chat", () => {
  // r[verify chat-assistant.streams-replies]
  it("streams text deltas as plain text", async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("Hello world");
    const args = mocks.stream.mock.calls[0][0];
    expect(args.messages).toEqual(valid.messages);
    expect(args.system).toContain("Answer only from the content");
    expect(args.max_tokens).toBeGreaterThan(0);
  });

  // r[verify chat-assistant.streams-replies]
  it("emits the first chunk before generation completes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mocks.stream.mockImplementation(() =>
      (async function* () {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "first" },
        };
        await gate;
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "second" },
        };
      })(),
    );
    const res = await POST(req(valid));
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("first");
    release();
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toBe("second");
    expect((await reader.read()).done).toBe(true);
  });

  // r[verify chat-assistant.streams-replies]
  it("closes the stream cleanly without leaking details when upstream errors mid-stream", async () => {
    mocks.stream.mockImplementation(() =>
      (async function* () {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "partial" },
        };
        throw new Error(`boom ${KEY}`);
      })(),
    );
    const res = await POST(req(valid));
    const text = await res.text();
    expect(text).toBe("partial");
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("boom");
  });

  // r[verify chat-assistant.model-from-env]
  it("defaults the model to claude-haiku-5-5", async () => {
    await (await POST(req(valid))).text();
    expect(mocks.stream.mock.calls[0][0].model).toBe("claude-haiku-5-5");
  });

  // r[verify chat-assistant.model-from-env]
  it("uses CHAT_MODEL when set", async () => {
    vi.stubEnv("CHAT_MODEL", "claude-custom-model");
    await (await POST(req(valid))).text();
    expect(mocks.stream.mock.calls[0][0].model).toBe("claude-custom-model");
  });

  // r[verify chat-assistant.answers-from-about-only]
  it("sends a system prompt built from content/about.md", async () => {
    await (await POST(req(valid))).text();
    expect(mocks.stream.mock.calls[0][0].system).toContain("TODO(Harsh)");
  });

  // r[verify abuse-protection.caps-message-and-history-size]
  it.each([
    ["malformed json", undefined, "{not json"],
    ["wrong shape", { nope: 1 }, undefined],
    [
      "oversized message",
      { messages: [{ role: "user", content: "a".repeat(1001) }] },
      undefined,
    ],
    [
      "oversized earlier message",
      {
        messages: [
          { role: "user", content: "a".repeat(1001) },
          { role: "assistant", content: "ok" },
          { role: "user", content: "hi" },
        ],
      },
      undefined,
    ],
    [
      "empty assistant message in history",
      {
        messages: [
          { role: "user", content: "a" },
          { role: "assistant", content: "" },
          { role: "user", content: "b" },
        ],
      },
      undefined,
    ],
    ["whitespace-only user message", { messages: [{ role: "user", content: "   " }] }, undefined],
    [
      "oversized history",
      {
        messages: Array.from({ length: 21 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: "x",
        })),
      },
      undefined,
    ],
  ])("returns 400 and does not call the API: %s", async (_n, body, raw) => {
    const res = await POST(req(body, undefined, raw));
    expect(res.status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.ctor).not.toHaveBeenCalled();
  });

  // r[verify abuse-protection.rate-limits-per-ip]
  it("returns 429 with Retry-After on the 11th request and does not call the API", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 10; i++) {
      const ok = await POST(req(valid, ip));
      expect(ok.status).toBe(200);
      await ok.text();
    }
    mocks.stream.mockClear();
    const res = await POST(req(valid, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  // r[verify abuse-protection.rate-limits-per-ip]
  it("rate limits before validating the body", async () => {
    const ip = "198.51.100.78";
    for (let i = 0; i < 10; i++) await POST(req(null, ip, "{bad"));
    const res = await POST(req(valid, ip));
    expect(res.status).toBe(429);
  });

  // r[verify abuse-protection.fails-safe-without-key]
  it("returns a generic 500 when the key is missing and does not call the API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await POST(req(valid));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: "Server error" });
    expect(body).not.toMatch(/ANTHROPIC|key|env/i);
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.ctor).not.toHaveBeenCalled();
  });

  // r[verify abuse-protection.key-stays-server-side]
  it("never includes or logs the key or message content on error paths", async () => {
    const spies = (["log", "error", "warn", "info"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const bodies: string[] = [];

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    bodies.push(await (await POST(req(valid))).text());
    vi.stubEnv("ANTHROPIC_API_KEY", KEY);

    bodies.push(await (await POST(req(null, undefined, "{bad"))).text());

    mocks.stream.mockImplementation(() => {
      throw new Error(`upstream ${KEY}`);
    });
    const res = await POST(req(valid));
    bodies.push(await res.text());

    for (const b of bodies) expect(b).not.toContain(KEY);
    for (const s of spies) {
      for (const call of s.mock.calls) {
        const logged = JSON.stringify(call);
        expect(logged).not.toContain(KEY);
        expect(logged).not.toContain("Where did Harsh work?");
      }
      s.mockRestore();
    }
  });

  // r[verify abuse-protection.key-stays-server-side]
  it("reads the key from the server env var only", async () => {
    await (await POST(req(valid))).text();
    expect(mocks.ctor).toHaveBeenCalledWith({ apiKey: KEY });
  });
});
