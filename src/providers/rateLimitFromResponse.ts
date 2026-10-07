import { RateLimitError } from "./Provider.js";

const DAILY_QUOTA_PATTERN = /per[- ]day|daily|tokens per day|requests per day|\bRPD\b|\bTPD\b/i;

export function rateLimitFromResponse(response: Response, body: string): RateLimitError {
  const retryAfter = Number(response.headers.get("retry-after"));
  const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  return new RateLimitError(`429: ${body.slice(0, 300)}`, retryAfterSeconds, DAILY_QUOTA_PATTERN.test(body));
}
