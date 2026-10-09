# Eval run, config C

Phase 4. `reflex eval --config C` runs the questions through the retrieval loop with the system-one judge and its LLM fallback (docs/features/system-one-judge.md), answers with the same fixed answerer as A and B, and measures what C changes: cost and wall-clock time by stage, the share of notes the system one could not decide alone.

## Acceptance criteria

- **AC1 — pipeline**: for config C, each question goes through `runLoop` exactly as for B (docs/features/eval-config-b.md), with the judge `FallbackJudge(SystemOneJudge(systemOne), LLMJudge(Haiku 5.5), { threshold })` and config C's policy. The policies live in `src/loop/policy.ts` as `POLICIES = { B, C }`; both start from `DEFAULT_POLICY` until config C's thresholds are chosen on the tuning split.
- **AC2 — CLI**: `--system-one jev|clef` (default `jev`) and `--fallback <threshold>` (a number in [0, 1], default 0.6) apply to config C only and are rejected for A and B. `--k`, `--candidates` and `--rewrite` work as for B. A missing `TYPESAFE_API_KEY` with `--system-one jev` gives a one-line error.
- **AC3 — settings**: a C run's settings hold the models (`judge`: the system-one model, `fallback`, `rewriter`, `answerer`, `embedder`), the policy actually used, the fallback threshold, the system-one kind, the rewriter kind and the candidates.
- **AC4 — prices**: the price table gains `jev-1.13.0` (0.042 USD per million input tokens, output free, from TypeSafe's models page) and `clef-flash` (0: served locally, only used to check that code runs).
- **AC5 — roles**: in every config, every call carries its role: `embed`, `judge`, `fallback`, `rewrite` or `answer`.
- **AC6 — stages**: every record gets `stages: { searchMs, judgeMs, fallbackMs, rewriteMs, answerMs }`, wall-clock times: the loop's stages (docs/features/retrieval-loop.md, AC12) for B and C, the retrieval for A's `searchMs`, and the answerer call for `answerMs` (0 when the loop abstains). A loop error keeps the stages measured before it, or zeros.
- **AC7 — metrics**: per category and overall, `summarize` adds the median and the mean of each stage, the mean cost and the mean number of calls per role, and for loop configs with a fallback: the share of judged notes judged again (`fallbackNoteRate`) and the share of questions with at least one note judged again (`fallbackQuestionRate`); these are `null` when no record has a fallback list.
- **AC8 — dry run**: `reflex eval --config C --dry-run` makes no system-one or Anthropic call (query embeddings only) and prints an upper bound: per possible turn, one system-one call per candidate note (input estimated from the state's size), plus the worst-case fallback (one LLM judge call per turn on all candidate notes), one rewriter call per possible rewrite, and the answerer call.
- **AC9 — results page**: the main table of `docs/results/RESULTS.md` gains the fallback rates (empty for A and B); a new table "By stage" gives, per run, the median of each stage and the mean cost per role; when two runs share config and split, the column labels of the per-category and failure tables include their commit.

## Revision 2 — after the phase-4 review

- **AC10 — tested settings**: `loopSettings(config, settings, systemOneModel?)`, exported by `src/commands/eval.ts`, returns the `models` and `loop` parts of a B or C run's settings line (AC3); config A and B runs keep their current settings. Unit-tested for B and C.
- **AC11 — tested roles**: `withRole(calls, role)` (sets the role of the calls that have none) and `roleTagged(role, fn)` (runs `fn`; tags the calls it returns, and the billed `call` of a thrown `LLMCallError` or the `calls` of a thrown error, then rethrows) are exported and unit-tested; every model call of A, B and C goes through them, the answerer's included.
- **AC12 — the means in "By stage"**: the "By stage" table gives, for each stage, the median and the mean (a fallback that runs on fewer than half the questions has a median of 0; its mean is what shows its cost in time).
- **AC13 — labels of repeated runs**: when two runs share config, split and commit, their column labels also include the run's time (`HH:MM` of the folder name), so that the repeated runs of the variance measurement stay apart.

## Revision 3 — batched judge, thresholds and grey zone

- **AC14 — thresholds of C**: `POLICIES.C` keeps the budgets of `DEFAULT_POLICY` with the thresholds answer 0.7 and step 0.7, chosen on the tuning split by replaying the first turn of every question with Jev's batched verdicts (context complete 37/48 and precision 0.51 without fallback, against 34/48 and 0.22 for the per-note run at 0.5).
- **AC15 — grey zone**: `--fallback <low>` (default 0.6) is the lower bound of the grey zone; it must be below both thresholds of C, otherwise a one-line error. The settings record it as `fallbackLow`. The judge of C is `FallbackJudge(SystemOneJudge(systemOne), LLMJudge, { low, isKept: (verdict) => isKept(verdict, POLICIES.C) })`.
- **AC16 — dry run**: the system-one part of the bound counts one call per possible turn, sized as one batch holding all the candidate notes.

## Technical plan

- `src/commands/eval.ts`, `src/cli.ts` (modified): config C wiring, the options, role tagging, stage timing of retrieval and answer.
- `src/eval/prices.ts`, `src/eval/run.ts` (modified): prices, `stages` in records, the new metrics.
- `src/loop/policy.ts` (modified): `POLICIES`.
- `scripts/results-table.ts` (modified): fallback columns, the "By stage" table, labels.
- Uses `jevSystemOne` / `clefSystemOne` (docs/features/system-one-client.md), `SystemOneJudge`, `FallbackJudge`. No new dependency.

## Test strategy

Unit tests in `src/eval/run.test.ts` (fake `retrieve` / `answer` with stages, roles and fallback lists: records, stage metrics, cost and calls per role, fallback rates), `src/eval/prices.test.ts` if it exists or in `run.test.ts` (Jev and Clef prices), `src/commands/eval.test.ts` (the C dry-run bound as a pure function, policies), `src/cli.test.ts` (argument validation from temporary working directories; no test starts a real run), `scripts/results-table.test.ts` (fallback columns, the "By stage" table, labels with commits).
