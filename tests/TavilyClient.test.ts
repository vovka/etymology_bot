import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilyClient } from "../src/research/TavilyClient.js";

const client = new TavilyClient("key", { apiKeyEnv: "TAVILY_API_KEY", maxResults: 3, timeoutMs: 1000 });
const mockFetch = (response: Response) => vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

afterEach(() => vi.restoreAllMocks());

describe("TavilyClient", () => {
  it("searches with the key and the configured number of results", async () => {
    const result = { title: "Salt money", url: "https://blog.test/salt", content: "Roman pay." };
    const fetchSpy = mockFetch(Response.json({ results: [result] }));
    expect(await client.search("salary")).toEqual([result]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(String(init?.body))).toMatchObject({ query: "salary", max_results: 3 });
    expect(init?.headers).toMatchObject({ Authorization: "Bearer key" });
  });

  it("reads a page, or returns null when Tavily could not", async () => {
    mockFetch(Response.json({ results: [{ url: "https://blog.test/salt", raw_content: "Full page" }] }));
    expect(await client.extract("https://blog.test/salt")).toBe("Full page");
    vi.restoreAllMocks();
    mockFetch(Response.json({ results: [], failed_results: [{ url: "https://blog.test/salt", error: "404" }] }));
    expect(await client.extract("https://blog.test/salt")).toBeNull();
  });

  it("throws with the status when the credits are used up", async () => {
    mockFetch(new Response("limit", { status: 432 }));
    await expect(client.search("salary")).rejects.toThrow("432");
  });
});
