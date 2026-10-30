"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const MAX_LEN = 1000;
const MAX_HISTORY = 20; // server cap on messages per request
const GENERIC_ERROR = "Something went wrong, please try again";

const STARTERS = [
  "What has Harsh built recently?",
  "What is their experience with AI?",
  "What are their strongest skills?",
  "How can I contact them?",
];

function errorFor(status: number): string {
  if (status === 429) return "Too many messages, please try again in a minute";
  if (status === 400)
    return "That message is too long or the conversation is too long (limit: 1000 characters per message), please shorten it and try again";
  return GENERIC_ERROR;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // r[impl chat-ui.streams-into-view]
  useEffect(() => {
    // jsdom has no scrollIntoView
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, error]);

  // r[impl chat-ui.streams-into-view]
  // r[impl chat-ui.shows-errors]
  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    const history: Message[] = [...messages, { role: "user", content }];
    // server rejects >20 messages and empty content: trim only the payload, not the transcript
    const payload = history
      .filter((m) => m.content.trim() !== "")
      .slice(-MAX_HISTORY);
    while (payload[0]?.role === "assistant") payload.shift();
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      if (!res.ok || !res.body) throw new Error(errorFor(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        received += chunk;
        setMessages((m) => {
          const last = m[m.length - 1];
          return [
            ...m.slice(0, -1),
            { ...last, content: last.content + chunk },
          ];
        });
      }
      // a quiet upstream failure looks like HTTP 200 with an empty body
      if (received.trim() === "") throw new Error(GENERIC_ERROR);
    } catch (e) {
      // only our own mapped messages are shown; raw error text never reaches the UI
      const known = [errorFor(429), errorFor(400)];
      setError(
        e instanceof Error && known.includes(e.message)
          ? e.message
          : GENERIC_ERROR,
      );
      // drop the empty assistant placeholder if nothing streamed
      setMessages((m) =>
        m[m.length - 1]?.content === "" ? m.slice(0, -1) : m,
      );
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="chat">
      <h1 className="chat-title">Ask about Harsh</h1>
      <div className="chat-messages" aria-live="polite">
        {/* r[impl chat-ui.starter-questions] */}
        {messages.length === 0 && (
          <ul className="starters">
            {STARTERS.map((q) => (
              <li key={q}>
                <button
                  type="button"
                  data-testid="starter"
                  className="starter"
                  onClick={() => send(q)}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        )}
        {messages.map((m, i) => (
          <p key={i} className={`message message-${m.role}`}>
            {m.content}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && (
        <p role="alert" className="chat-error">
          {error}
        </p>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          Message
        </label>
        <input
          id="chat-input"
          className="chat-input"
          value={input}
          maxLength={MAX_LEN}
          autoComplete="off"
          placeholder="Ask a question..."
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="chat-send"
          disabled={streaming || !input.trim()}
        >
          Send
        </button>
      </form>
    </main>
  );
}
