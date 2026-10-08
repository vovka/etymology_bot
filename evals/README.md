# Evals

Measures how well one model answers: 30 test words run through the real flow (initial lookups, tool
rounds, the written answer) with the model pinned and fallback off, so every answer is that model's own.

```sh
npm run eval -- --model openrouter/openai/gpt-oss-120b            # all cases, graded by the judge
npm run eval -- --model groq/openai/gpt-oss-120b --reps 2          # two runs per case, less noise
npm run eval -- --model openrouter/anthropic/claude-haiku-5.5 --only salary,posh --no-judge
npm run eval:compare -- evals/results/<a>.jsonl evals/results/<b>.jsonl   # which run is more interesting
```

`--model` is any `provider/model` from `modelChain` in `config/app.yaml`; its chain settings (temperature,
`maxSteps`, `extraBody`) apply. Results go to `evals/results/<time>-<model>.jsonl` (one row per case,
written as it finishes) and `.md` (summary and table). The run needs the same API keys as the bot.

## What is measured

| Metric | How | Cost |
|---|---|---|
| answered, citations point to real sources, only `<b>`/`<i>` tags, 200–550 words, reply language | code (`grade/checks.ts`) | free |
| explored beyond the initial sources, looked up the expected ancestor word, no invalid or repeated tool calls | code | free |
| rounds, forced to write, time, tokens, cost | recorded from the model calls | free |
| key facts present (per case, in `cases.yaml`) | judge (`prompts/grade.md`) | judge tokens |
| no unsupported claims: every claim backed by the material the bot read | judge | judge tokens |
| myths and legends labelled as such | judge | judge tokens |
| which of two runs is more interesting | judge, asked in both orders (`prompts/pairwise.md`) | judge tokens |

The judge defaults to `openrouter/anthropic/claude-opus-5.5` (`--judge` to change). It must be stronger than
the models it grades and never one of them; the scripts refuse to let a model grade itself.
`--judge claude-cli/sonnet` (or `claude-cli/opus`) runs the judge through `claude -p` on your Claude
subscription instead of an API key; it counts against the plan's usage limits.

## Reading the numbers

- **Noise.** 30 cases × 1 run moves about ±18 points on a pass rate between runs; `--reps 2` brings that
  to about ±13. Good enough to tell models apart or catch a large prompt effect, not small tweaks.
- **Key facts are the backbone.** They are written by hand in `cases.yaml`; review and correct them before
  trusting the key-facts score, and add cases for words that went wrong in production.
- **Cost.** The judge usually costs more than the model being graded. Free models hit rate limits: a
  rate-limited case shows its error in the table instead of an answer, so rerun those with `--only`.

## Recorded pages

Dictionary and Wikipedia responses are recorded in `fixtures/http.json` on first use and replayed after,
so every model reads exactly the same pages. Commit the file to keep runs comparable over time; delete it
to record afresh. Only pages and 404s are kept; errors, rate limits and blocked requests are retried next run.
