import { webhookCallback } from "grammy";
import { createApp } from "../src/app.js";
import { requireEnv } from "../src/utils/requireEnv.js";

// Just under vercel.json's maxDuration, so a slow model chain still gets to answer.
const TIMEOUT_MS = 58_000;

const handleUpdate = webhookCallback(createApp(), "std/http", {
  secretToken: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
  timeoutMilliseconds: TIMEOUT_MS,
});

export function POST(request: Request): Promise<Response> {
  return handleUpdate(request);
}
