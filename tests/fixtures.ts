import { vi } from "vitest";
import type { AssistantReply, ChatRequest, Provider, ToolCall } from "../src/providers/Provider.js";
import type { HttpGet } from "../src/research/Source.js";

const SAL_WIKITEXT = "==Latin==\n===Etymology===\nFrom {{inh|la|itc-pro|*sals}}.\n====Descendants====\n* French: sel";

export const seed = [{ name: "Wiktionary", url: "https://en.wiktionary.org/wiki/salary", text: "from Latin" }];

export const call = (id: string, name: string, args: object): ToolCall =>
  ({ id, name, arguments: JSON.stringify(args) });

/** Wiktionary has an entry for "sal"; every other request is a 404. */
export const fakeGet: HttpGet = async (url) => {
  const isSal = url.includes("wiktionary") && url.endsWith("page=sal");
  return isSal ? Response.json({ parse: { wikitext: SAL_WIKITEXT } }) : Response.json({}, { status: 404 });
};

export const text = (content: string): AssistantReply =>
  ({ content, toolCalls: [], message: { role: "assistant", content } });
export const tools = (...toolCalls: ToolCall[]): AssistantReply =>
  ({ content: "", toolCalls, message: { role: "assistant", content: "", toolCalls } });

/** A provider that plays back scripted replies and records every request. */
export function scripted(...replies: (AssistantReply | Error)[]) {
  const requests: ChatRequest[] = [];
  const provider: Provider = {
    chat: vi.fn(async (request: ChatRequest) => {
      requests.push(structuredClone(request));
      const next = replies.shift();
      if (!next || next instanceof Error) throw next ?? new Error("script ended");
      return next;
    }),
  };
  return { provider, requests };
}
