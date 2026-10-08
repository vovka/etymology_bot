import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replyLanguage } from "../src/bot/replyLanguage.js";
import { formatAnswer, stripTags, toTelegramHtml } from "../src/bot/toTelegramHtml.js";
import { loadConfig, parseConfig } from "../src/config/loadConfig.js";
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
  it("loads the shipped config/app.yaml", () => {
    expect(loadConfig().modelChain.length).toBeGreaterThan(0);
  });
  it("rejects a chain entry with an unknown provider", () => {
    const yaml = readFileSync("config/app.yaml", "utf8").replace("- provider: groq", "- provider: nope");
    expect(() => parseConfig(yaml)).toThrow();
  });
});
