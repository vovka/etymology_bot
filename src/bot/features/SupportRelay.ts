import type { Bot, CommandContext, Context, NextFunction } from "grammy";
import type { UserRepository } from "../../billing/UserRepository.js";
import { messages } from "../messages.js";

// Tags the message sent to the admin, so the admin's reply can be routed back to the user.
const USER_TAG = /#user(\d+)/;

/** /support and /paysupport forward the user's message to the admin; the admin's replies go back to the user. */
export class SupportRelay {
  constructor(private readonly adminChatId: number, private readonly users: Pick<UserRepository, "tierOf">) {}

  register(bot: Bot): void {
    for (const command of ["support", "paysupport"]) bot.command(command, (ctx) => this.forward(ctx, command));
    bot.on("message:text", (ctx, next) => this.relayReply(ctx, next));
  }

  private async forward(ctx: CommandContext<Context>, command: string): Promise<void> {
    const text = ctx.match.trim();
    if (!text || !ctx.from) return void (await ctx.reply(messages.supportUsage(command)));
    const { id, username, first_name } = ctx.from;
    const who = username ? `@${username}` : first_name;
    const tier = await this.users.tierOf(id);
    await ctx.api.sendMessage(this.adminChatId, `#${command} from ${who} #user${id} (${tier})\n\n${text}`);
    await ctx.reply(messages.supportSent);
  }

  /** Anything other than the admin replying to a forwarded message goes on to the next handler. */
  private async relayReply(ctx: Context, next: NextFunction): Promise<void> {
    const repliedTo = ctx.msg?.reply_to_message?.text ?? "";
    const userId = ctx.chat?.id === this.adminChatId ? USER_TAG.exec(repliedTo)?.[1] : undefined;
    if (!userId) return next();
    await ctx.api.sendMessage(Number(userId), messages.supportReply(ctx.msg!.text!));
    await ctx.reply("Sent.");
  }
}
