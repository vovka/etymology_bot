import type { ToolCall } from "../src/providers/Provider.js";
import type { HttpGet } from "../src/research/Source.js";

const SAL_WIKITEXT = "==Latin==\n===Etymology===\nFrom {{inh|la|itc-pro|*sals}}.\n====Descendants====\n* French: sel";

export const seed = [{ name: "Wiktionary", url: "https://en.wiktionary.org/wiki/salary", text: "from Latin" }];

export const call = (id: string, name: string, args: object): ToolCall =>
  ({ id, name, arguments: JSON.stringify(args) });

/** Wiktionary has an entry for "sal"; every other request is a 404. */
export const fakeGet: HttpGet = async (url) => {
  const isSal = url.includes("wiktionary") && url.includes("page=sal");
  return isSal ? Response.json({ parse: { wikitext: SAL_WIKITEXT } }) : Response.json({}, { status: 404 });
};
