import type { AppConfig } from "../config/AppConfig.js";

// Letters in any script, combining marks, apostrophes, hyphens and spaces (e.g. "hors d'oeuvre", "naïve").
const ALLOWED = /^[\p{L}\p{M}'’\- ]+$/u;

/** Returns the normalized word or phrase, or null when the text isn't something to look up. */
export function parseQuery(text: string, limits: AppConfig["query"]): string | null {
  const query = text.trim().replace(/\s+/g, " ");
  if (!query || query.length > limits.maxLength || !ALLOWED.test(query)) return null;
  if (query.split(" ").length > limits.maxWords) return null;
  return query;
}
