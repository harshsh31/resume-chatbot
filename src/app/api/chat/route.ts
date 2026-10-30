import Anthropic from "@anthropic-ai/sdk";
import { getSystemPrompt } from "@/lib/prompt";
import { createRateLimiter } from "@/lib/rate-limit";
import { validateChatBody } from "@/lib/validate";

export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 600;

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

// r[impl chat-assistant.streams-replies]
// r[impl chat-assistant.model-from-env]
// r[impl abuse-protection.fails-safe-without-key]
// r[impl abuse-protection.key-stays-server-side]
export async function POST(req: Request): Promise<Response> {
  // Key is read only here, server-side; never NEXT_PUBLIC_, never logged or returned.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "Server error" }, 500);

  const limit = limiter.check(clientIp(req));
  if (!limit.allowed) {
    return json({ error: "Too many requests" }, 429, {
      "retry-after": String(limit.retryAfterSec),
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = validateChatBody(body);
  if (!parsed.ok) return json({ error: "Invalid request" }, 400);

  let stream: ReturnType<Anthropic["messages"]["stream"]>;
  try {
    stream = new Anthropic({ apiKey }).messages.stream({
      model: process.env.CHAT_MODEL || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: getSystemPrompt(),
      messages: parsed.messages,
    });
  } catch {
    return json({ error: "Server error" }, 500);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        // Upstream failure mid-stream: end the response without leaking details.
      }
      try {
        controller.close();
      } catch {
        // already closed (client cancelled)
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
