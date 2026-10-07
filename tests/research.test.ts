import { describe, expect, it } from "vitest";
import { extractDescription } from "../src/research/EtymonlineSource.js";
import { Researcher } from "../src/research/Researcher.js";
import type { Source } from "../src/research/Source.js";
import { extractEtymologies, WiktionarySource } from "../src/research/WiktionarySource.js";
import { decodeHtmlEntities } from "../src/utils/decodeHtmlEntities.js";

const WIKITEXT = `==English==
===Etymology===
From {{inh|en|enm|salarie}}, from {{der|en|la|salārium}}.

===Noun===
{{en-noun}}
# Fixed pay.

==Latin==
===Etymology 1===
From {{m|la|sāl||salt}}.
===Etymology 2===
`;

describe("WiktionarySource", () => {
  it("keeps only non-empty Etymology sections, labelled by language", () => {
    expect(extractEtymologies(WIKITEXT)).toBe(
      "[English] Etymology:\nFrom {{inh|en|enm|salarie}}, from {{der|en|la|salārium}}.\n\n" +
        "[Latin] Etymology 1:\nFrom {{m|la|sāl||salt}}.",
    );
  });

  it("retries in lowercase when the exact title has no entry", async () => {
    const urls: string[] = [];
    const source = new WiktionarySource(async (url) => {
      urls.push(url);
      return Response.json(url.includes("page=salary") ? { parse: { wikitext: WIKITEXT } } : { error: {} });
    });
    const doc = await source.lookup("Salary");
    expect(urls).toHaveLength(2);
    expect(doc?.url).toBe("https://en.wiktionary.org/wiki/salary");
  });
});

describe("Etymonline description", () => {
  it("reads the meta description regardless of attribute order and decodes entities", () => {
    const html = `<meta content="x" name="viewport"><meta content="from Latin &quot;salarium&quot; &#8212; salt" property="og:description">`;
    expect(extractDescription(html)).toBe('from Latin "salarium" — salt');
    expect(extractDescription("<html></html>")).toBeNull();
  });

  it("decodes hex entities", () => {
    expect(decodeHtmlEntities("&#x101; &unknown;")).toBe("ā &unknown;");
  });
});

describe("Researcher", () => {
  it("keeps successful sources, truncated, and drops failing or empty ones", async () => {
    const sources: Source[] = [
      { lookup: async () => ({ name: "A", url: "u", text: "abcdef" }) },
      { lookup: async () => { throw new Error("down"); } },
      { lookup: async () => null },
    ];
    expect(await new Researcher(sources, 3).research("w")).toEqual([{ name: "A", url: "u", text: "abc" }]);
  });
});
