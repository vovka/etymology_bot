import { describe, expect, it } from "vitest";
import { SourceRegistry } from "../src/etymology/agent/SourceRegistry.js";
import { seed } from "./fixtures.js";

describe("SourceRegistry", () => {
  it("numbers sources once and finds the cited ones in any citation style", () => {
    const registry = new SourceRegistry(seed);
    registry.add({ name: "B", url: "b", text: "" });
    expect(registry.add({ name: "B again", url: "b", text: "" }).number).toBe(2);
    registry.add({ name: "C", url: "c", text: "" });
    expect(registry.citedIn("x [1, 3]").map((s) => s.number)).toEqual([1, 3]);
    expect(registry.citedIn("no citations")).toHaveLength(3);
  });
});
