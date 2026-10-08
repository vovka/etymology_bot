import { describe, expect, it, vi } from "vitest";
import { ResearchToolbox } from "../src/etymology/agent/ResearchToolbox.js";
import { SourceRegistry } from "../src/etymology/agent/SourceRegistry.js";
import type { HttpGet } from "../src/research/Source.js";
import { call, fakeGet, seed } from "./fixtures.js";

const box = (get: HttpGet = fakeGet) => new ResearchToolbox(get, new SourceRegistry(seed), 1000);

describe("ResearchToolbox", () => {
  it("describes its tools with JSON schemas", () => {
    const wikipedia = box().definitions.find((d) => d.name === "wikipedia")!;
    expect(wikipedia.parameters).toMatchObject({ type: "object", required: ["title"] });
    expect(wikipedia.parameters).not.toHaveProperty("$schema");
  });

  it("reads Wiktionary etymology and descendants as a numbered source", async () => {
    const result = await box().run(call("1", "wiktionary", { term: "sal" }));
    expect(result).toMatch(/^Source \[2\] Wiktionary \(https:\/\/en\.wiktionary\.org\/wiki\/sal\)/);
    expect(result).toContain("Descendants");
  });

  it("reports bad input as text instead of throwing", async () => {
    expect(await box().run({ id: "1", name: "wiktionary", arguments: "{oops" })).toContain("invalid arguments");
    expect(await box().run({ id: "2", name: "nope", arguments: "{}" })).toContain("unknown tool");
    expect(await box().run(call("3", "wiktionary", { term: "zzz" }))).toBe('Nothing found for "zzz".');
  });

  it("only reads Wikipedia hosts", async () => {
    const get = vi.fn(fakeGet);
    const result = await box(get).run(call("1", "wikipedia", { title: "Salt", language: "evil.com/x" }));
    expect(result).toContain("invalid arguments");
    expect(get).not.toHaveBeenCalled();
  });

  it("reads other language editions and search results", async () => {
    const summary = { extract: "Salz ist…", content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Salz" } } };
    const get: HttpGet = async (url) => url.startsWith("https://de.wikipedia.org/api/")
      ? Response.json(summary)
      : Response.json({ pages: [{ title: "Via Salaria", description: "<b>Roman</b> road" }] });
    const toolbox = box(get);
    expect(await toolbox.run(call("1", "wikipedia", { title: "Salz", language: "de" })))
      .toBe("Source [2] Wikipedia (de) (https://de.wikipedia.org/wiki/Salz)\nSalz ist…");
    expect(await toolbox.run(call("2", "wikipedia_search", { query: "salt road" }))).toBe("- Via Salaria: Roman road");
  });

  it("fetches a repeated lookup once and labels calls for the progress message", async () => {
    const get = vi.fn(fakeGet);
    const toolbox = box(get);
    await toolbox.run(call("1", "etymonline", { term: "salt" }));
    await toolbox.run(call("2", "etymonline", { term: "salt" }));
    expect(get).toHaveBeenCalledTimes(1);
    expect(toolbox.describe(call("3", "wikipedia", { title: "Salz" }))).toBe("Wikipedia «Salz»");
  });
});
