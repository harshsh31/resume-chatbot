export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ValidationResult =
  { ok: true; messages: ChatMessage[] } | { ok: false };

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 1000;

// r[impl abuse-protection.caps-message-and-history-size]
export function validateChatBody(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) return { ok: false };
  const messages = (body as { messages?: unknown }).messages;
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > MAX_MESSAGES
  ) {
    return { ok: false };
  }
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return { ok: false };
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string"
    ) {
      return { ok: false };
    }
  }
  const typed = messages as ChatMessage[];
  const last = typed[typed.length - 1];
  if (last.role !== "user" || last.content.length > MAX_MESSAGE_CHARS)
    return { ok: false };
  return {
    ok: true,
    messages: typed.map(({ role, content }) => ({ role, content })),
  };
}
