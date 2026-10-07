import { timingSafeEqual } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import type { Update } from "grammy/types";
import { createApp } from "../src/app.js";
import { requireEnv } from "../src/utils/requireEnv.js";

const bot = createApp();
const secret = Buffer.from(requireEnv("TELEGRAM_WEBHOOK_SECRET"));

/**
 * Acknowledges the update at once and keeps working in the background (up to maxDuration).
 * Research plus writing can take longer than Telegram waits, and an unanswered webhook gets redelivered.
 */
export async function POST(request: Request): Promise<Response> {
  if (!hasValidSecret(request)) return new Response("Unauthorized", { status: 401 });
  const update = (await request.json()) as Update;
  waitUntil(processUpdate(update));
  return new Response("OK");
}

async function processUpdate(update: Update): Promise<void> {
  try {
    await bot.init();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error("Failed to process update:", error);
  }
}

function hasValidSecret(request: Request): boolean {
  const received = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  return received.length === secret.length && timingSafeEqual(received, secret);
}
