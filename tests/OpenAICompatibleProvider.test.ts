import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/providers/OpenAICompatibleProvider.js";
import { RateLimitError } from "../src/providers/Provider.js";

const config = { type: "openai-compatible", baseUrl: "https://api.test/v1", apiKeyEnv: "X", headers: { "X-Title": "t" } };
const request = {
  model: "m", messages: [], maxTokens: 10, temperature: 0, timeoutMs: 1000, extraBody: { reasoning_effort: "low" },
};
const mockFetch = (response: Response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

afterEach(() => vi.restoreAllMocks());

describe("OpenAICompatibleProvider", () => {
  it("posts a chat completion and returns the content", async () => {
    const fetchSpy = mockFetch(Response.json({ choices: [{ message: { content: " hi " } }] }));
    expect(await new OpenAICompatibleProvider(config, "key").complete(request)).toBe("hi");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.test/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "m", max_tokens: 10, reasoning_effort: "low" });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer key", "X-Title": "t" });
  });

  it("maps 429 with Retry-After to a RateLimitError", async () => {
    mockFetch(new Response("slow down", { status: 429, headers: { "retry-after": "17" } }));
    const error = await new OpenAICompatibleProvider(config, "key").complete(request).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSeconds).toBe(17);
  });

  it("flags daily quota errors", async () => {
    mockFetch(new Response("Rate limit exceeded: free-models-per-day", { status: 429 }));
    const error = await new OpenAICompatibleProvider(config, "key").complete(request).catch((e) => e);
    expect(error.isDailyQuota).toBe(true);
  });

  it("treats an empty completion as a failure", async () => {
    mockFetch(Response.json({ choices: [{ message: { content: "" } }] }));
    await expect(new OpenAICompatibleProvider(config, "key").complete(request)).rejects.toThrow("Empty");
  });
});
