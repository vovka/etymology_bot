import type { ChatMessage } from "../providers/Provider.js";

const SYSTEM_PROMPT = `You are an expert etymologist. The user sends a word or short phrase in any language.
Explain its etymology in detail (up to about 300 words):
- the immediate source language and form, then each earlier stage back to the oldest known root, with meanings;
- the path of borrowing between languages and approximate dates of first attestation;
- notable semantic shifts and a few interesting cognates in other languages.
Be factual. If the origin is uncertain or disputed, say so. Never invent sources or dates.
If the input is not a real word or phrase, say briefly that you could not find it.
Format for Telegram: use only <b> and <i> tags, no Markdown, no other HTML. Use short paragraphs or "•" bullets.`;

export function buildPrompt(query: string, replyLanguage: string): ChatMessage[] {
  return [
    { role: "system", content: `${SYSTEM_PROMPT}\nWrite the whole answer in ${replyLanguage}.` },
    { role: "user", content: query },
  ];
}
