# Eval run (config A)

Phase 2. `reflex eval --config A` runs a question split through retrieval and the answerer, grades every answer deterministically, writes one JSONL trace per run and a markdown report with the metrics per category and the failure taxonomy.

## Acceptance criteria

- **AC1 — grading**: `grade(question, output, contextNotes)` returns `{ correct, failure }`:
  - `value`: correct when `status` is `answered` and the answer contains one of the expected values, compared case-insensitively with whitespace collapsed and thousands separators ignored (`$48,200` = `$48200`);
  - `conflict`: correct when `status` is `conflict` and the answer contains both values;
  - `undecided`: correct when `status` is `answered` and the answer says no decision was made (`no decision`, `not decided`, `undecided`, `has not been decided`, `still open`, `no final decision`);
  - `abstain`: correct when `status` is `abstained`.
- **AC2 — failure taxonomy**: a wrong answer gets exactly one `failure`, the first that applies: `retrieval_miss` (the question has sources and none of them is among the context notes), `false_abstention` (abstained on a question that has an answer), `wrong_version` (the answer contains a stale value), `missed_contradiction` (a `conflict` question not answered as a conflict), `unsupported_claim` (an `abstain` question answered), else `wrong_answer`. A correct answer has `failure: null`.
- **AC3 — run**: `runEval({ questions, retrieve, answer, k, maxCostUsd })` processes the questions in order and, for each, records `{ id, split, category, contextNotes, recall, output, grade, calls, latencyMs, costUsd }`, where `recall` is the share of the question's sources found among the context notes (`null` for abstain questions) and `costUsd` sums the calls priced by model from a price table.
- **AC4 — cost cap**: the run stops before a question as soon as the cumulative cost has reached `maxCostUsd`, and reports how many questions were skipped.
- **AC5 — metrics**: per category and overall: number of questions, accuracy as `correct/n`, mean recall, latency p50 and p95, mean cost per question, mean answerer input tokens (context size), and the count of each failure.
- **AC6 — outputs**: a run writes `runs/<timestamp>-A-<split>/trace.jsonl` (one line per question, plus a first line with the run settings: config, split, k, models, prices, thresholds, git commit), `summary.json` (the metrics) and `report.md` (a table per category with the metrics, then the failures with question ids).
- **AC7 — CLI**: `reflex eval --config A [--split test|tuning] [--limit <n>] [--k <n>] [--max-cost <usd>] [--dry-run]` (defaults: `test`, all questions, `k` = 8, max cost 1 USD) loads `evals/dev/questions.json` and `.reflex/index.db`. `--dry-run` makes no model call: it prints the number of questions, the expected calls and an upper bound of the cost from the size of the retrieved contexts. `--config` is required: without it the command exits with code 1 and an error naming `--config`. Configs other than `A` answer "not implemented" for now. No automated test may start a real run: CLI tests run from temporary working directories, where no `.env`, index or question file exists. Missing API keys or files give a one-line error and exit code 1.

## Technical plan

Files:

- `src/eval/grade.ts` (new): `grade`, failure taxonomy.
- `src/eval/prices.ts` (new): price per million tokens by model id (`claude-haiku-5-5`: 0.10 input / 0.50 output; `claude-sonnet-5-5`: 2 / 10; `mistral-embed`: 0.10 input), with the source and date of the prices in a comment. Used for traces only.
- `src/eval/run.ts` (new): `runEval`, metrics (`summarize`), report rendering, trace writing.
- `src/commands/eval.ts` (modified): wires `HybridRetriever` (`src/retrieval/hybrid.ts`), `MistralEmbedder`, `AnthropicLLM` and `answerQuestion` (`src/answer/answerer.ts`) for config A; note dates come from the index.
- Question types from `evals/schema.ts`.
- No new dependency.

## Test strategy

Unit tests in `src/eval/grade.test.ts` (every rule and failure) and `src/eval/run.test.ts` (fake `retrieve` and `answer` functions with scripted outputs and calls: records, recall, cost, cap, metrics, percentiles, files written to a temporary `runs/` folder). CLI tests in `src/cli.test.ts` for `--dry-run` (with a fake index built from fixtures and the embedder replaced by an environment-free fake is not possible from the CLI: test only argument validation, the unknown config and the missing-file errors). No network.
