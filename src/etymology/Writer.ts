import type { SourceDocument } from "../research/Source.js";
import type { Answer, OnProgress } from "./Answer.js";

/** Turns the sources gathered on a word into the answer: directly, or after exploring further with tools. */
export interface Writer {
  write(query: string, replyLanguage: string, seed: SourceDocument[], onProgress: OnProgress): Promise<Answer>;
}
