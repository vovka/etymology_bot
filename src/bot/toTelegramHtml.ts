import type { Answer } from "../etymology/Answer.js";

// Telegram allows 4096 characters; leave room for the sources footer.
const MAX_ANSWER_LENGTH = 3600;
const ALLOWED_TAG = /&lt;(\/?)(b|i)&gt;/g;

export function formatAnswer(answer: Answer): string {
  return toTelegramHtml(answer.text) + sourcesFooter(answer.sources);
}

/** Escapes model output so only <b>/<i> survive; anything else can't break Telegram's HTML parser. */
export function toTelegramHtml(text: string): string {
  return escapeHtml(text.slice(0, MAX_ANSWER_LENGTH)).replace(ALLOWED_TAG, "<$1$2>");
}

export function stripTags(html: string): string {
  return html.replace(/<\/?(b|i|a)\b[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function sourcesFooter(sources: Answer["sources"]): string {
  if (sources.length === 0) return "";
  const links = sources.map((s, i) => `[${i + 1}] <a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`);
  return `\n\n📚 ${links.join(" · ")}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
