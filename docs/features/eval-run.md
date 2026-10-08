# Eval run (config A)

Phase 2. `reflex eval --config A` runs a question split through retrieval and the answerer, grades every answer deterministically, writes one JSONL trace per run and a markdown report with the metrics per category and the failure taxonomy.

## Acceptance criteria

- **AC1 — grading**: `grade(question, output, contextNotes)` returns `{ correct, failure }`:
  - `value`: correct when `status` is `answered` and the output's `value` contains one of the expected values and none of the stale values, compared case-insensitively with whitespace collapsed and thousands separators ignored (`$48,200` = `$48200`), and only at word and number boundaries (`$90` does not match `$900` or `$90,000`, `9 weeks` does not match `19 weeks`, `Account Executive` does not match `Senior Account Executive`). A stale value that is only part of the matched expected value does not count (`Senior Product Manager` contains `Product Manager`). The explanation in `answer` is not graded: it may mention the outdated value it replaces;
  - `conflict`: correct when `status` is `conflict` and both values appear in the `answer` or the `value` (same matching);
  - `undecided`: correct when `status` is `answered` and the `value` or the answer says no decision was made (`no decision`, `not decided`, `undecided`, `has not been decided`, `not been settled`, `not settled`, `still open`, `left open`, `remains open`, `no final decision`);
  - `abstain`: correct when `status` is `abstained`.
- **AC2 — failure taxonomy**: a wrong answer gets exactly one `failure`, the first that applies: `retrieval_miss` (a source group of the question has no note among the context notes: something the answer needs was never retrieved), `false_abstention` (abstained on a question that has an answer), `wrong_version` (the `value` contains a stale value), `missed_contradiction` (a `conflict` question not answered as a conflict), `unsupported_claim` (an `abstain` question answered), else `wrong_answer`. A correct answer has `failure: null`.
- **AC2b — answer errors**: when `answer` throws, the question is recorded with `output: null`, the error message, `correct: false`, `failure: "answer_error"`, and the cost of the call the error carries, if any; the run goes on.
- **AC3 — run**: `runEval({ questions, retrieve, answer, k, maxCostUsd })` processes the questions in order and, for each, records `{ id, split, category, contextNotes, recall, output, grade, calls, latencyMs, costUsd }`, where `recall` is the share of the question's source groups with at least one note among the context notes (`null` for abstain questions) and `costUsd` sums the calls priced by model from a price table.
- **AC4 — cost cap**: the run stops before a question as soon as the cumulative cost has reached `maxCostUsd`, and reports how many questions were skipped.
- **AC5 — metrics**: per category and overall: number of questions, accuracy as `correct/n`, mean recall, latency p50 and p95, mean cost per question, mean answerer input tokens (context size), and the count of each failure.
- **AC6 — outputs**: a run writes `runs/<timestamp>-A-<split>/trace.jsonl` (one line per question, plus a first line with the run settings: config, split, k, models, prices, thresholds, git commit, and the index metadata: vault, notes, chunks, links), `summary.json` (the metrics) and `report.md` (a table per category with the metrics, then the failures with question ids).
- **AC7 — CLI**: `reflex eval --config A [--split test|tuning] [--limit <n>] [--k <n>] [--max-cost <usd>] [--dry-run]` (defaults: `test`, all questions, `k` = 8, max cost 1 USD) loads `evals/dev/questions.json` and `.reflex/index.db`. `--dry-run` makes no Anthropic call (only the query embeddings): it prints the number of questions, the expected calls and an upper bound of the cost from the size of the retrieved contexts. `--config` is required: without it the command exits with code 1 and an error naming `--config`. Configs other than `A` answer "not implemented" for now. No automated test may start a real run: CLI tests run from temporary working directories, where no `.env`, index or question file exists. Missing API keys or files give a one-line error and exit code 1.

- **AC8 — offline regrading**: `bun scripts/regrade-run.ts <runDir> [--questions <path>]` regrades a run from its `trace.jsonl` and the question set (default `evals/dev/questions.json`) with the current grader, without any model call: it rewrites each record's `recall` and `grade`, adds the regrading commit and date to the settings line, and rewrites `summary.json` and `report.md`. Outputs and costs are kept as recorded.

## Revision 3 — failures attributed to a layer

The phase-3 review showed that `retrieval_miss` named the wrong lever for loop configs (a source seen by the judge and rejected is not an index problem), and the project must show which layer failed: the retrieval brick or the answerer. This revision supersedes AC2 and extends AC3, AC5 and AC8.

- **AC9 — context completeness**: a record of a question with sources gets `contextComplete: true` when every source group has a note in the final context, `false` otherwise (`null` for abstain questions).
- **AC10 — failure taxonomy by layer**: a wrong answer gets exactly one failure. When the context is incomplete, the failure belongs to the **retrieval** family: `loop_error` (the loop itself failed), `judge_rejected` (a missing needed note had a chunk scored by the judge in some step of the loop, but it is not in the final context), `stopped_too_early` (the loop ended on the rule `sufficient` while a needed note was missing and never scored), else `retrieval_miss` (the needed note was never retrieved nor reached). When the context is complete, or the question has no source, the failure belongs to the **answer** family: `answer_error`, `false_abstention`, `wrong_version`, `missed_contradiction`, `unsupported_claim`, else `wrong_answer` (first that applies, as before). Config A records have no loop, so their retrieval failures are all `retrieval_miss`.
- **AC11 — levers**: `FAILURES` maps each failure to its family and to the lever it points to (index and rewrites; relevance threshold or judge; sufficiency threshold; the loop's error handling; the answerer's prompt; the answerer's abstention rule; supersession handling; contradiction handling).
- **AC12 — metrics**: per category and overall, add the context-complete rate (over questions with sources), the number of failures of each family, the mean number of chunks in the final context, and the number of abstentions made by the loop and by the answerer.
- **AC13 — loop errors**: when `retrieve` throws an error carrying calls and steps (`LoopError`), the record keeps them, its cost counts them, its failure is `loop_error`, and the run goes on.
- **AC14 — regrading**: `scripts/regrade-run.ts` recomputes all of the above from the trace.

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
