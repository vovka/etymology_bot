import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ReplayHttp } from "../../evals/run/ReplayHttp.js";

// A folder that doesn't exist yet, as on the first run.
const file = () => path.join(mkdtempSync(path.join(tmpdir(), "replay-")), "fixtures", "http.json");

describe("ReplayHttp", () => {
  it("fetches once, then replays from the saved file", async () => {
    const live = vi.fn(async () => new Response("page", { status: 200 }));
    const filePath = file();
    const first = new ReplayHttp(live, filePath);
    expect(await (await first.get("https://x")).text()).toBe("page");
    first.save();
    const replay = new ReplayHttp(live, filePath);
    const response = await replay.get("https://x");
    expect([response.status, await response.text()]).toEqual([200, "page"]);
    expect(live).toHaveBeenCalledTimes(1);
  });

  it.each([503, 429, 403])("does not keep a %i response", async (status) => {
    const live = vi.fn(async () => new Response("blocked", { status }));
    const http = new ReplayHttp(live, file());
    await http.get("https://x");
    await http.get("https://x");
    expect(live).toHaveBeenCalledTimes(2);
  });

  it("keeps a 404, which is a real answer (no such page)", async () => {
    const live = vi.fn(async () => new Response("", { status: 404 }));
    const http = new ReplayHttp(live, file());
    await http.get("https://x");
    expect((await http.get("https://x")).status).toBe(404);
    expect(live).toHaveBeenCalledTimes(1);
  });
});
