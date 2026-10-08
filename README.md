# Etymology Bot

A Telegram bot that tells the story of a word or short phrase. It first gathers reference sources
(Wiktionary, Etymonline, Wikipedia), then an agent explores further with research tools (ancestor words,
roots, cognates, the history behind the word) and writes a sourced etymology followed by a free-form
creative part: stories, surprising relatives in other languages, folk etymologies and more.
Answers come from a chain of free LLMs across providers (OpenRouter and Groq by default). When a model
hits its rate limit, the bot moves on to the next one and skips the limited model until its cooldown ends.

## How it works

```
Telegram → api/telegram.ts (Vercel webhook: acknowledges at once, works on in the background)
         → EtymologyHandler: validate input → per-user rate limit → status message "🔎 Looking up…"
         → EtymologyService (cached):
              1. Researcher: query all sources for the word in parallel; a failing source is just left out
              2. ExplorationAgent on the ModelChain: the model calls research tools for a few rounds
                 ("🧭 Digging deeper: Wiktionary «salarium», Wikipedia «Via Salaria»…"), then writes
         → status message replaced by the answer + links to the sources it cites
```

- **Agent loop** (`src/etymology/agent/`): tools are `wiktionary` (etymology and descendants of any term, including
  reconstructed roots), `etymonline`, `wikipedia` (any language edition) and `wikipedia_search`. Every
  document a tool returns gets a citation number. The loop is bounded by `agent.maxSteps`,
  `agent.maxToolCallsPerStep` and `agent.timeBudgetMs`; when a limit is hit, the model must write from what it
  has. If a model fails midway, the next one starts over with all sources found so far, and repeated lookups
  are not fetched again.

- **Grounding**: the model gets the source texts and must cite them as [1], [2]; the links are appended
  by the bot, not the model, so they are always real. Only the cited sources are listed. The prompt keeps
  the origin strictly scholarly and leaves the creative part open-ended, with speculation marked as such.
- **Busy status**: "typing…" is kept alive and a status message shows the current step until the answer
  replaces it.
- **Sources**: listed under `research.sources` in the config. Etymonline has no API, so the bot reads the
  summary from its page's meta description; remove it from the list if scraping is a concern.
  To add a source, implement `Source` (`src/research/Source.ts`) and register it in
  `src/research/createSources.ts`.

- **Config**: all settings live in [`config/app.yaml`](config/app.yaml): providers, model chain, timeouts,
  cooldowns, cache, rate limits. Secrets stay in env vars; the YAML only names them.
- **Fallback**: the whole agent run moves to the next model on a failure. A `429` puts the model on cooldown
  for the provider's `Retry-After`, or `cooldown.dailyQuotaSeconds` for daily-quota errors, or the entry's
  `cooldownSeconds`, or `cooldown.defaultSeconds`. Any other
  failure (timeout, 5xx, empty answer) just falls through to the next model.
- **State**: cooldowns, a 30-day answer cache and per-user hourly limits are kept in Upstash Redis.
  Without Redis the bot still works, but that state only lasts as long as a warm function instance.
- **Chats**: in private chats any message is looked up. In groups, use `/etym <word>` or mention the bot.

## Adding a provider

Any OpenAI-compatible API (Together, Mistral, Cerebras, DeepInfra, …) needs only config:

```yaml
providers:
  cerebras:
    type: openai-compatible
    baseUrl: https://api.cerebras.ai/v1
    apiKeyEnv: CEREBRAS_API_KEY
modelChain:
  - provider: cerebras
    model: llama-3.3-70b
```

For a different API shape, implement `Provider` (`src/providers/Provider.ts`), throw `RateLimitError` on quota
errors, and register a factory for a new `type` in `src/providers/createProvider.ts`.

Models whose provider has no API key set are skipped, so you can run with only one provider.
Models that reject a custom temperature (Claude Haiku 5.5) get `temperature: null`.
Free model IDs change often. Check [OpenRouter's free models](https://openrouter.ai/models?max_price=0)
and [Groq's models](https://console.groq.com/docs/models) and update the chain.

## Deploy to Vercel

1. Create a bot with [@BotFather](https://t.me/BotFather) and get API keys from
   [OpenRouter](https://openrouter.ai/keys) and [Groq](https://console.groq.com/keys).
2. Import this repo in Vercel. Add Upstash Redis from the Vercel Marketplace (Storage tab). That sets the
   Redis env vars for you.
3. Set env vars (see [`.env.example`](.env.example)): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
   (any random string, e.g. `openssl rand -hex 32`), `OPENROUTER_API_KEY`, `GROQ_API_KEY`.
4. Deploy, then register the webhook locally with the same token and secret in `.env`:
   ```sh
   npm run set-webhook -- https://your-app.vercel.app
   ```

## Local development

```sh
npm install
cp .env.example .env   # fill in values
npm run dev            # long polling; removes the webhook, so run set-webhook again afterwards
npm test
npm run typecheck
```
