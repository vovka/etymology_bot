# Etymology Bot

A Telegram bot that answers a word or short phrase with its etymology. Answers come from a chain of
free LLMs across providers (OpenRouter and Groq by default). When a model hits its rate limit, the bot
moves on to the next one and skips the limited model until its cooldown ends.

## How it works

```
Telegram → api/telegram.ts (Vercel function, webhook)
         → EtymologyHandler: validate input → per-user rate limit → cache lookup
         → ModelChain: try each model in config/app.yaml, skipping ones on cooldown
         → reply in the user's Telegram language (Telegram HTML)
```

- **Config**: all settings live in [`config/app.yaml`](config/app.yaml): providers, model chain, timeouts,
  cooldowns, cache, rate limits. Secrets stay in env vars; the YAML only names them.
- **Fallback**: a `429` puts the model on cooldown for the provider's `Retry-After`, or `cooldown.dailyQuotaSeconds`
  for daily-quota errors, or the entry's `cooldownSeconds`, or `cooldown.defaultSeconds`. Any other
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
