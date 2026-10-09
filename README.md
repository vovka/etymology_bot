# Etymology Bot

A Telegram bot that tells the story of a word or short phrase. It first gathers reference sources
(Wiktionary, Etymonline, Wikipedia), then an agent explores further with research tools (ancestor words,
roots, cognates, the history behind the word) and writes a sourced etymology followed by a free-form
creative part: stories, surprising relatives in other languages, folk etymologies and more.
Answers come from a chain of LLMs across providers (OpenRouter and Groq by default). When a model
hits its rate limit, the bot moves on to the next one and skips the limited model until its cooldown ends.

There are four plans, paid as monthly Telegram Stars subscriptions:

| Plan      | Price          | Models                           | Agent loop        | Words per hour |
|-----------|----------------|----------------------------------|-------------------|----------------|
| Free      | —              | free models                      | no                | 5              |
| Basic     | 100 ⭐ / month  | Claude Haiku, then free models   | no                | 20             |
| Pro       | 250 ⭐ / month  | Claude Haiku, then free models   | yes               | 30             |
| Unlimited | 500 ⭐ / month  | Claude Haiku, then free models   | yes, no caps      | no limit       |

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

- **Agent loop** (`src/etymology/agent/`): tools are `wiktionary` (etymology and descendants of any term,
  including reconstructed roots), `etymonline`, `wikipedia` (any language edition) and `wikipedia_search`. Every
  document a tool returns gets a citation number. The loop is bounded by `agent.maxSteps` (a chain entry may set
  its own `maxSteps`), `agent.maxToolCallsPerStep` and `agent.timeBudgetMs`; when a limit is hit, the model must
  write from what it has. The Unlimited plan has no step or lookup limits: only `agent.unlimitedTimeBudgetMs`, a
  safety net so it writes before Vercel stops the function (`maxDuration`, 300s on Hobby). If a model fails midway, the next one starts over with all sources found so far, and
  repeated lookups are not fetched again.

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
- **Prompts**: the system prompt, the exploration instructions and the tool descriptions are Markdown files in
  [`config/prompts/`](config/prompts/), sent to the model as written; `{{name}}` marks a value filled in by code.
- **Fallback**: the whole agent run moves to the next model on a failure. A `429` puts the model on cooldown
  for the provider's `Retry-After`, or `cooldown.dailyQuotaSeconds` for daily-quota errors, or the entry's
  `cooldownSeconds`, or `cooldown.defaultSeconds`. Any other
  failure (timeout, 5xx, empty answer) just falls through to the next model.
- **State**: cooldowns, a 30-day answer cache and per-user hourly limits are kept in Upstash Redis; users and payments
  in Postgres (see below).
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
tiers:
  free:
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

## Plans and payments

- **Tiers** (`tiers` in `config/app.yaml`): each has its own model chain, hourly limit and answer cache; `agent: false`
  writes straight from the dictionary sources in one call (`DirectWriter`), `agent: true` runs the agent loop and
  `agent: unlimited` runs it without step or lookup limits; `requestsPerHour: null` means no hourly limit. The
  paid chains reuse the free chain through a YAML alias. Prices are in Stars (`priceStars`).
- **Users** live in Postgres (Neon): `users` (tier, expiry, the subscription's first charge) and `payments` (every
  charge, kept for refunds). A user without a row is on Free, so free users are never stored. Set a tier by hand in
  the Neon SQL editor: `UPDATE users SET tier = 'pro', expires_at = NULL WHERE telegram_id = …` (NULL = no expiry;
  insert the row first for a new user). `/plan` shows a user's ID.
- **Checkout**: `/upgrade` shows invoice links for 30-day Star subscriptions. `pre_checkout_query` refuses a plan the
  user already has; a successful payment records the charge and sets the tier until `subscription_expiration_date`.
  Renewals extend it; a cancelled or failed renewal simply lets it lapse to Free. Buying the other plan switches at
  once and cancels the old plan's renewal.
- **Telegram's rules for digital goods**: Stars only (`XTR`), `/terms` (users agree before paying), `/paysupport` and
  `/support`. Both forward the message to `support.adminChatId`; reply to the forwarded message and the bot sends your
  reply back to the user. Texts are in [`config/texts/`](config/texts/).
- **Refunds**: `npm run refund -- <user_id> <telegram_payment_charge_id>` refunds the charge, cancels the renewal and
  sets the user to Free.
- **Demo**: the greeting has a button per plan that answers `demo.word` on that plan (cached like any answer).

## Deploy to Vercel

1. Create a bot with [@BotFather](https://t.me/BotFather) and get API keys from
   [OpenRouter](https://openrouter.ai/keys) and [Groq](https://console.groq.com/keys).
2. Import this repo in Vercel. Add Upstash Redis and Neon Postgres from the Vercel Marketplace (Storage tab). That
   sets the Redis env vars and `DATABASE_URL` for you.
3. Set env vars (see [`.env.example`](.env.example)): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
   (any random string, e.g. `openssl rand -hex 32`), `OPENROUTER_API_KEY`, `GROQ_API_KEY`.
4. Deploy. The build command (`npm run deploy-setup`) does its work on production builds only (`public/` only exists
   because Vercel requires a non-empty output directory once a build command is set): it applies
   [`db/schema.sql`](db/schema.sql) and sets the webhook, the update types payments need, the command menu and the
   bot's descriptions. To do the same by hand (e.g. after `npm run dev` removed the webhook):
   ```sh
   npm run db:setup
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

## Evals

[`evals/`](evals/README.md) measures answer quality per model on 30 test words: free automatic checks plus a
judge model for key facts and grounding. `npm run eval -- --model openrouter/openai/gpt-oss-120b`.
