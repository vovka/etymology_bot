import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySchema } from "../src/billing/applySchema.js";
import { replyLanguage } from "../src/bot/replyLanguage.js";
import { loadText } from "../src/bot/texts.js";
import { formatAnswer, stripTags, toTelegramHtml } from "../src/bot/toTelegramHtml.js";
import { loadConfig, parseConfig } from "../src/config/loadConfig.js";
import { loadPrompt } from "../src/config/loadPrompt.js";
import { parseQuery } from "../src/etymology/parseQuery.js";

const limits = { maxWords: 3, maxLength: 60 };

describe("parseQuery", () => {
  it.each(["salary", "  hors   d'oeuvre ", "naïve", "слово", "kick the bucket"])("accepts %j", (text) => {
    expect(parseQuery(text, limits)).not.toBeNull();
  });
  it.each(["", "a b c d", "123", "hello!", "😀", "x".repeat(61)])("rejects %j", (text) => {
    expect(parseQuery(text, limits)).toBeNull();
  });
});

describe("toTelegramHtml", () => {
  it("keeps <b>/<i> and escapes everything else", () => {
    expect(toTelegramHtml("<b>a</b> <script>x</script> & <i>b</i>"))
      .toBe("<b>a</b> &lt;script&gt;x&lt;/script&gt; &amp; <i>b</i>");
  });
  it("appends sources as numbered links", () => {
    const sources = [{ number: 1, name: "Wiktionary", url: "https://w?a=1&b=2" }];
    const html = formatAnswer({ text: "<b>x</b> [1]", sources });
    expect(html).toBe('<b>x</b> [1]\n\n📚 [1] <a href="https://w?a=1&amp;b=2">Wiktionary</a>');
    expect(stripTags(html)).toBe("x [1]\n\n📚 [1] Wiktionary");
  });
  it("strips back to plain text", () => {
    expect(stripTags(toTelegramHtml("<b>a</b> < & >"))).toBe("a < & >");
  });
});

describe("replyLanguage", () => {
  it("names the user's language and falls back to the default", () => {
    expect(replyLanguage("uk", "en")).toBe("Ukrainian");
    expect(replyLanguage(undefined, "en")).toBe("English");
  });
});

describe("config", () => {
  it("loads the shipped config/app.yaml, with the free chain flattened into the paid ones", () => {
    const { tiers } = loadConfig();
    expect(tiers.free.modelChain.length).toBeGreaterThan(0);
    expect(tiers.basic.modelChain[0].model).toBe("anthropic/claude-haiku-5.5");
    expect(tiers.pro.modelChain.slice(2)).toEqual(tiers.free.modelChain);
    expect(tiers.unlimited).toMatchObject({ agent: "unlimited", requestsPerHour: null, priceStars: 500 });
    expect(tiers.unlimited.modelChain).toEqual(tiers.pro.modelChain);
    expect([tiers.unlimited.webSearch, tiers.pro.webSearch, tiers.free.webSearch]).toEqual([true, false, false]);
  });
  it("rejects a chain entry with an unknown provider", () => {
    const yaml = readFileSync("config/app.yaml", "utf8").replace("- provider: groq", "- provider: nope");
    expect(() => parseConfig(yaml)).toThrow();
  });
});

describe("loadText", () => {
  it("fills every plan price and limit into the user-facing texts", () => {
    const { tiers } = loadConfig();
    for (const name of ["welcome", "upgrade", "terms", "privacy", "description", "short-description"]) {
      expect(loadText(name, tiers)).not.toContain("{{");
    }
    expect(loadText("welcome", tiers)).toContain("250 ⭐");
    expect(loadText("welcome", tiers)).toContain("500 ⭐");
    // Telegram's limit for the bot description.
    expect(loadText("description", tiers).length).toBeLessThanOrEqual(512);
  });
});

describe("applySchema", () => {
  it("sends db/schema.sql one statement at a time", async () => {
    const statements: string[] = [];
    await applySchema({ query: async (text: string) => void statements.push(text) } as never);
    expect(statements.map((s) => s.split("\n").find((line) => line && !line.startsWith("--")))).toEqual([
      "CREATE TABLE IF NOT EXISTS users (",
      "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tier_check",
      "UPDATE users SET tier = 'pro' WHERE tier = 'premium'",
      "ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'basic', 'pro', 'unlimited'))",
      "CREATE TABLE IF NOT EXISTS payments (",
      "INSERT INTO users (telegram_id, tier) VALUES (434699468, 'free') ON CONFLICT (telegram_id) DO NOTHING",
    ]);
  });
});

describe("loadPrompt", () => {
  it("fills placeholders and leaves other braces alone", () => {
    expect(loadPrompt("reply-language", { language: "Ukrainian" })).toBe("Write the whole answer in Ukrainian.");
    expect(loadPrompt("tools/wiktionary")).toContain("{{der|en|ine-pro|*seh₂l-}}");
  });
});
