/** Returns null instead of throwing, for JSON written by a model. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
