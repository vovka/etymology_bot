import type { AppConfig } from "../config/AppConfig.js";
import { EtymonlineSource } from "./EtymonlineSource.js";
import type { HttpGet, Source } from "./Source.js";
import { WikipediaSource } from "./WikipediaSource.js";
import { WiktionarySource } from "./WiktionarySource.js";

/** Register a factory here to make a new source usable from research.sources in config/app.yaml. */
const factories: Record<string, (get: HttpGet) => Source> = {
  wiktionary: (get) => new WiktionarySource(get),
  etymonline: (get) => new EtymonlineSource(get),
  wikipedia: (get) => new WikipediaSource(get),
};

export function createHttpGet(config: AppConfig["research"]): HttpGet {
  return (url) =>
    fetch(url, { headers: { "User-Agent": config.userAgent }, signal: AbortSignal.timeout(config.timeoutMs) });
}

export function createSources(config: AppConfig["research"], get = createHttpGet(config)): Source[] {
  return config.sources.map((name) => {
    const factory = factories[name];
    if (!factory) throw new Error(`Unknown research source "${name}"`);
    return factory(get);
  });
}
