import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/providers/OpenAICompatibleProvider.js";
import { RateLimitError, type ChatRequest } from "../src/providers/Provider.js";

const config = { type: "openai-compatible", baseUrl: "https://api.test/v1", apiKeyEnv: "X", headers: { "X-Title": "t" } };
const request: ChatRequest = {
  model: "m", messages: [], maxTokens: 10, temperature: 0, timeoutMs: 1000, extraBody: { reasoning_effort: "low" },
};
const mockFetch = (response: Response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
const sentBody = (spy: ReturnType<typeof mockFetch>) => JSON.parse(String(spy.mock.calls[0][1]?.body));
const chat = (r: ChatRequest = request) => new OpenAICompatibleProvider(config, "key").chat(r);

afterEach(() => vi.restoreAllMocks());

describe("OpenAICompatibleProvider", () => {
  it("posts a chat completion and returns the content", async () => {
    const fetchSpy = mockFetch(Response.json({ choices: [{ message: { content: " hi " } }] }));
    expect((await chat()).content).toBe("hi");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.test/v1/chat/completions");
    expect(sentBody(fetchSpy)).toMatchObject({ model: "m", max_tokens: 10, temperature: 0, reasoning_effort: "low" });
    expect(sentBody(fetchSpy)).not.toHaveProperty("tools");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer key", "X-Title": "t" });
  });

  it("leaves temperature out when it is undefined", async () => {
    const fetchSpy = mockFetch(Response.json({ choices: [{ message: { content: "hi" } }] }));
    await chat({ ...request, temperature: undefined });
    expect(sentBody(fetchSpy)).not.toHaveProperty("temperature");
  });

  it("returns tool calls and keeps reasoning details to send back", async () => {
    mockFetch(Response.json({ choices: [{ message: {
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "wiktionary", arguments: '{"term":"sal"}' } }],
      reasoning_details: [{ type: "reasoning.encrypted", data: "x" }],
    } }] }));
    const reply = await chat();
    expect(reply.toolCalls).toEqual([{ id: "c1", name: "wiktionary", arguments: '{"term":"sal"}' }]);
    expect(reply.message.providerData).toEqual({ reasoning_details: [{ type: "reasoning.encrypted", data: "x" }] });
  });

  it("sends tools and a tool-call conversation in the OpenAI wire format", async () => {
    const fetchSpy = mockFetch(Response.json({ choices: [{ message: { content: "done" } }] }));
    await chat({
      ...request,
      tools: [{ name: "wiktionary", description: "d", parameters: { type: "object" } }],
      toolChoice: "none",
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "wiktionary", arguments: "{}" }],
          providerData: { reasoning_details: ["r"] } },
        { role: "tool", toolCallId: "c1", content: "result" },
      ],
    });
    const body = sentBody(fetchSpy);
    expect(body.tools).toEqual([{ type: "function", function: { name: "wiktionary", description: "d", parameters: { type: "object" } } }]);
    expect(body.tool_choice).toBe("none");
    expect(body.messages[1]).toEqual({
      role: "assistant", content: null, reasoning_details: ["r"],
      tool_calls: [{ id: "c1", type: "function", function: { name: "wiktionary", arguments: "{}" } }],
    });
    expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "result" });
  });

  it("maps 429 with Retry-After to a RateLimitError", async () => {
    mockFetch(new Response("slow down", { status: 429, headers: { "retry-after": "17" } }));
    const error = await chat().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(17);
  });

  it("flags daily quota errors", async () => {
    mockFetch(new Response("Rate limit exceeded: free-models-per-day", { status: 429 }));
    const error = (await chat().catch((e: unknown) => e)) as RateLimitError;
    expect(error.isDailyQuota).toBe(true);
  });

  it("treats an empty completion as a failure", async () => {
    mockFetch(Response.json({ choices: [{ message: { content: "" } }] }));
    await expect(chat()).rejects.toThrow("Empty");
  });
});
