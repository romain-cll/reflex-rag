# Eval run, config B

Phase 3. `reflex eval --config B` runs the questions through the retrieval loop with the LLM judge, answers with the same fixed answerer as config A, and traces every turn of the loop. A comparison script puts A and B side by side.

## Acceptance criteria

- **AC1 — pipeline**: for config B, each question goes through `runLoop` (hybrid retrieval of `--candidates` chunks, default 50; `LLMJudge` on `AnthropicLLM` Haiku 5.5; `DEFAULT_POLICY`; the rewriter chosen by `--rewrite llm|code`, default `llm`). When the loop answers, `answerQuestion` writes the answer from the loop's context; when the loop abstains, the record's output is `{ status: "abstained", value: "", answer: <a sentence naming the policy rule>, citations: [] }` and no answerer call is made.
- **AC2 — records**: `runEval` accepts a `retrieve` that also returns `loop: { outcome, hops, rewrites, steps }`, and an `answer` that may return `call: null` when no model was called. A B record keeps `loop` (the rule of the final action, hops, rewrites and the steps of `runLoop`) next to the fields of AC3 of docs/features/eval-run.md; its cost sums every call (embeddings, judge, rewriter, answerer).
- **AC3 — metrics**: `summarize` adds, per category and overall, the mean number of hops, of rewrites and of judge calls per question, and the count of each final policy rule; these are `null` or empty for config A records.
- **AC4 — settings and report**: the settings line of a B run holds the policy configuration, the judge and rewriter models, the rewriter kind and the number of candidates; `report.md` adds the loop metrics of AC3 to its tables.
- **AC5 — dry run**: `reflex eval --config B --dry-run` makes no Anthropic call (query embeddings only) and prints an upper bound of the cost: per question, one relevance call on the candidates, one relevance call and one assessment per possible hop and rewrite, one rewriter call per possible rewrite, and one answerer call, sized from the retrieved candidates.
- **AC6 — comparison**: `bun scripts/compare-runs.ts <runDir>...` reads each run's settings and `summary.json` and prints one markdown table: a row per category and one overall, a group of columns per run (labelled with its config and split): accuracy as `correct/n`, recall, latency p50 and p95, cost per question, and mean hops for loop configs.
- **AC7 — CLI**: `--rewrite` accepts `llm` or `code` and is rejected for config A; `--candidates` takes a positive integer. Config C still answers "not implemented". The existing config A behaviour is unchanged.

## Revision 2 — after the phase-3 review, with notes as the unit

The loop now works on notes and the judge answers one question per note (docs/features/retrieval-loop.md, docs/features/llm-judge.md). This revision supersedes AC1's judge and policy details, AC3's judge-call count and AC5's bound where they differ.

- **AC8 — same context budget**: `--k` sets the number of notes in the context for every config: the first `k` notes for A, the policy's note budget for B (default 5 for both); `--candidates` sets the chunks retrieved per search for both (default 50). The settings line of every run holds `k` and `candidates`, the report header shows both (`k = 5, candidates = 50, commit …`), and a B run's settings hold the policy with the note budget actually used.
- **AC9 — loop records**: a B record's `loop` holds the final rule, the hops, the rewrites, the steps, and the loop's `judged`, `kept` and `frontier` (docs/features/eval-run.md, AC11). A judge or rewriter error is recorded as `loop_error` with its cost (docs/features/eval-run.md, AC14).
- **AC11 — tested wiring of the context**: `loopPolicy(k)` (the `DEFAULT_POLICY` with the note budget set to `k`) and `notesContext(index, paths)` (the context items of config A: note path, note date, empty heading, `noteText`) are exported by `src/commands/eval.ts` and unit-tested.
- **AC10 — tested wiring**: `abstentionOutput(rule)` and the dry-run bound `upperBoundCalls(question, candidateNotes, policy, rewriter)` are exported pure functions with unit tests. The bound counts, per question, one judge call per possible turn (1 + hops budget + rewrites budget), each sized as a call on all the candidate notes, one rewriter call per possible rewrite, and one answerer call on the longest candidate notes within the note budget; every call is priced with its full `maxTokens` of output plus `THINKING_HEADROOM_TOKENS` (docs/features/answerer.md, AC7).

## Technical plan

Files:

- `src/eval/run.ts` (modified): optional `loop` in what `retrieve` returns and in records, `call: null` allowed from `answer`, loop metrics in `summarize` and in the report.
- `src/commands/eval.ts` and `src/cli.ts` (modified): config B wiring and the `--rewrite`, `--candidates` options.
- `scripts/compare-runs.ts` (new).
- Uses `runLoop` (`src/loop/loop.ts`), `LLMRewriter` / `CodeRewriter` (`src/loop/rewriter.ts`), `LLMJudge` (`src/judge/llm-judge.ts`), `DEFAULT_POLICY` (`src/loop/policy.ts`).
- No new dependency.

## Test strategy

Unit tests in `src/eval/run.test.ts` with fake `retrieve` / `answer` functions returning loop data and `call: null` (records, cost, metrics, rule counts, report columns). Tests of `scripts/compare-runs.ts` as a subprocess on two hand-written run folders. CLI tests in `src/cli.test.ts` only for argument validation (`--rewrite` values, `--rewrite` with config A, `--candidates`), from temporary working directories; no test starts a real run. Unit tests in `src/commands/eval.test.ts` for `abstentionOutput` and `upperBoundCalls` (Revision 2).
