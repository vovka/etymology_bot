import type { Context } from "grammy";
import type { Stage } from "../etymology/Answer.js";
import { stripTags } from "./toTelegramHtml.js";

// Telegram clears "typing…" after ~5 seconds, so it has to be resent while work continues.
const TYPING_INTERVAL_MS = 4000;

const STAGE_TEXT: Record<Stage, string> = {
  researching: "🔎 Looking up dictionaries and sources…",
  writing: "✍️ Writing the story of this word…",
};

/** A status message that shows what the bot is doing and is finally replaced by the answer. */
export class ProgressIndicator {
  private messageId?: number;
  private typingTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly ctx: Context) {}

  async start(): Promise<void> {
    const sendTyping = () => this.ctx.replyWithChatAction("typing").catch(() => undefined);
    await sendTyping();
    this.messageId = (await this.ctx.reply(STAGE_TEXT.researching)).message_id;
    this.typingTimer = setInterval(sendTyping, TYPING_INTERVAL_MS);
  }

  async update(stage: Stage): Promise<void> {
    if (stage === "researching") return; // already shown by start()
    await this.edit(STAGE_TEXT[stage]).catch(() => undefined);
  }

  /** Falls back to plain text if Telegram rejects the markup (e.g. a tag cut off by truncation). */
  async finish(html: string): Promise<void> {
    this.stopTyping();
    try {
      await this.edit(html, "HTML");
    } catch {
      await this.edit(stripTags(html));
    }
  }

  async fail(text: string): Promise<void> {
    this.stopTyping();
    await this.edit(text);
  }

  private async edit(text: string, parseMode?: "HTML"): Promise<void> {
    const options = { parse_mode: parseMode, link_preview_options: { is_disabled: true } };
    await this.ctx.api.editMessageText(this.ctx.chat!.id, this.messageId!, text, options);
  }

  private stopTyping(): void {
    clearInterval(this.typingTimer);
  }
}
