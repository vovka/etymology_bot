import type { ModelChain } from "../llm/ModelChain.js";
import type { SourceDocument } from "../research/Source.js";
import { SourceRegistry } from "./agent/SourceRegistry.js";
import type { Answer, OnProgress } from "./Answer.js";
import { buildPrompt } from "./buildPrompt.js";
import type { Writer } from "./Writer.js";

/** Writes the answer in one model call from the initial sources, without the agent loop. */
export class DirectWriter implements Writer {
  constructor(private readonly chain: ModelChain) {}

  async write(query: string, replyLanguage: string, seed: SourceDocument[], onProgress: OnProgress): Promise<Answer> {
    const registry = new SourceRegistry(seed);
    const messages = buildPrompt(query, replyLanguage, registry.all(), false);
    await onProgress({ stage: "writing" });
    const text = await this.chain.run(async (model) => {
      const reply = await model.chat(messages);
      if (!reply.content) throw new Error("Empty completion");
      return reply.content;
    });
    return { text, sources: registry.citedIn(text).map(({ number, name, url }) => ({ number, name, url })) };
  }
}
