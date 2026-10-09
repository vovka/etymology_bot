export const messages = {
  invalidQuery: "Please send a single word or a short phrase (letters only, a few words at most).",
  rateLimited: "You've reached the hourly limit. Please try again later.",
  rateLimitedFree: "You've reached the free plan's hourly limit. Try again later or get more with /upgrade.",
  unavailable: "All language models are busy right now. Please try again in a minute.",
  failed: "Something went wrong. Please try again.",
  upsellFooter: "\n\n<i>Deeper answers written by Claude Haiku: /upgrade</i>",
  supportUsage: (command: string) => `Write your message after the command, e.g. /${command} I have a question about…`,
  supportSent: "Thanks! Your message was sent; you'll get a reply here.",
  supportReply: (text: string) => `💬 Reply from support:\n\n${text}`,
  thanks: (plan: string) => `Thank you! Your ${plan} plan is active. See /plan for details.`,
};
