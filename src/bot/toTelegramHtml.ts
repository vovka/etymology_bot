const TELEGRAM_MESSAGE_LIMIT = 4096;
const ALLOWED_TAG = /&lt;(\/?)(b|i)&gt;/g;

/** Escapes model output so only <b>/<i> survive; anything else can't break Telegram's HTML parser. */
export function toTelegramHtml(text: string): string {
  const escaped = text
    .slice(0, TELEGRAM_MESSAGE_LIMIT - 100)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(ALLOWED_TAG, "<$1$2>");
}

export function stripTags(html: string): string {
  return html.replace(/<\/?(b|i)>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
