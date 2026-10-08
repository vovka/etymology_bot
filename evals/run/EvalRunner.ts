import type { AppConfig, ChainEntry } from "../../src/config/AppConfig.js";
import { ExplorationAgent } from "../../src/etymology/agent/ExplorationAgent.js";
import type { Answer } from "../../src/etymology/Answer.js";
import { CooldownTracker } from "../../src/llm/CooldownTracker.js";
import { ModelChain } from "../../src/llm/ModelChain.js";
import type { Provider } from "../../src/providers/Provider.js";
import { createSources } from "../../src/research/createSources.js";
import { Researcher } from "../../src/research/Researcher.js";
import type { HttpGet } from "../../src/research/Source.js";
import { MemoryStore } from "../../src/storage/MemoryStore.js";
import type { EvalCase } from "./Cases.js";
import { RecordingProvider, type Trace } from "./RecordingProvider.js";

export interface CaseRun extends Trace {
  caseId: string;
  query: string;
  rep: number;
  model: string;
  answer: string | null;
  error: string | null;
  sources: Answer["sources"];
  ms: number;
}

/** Runs one case through the real research → explore → write flow, pinned to one model with no fallback. */
export class EvalRunner {
  constructor(
    private readonly config: AppConfig,
    private readonly entry: ChainEntry,
    private readonly provider: Provider,
    private readonly get: HttpGet,
  ) {}

  async run(evalCase: EvalCase, rep: number): Promise<CaseRun> {
    const recorder = new RecordingProvider(this.provider);
    const started = Date.now();
    const { answer, error } = await this.answer(evalCase, recorder);
    const ms = Date.now() - started;
    const model = `${this.entry.provider}/${this.entry.model}`;
    const result = { answer: answer?.text ?? null, sources: answer?.sources ?? [], error, ms };
    return { caseId: evalCase.id, query: evalCase.query, rep, model, ...result, ...recorder.trace() };
  }

  private async answer(evalCase: EvalCase, recorder: RecordingProvider) {
    const { research, agent, cooldown, llm } = this.config;
    // A fresh store per case, so one rate limit doesn't put the model on cooldown for the rest of the run.
    const cooldowns = new CooldownTracker(new MemoryStore(), cooldown);
    const chain = new ModelChain([{ entry: this.entry, provider: recorder }], cooldowns, llm);
    const researcher = new Researcher(createSources(research, this.get), research.maxCharsPerSource);
    const explorer = new ExplorationAgent(chain, this.get, agent, research.maxCharsPerSource);
    try {
      const seed = await researcher.research(evalCase.query);
      const answer = await explorer.write(evalCase.query, evalCase.language, seed, async () => {});
      return { answer, error: null };
    } catch (error) {
      return { answer: undefined, error: recorder.errors.at(-1) ?? String(error) };
    }
  }
}
