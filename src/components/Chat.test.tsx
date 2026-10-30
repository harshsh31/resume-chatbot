// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Chat from "./Chat";

// jsdom + userEvent can exceed the 5s default when the machine is busy
vi.setConfig({ testTimeout: 30000 });

const enc = new TextEncoder();

// Stream whose chunks are released manually so tests can observe incremental growth.
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => (controller = c),
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
    push: (s: string) => controller.enqueue(enc.encode(s)),
    close: () => controller.close(),
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const send = async (text: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/message/i), text);
  await user.click(screen.getByRole("button", { name: /send/i }));
  return user;
};

const inputEl = () => screen.getByLabelText(/message/i) as HTMLInputElement;

describe("streaming render", () => {
  // r[verify chat-ui.streams-into-view]
  it("grows the assistant message as chunks arrive and scrolls it into view", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const s = controlledStream();
    fetchMock.mockResolvedValue(s.response);
    render(<Chat />);
    await send("hi");

    s.push("Hel");
    await screen.findByText("Hel");
    s.push("lo there");
    await screen.findByText("Hello there");
    expect(scroll).toHaveBeenCalled();
    // send is disabled while streaming
    const btn = screen.getByRole("button", {
      name: /send/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    s.close();
    await waitFor(() => expect(inputEl().disabled).toBe(false));
  });

  // r[verify chat-ui.streams-into-view]
  it("sends full history on each request", async () => {
    fetchMock.mockImplementation(async () => new Response("answer"));
    render(<Chat />);
    const user = await send("one");
    await screen.findByText("answer");
    await user.type(screen.getByLabelText(/message/i), "two");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "two" },
    ]);
  });
});

describe("history hygiene", () => {
  // r[verify chat-ui.shows-errors]
  it("treats an empty 200 reply as an error and never sends empty history", async () => {
    fetchMock.mockResolvedValueOnce(new Response(""));
    fetchMock.mockResolvedValue(new Response("ok"));
    const { container } = render(<Chat />);
    const user = await send("hi");
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /something went wrong, please try again/i,
    );
    expect(container.querySelectorAll(".message-assistant")).toHaveLength(0);
    await user.type(inputEl(), "again");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(
      body.messages.every((m: { content: string }) => m.content.trim() !== ""),
    ).toBe(true);
  });

  // r[verify chat-ui.streams-into-view]
  it("trims the payload to <=20 messages starting with user and ending with the new message", async () => {
    fetchMock.mockImplementation(async () => new Response("a"));
    const { container } = render(<Chat />);
    for (let i = 0; i < 12; i++) {
      fireEvent.change(inputEl(), { target: { value: `q${i}` } });
      // enabled only once the previous stream has finished
      await waitFor(() =>
        expect(
          (screen.getByRole("button", { name: /send/i }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      );
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
      await waitFor(() =>
        expect(container.querySelectorAll(".message-assistant")).toHaveLength(
          i + 1,
        ),
      );
    }
    expect(container.querySelectorAll(".message")).toHaveLength(24);
    fireEvent.change(inputEl(), { target: { value: "last" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(13));
    const msgs = JSON.parse(fetchMock.mock.calls[12][1].body).messages;
    expect(msgs.length).toBeLessThanOrEqual(20);
    expect(msgs[0].role).toBe("user");
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "last" });
    expect(
      container.querySelectorAll(".message").length,
    ).toBeGreaterThanOrEqual(25);
  });
});

describe("starter questions", () => {
  // r[verify chat-ui.starter-questions]
  it("shows starters when empty and sends one as the first message, hiding starters", async () => {
    fetchMock.mockResolvedValue(new Response("ok"));
    render(<Chat />);
    const starters = screen.getAllByTestId("starter");
    expect(starters.length).toBeGreaterThanOrEqual(3);
    expect(starters.length).toBeLessThanOrEqual(4);
    const text = starters[0].textContent!;
    await userEvent.click(starters[0]);
    expect(screen.queryAllByTestId("starter")).toHaveLength(0);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: text }]);
  });
});

describe("errors", () => {
  // r[verify chat-ui.shows-errors]
  it.each([
    [429, /too many messages, please try again in a minute/i],
    [400, /too long|length limit/i],
    [500, /something went wrong, please try again/i],
  ])(
    "shows a readable message for HTTP %i and keeps input usable",
    async (status, re) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "RAW_SERVER_TEXT" }), { status }),
      );
      render(<Chat />);
      await send("hi");
      expect((await screen.findByRole("alert")).textContent).toMatch(re);
      expect(screen.queryByText(/RAW_SERVER_TEXT/)).toBeNull();
      expect(inputEl().disabled).toBe(false);
    },
  );

  // r[verify chat-ui.shows-errors]
  it("shows a generic message on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: secret-host"));
    render(<Chat />);
    await send("hi");
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /something went wrong, please try again/i,
    );
    expect(screen.queryByText(/secret-host/)).toBeNull();
    expect(inputEl().disabled).toBe(false);
  });

  // r[verify chat-ui.shows-errors]
  it("limits input to 1000 characters", () => {
    render(<Chat />);
    expect(inputEl().getAttribute("maxlength")).toBe("1000");
  });
});
