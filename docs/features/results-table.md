# Results table

The single page that compares every run: one row per run (config × split), every measure the project relies on, generated from the traced runs so that no figure is copied by hand.

## Acceptance criteria

- **AC1 — command**: `bun scripts/results-table.ts [--out <file>] [<runDir>...]` writes the page (default `docs/results/RESULTS.md`). Without run directories, it takes, for each config and split found under `runs/`, the most recent run.
- **AC2 — main table**: one row per run, ordered by config then split. The headline columns come first, in this order: config, split, date, commit; number of questions; context complete rate; context precision; cost per question; latency p50; accuracy as `correct/n` and percentage. Then: recall; mean notes in the context; mean answerer input tokens; latency p95; total cost; retrieval failures and answer failures (counts); correct abstentions on no-answer questions as `correct/n`, with the number made by the loop and by the answerer on those questions (from the `no_answer` category's metrics, `-` when absent); mean hops, rewrites and judge calls (empty for config A).
- **AC3 — per category**: a second table with one row per category and a column group per run: context complete rate, context precision and accuracy as `correct/n`.
- **AC4 — failures**: a third table with one row per failure type (family, type, lever) and one column per run with its count.
- **AC5 — provenance**: under each table, the run directories it was built from; the page states that it is generated and must not be edited by hand.
- **AC6 — no model call**: the script reads only the runs' `trace.jsonl` settings line and `summary.json`.

## Revision 2 — retrieval cost and latency first

The headline cost and latency become those of the retrieval brick, without the answerer (docs/features/eval-run.md, Revision 5). This revision supersedes the order of AC2.

- **AC7 — headline columns**: config, split, date, commit; number of questions; context complete rate; context precision; retrieval cost per question; retrieval latency p50; retrieval latency p95; accuracy as `correct/n` and percentage. Then the end-to-end measures, with the answerer: cost per question, latency p50 and latency p95, each header starting with `end-to-end`; then the other columns of AC2 and the fallback rates, in their current order. A run whose summary has no retrieval measure (written before them) shows `-` in those columns.
- **AC8 — what retrieval means**: a line under the main table says that the retrieval measures count the search, the judge, its fallback and the rewrites, and not the answerer, which is the same for every config.

## Revision 3 — the fallback of each run

The threshold sweep runs config C on the same split with the grey zone from 0.8, from 0.85 and without fallback (`fallbackLow` 0.8, 0.85, `null` in the settings line); two of these runs share a commit and a minute, so the table could not tell them apart.

- **AC9 — fallback column**: the main table gets a column `fallback` right after `commit`: the run's `loop.fallbackLow` from the settings line (`0.85`), `none` when it is `null`, followed by ` nothing-kept` when `loop.fallbackWhen` is `nothing-kept`; empty when the settings have no `fallbackLow` (configs A and B). The "By stage" table gets the same column after `commit`.
- **AC10 — labels**: a run whose settings have `fallbackLow` gets it in its column label after the split, as in the fallback column (`C tuning fallback 0.85`, `C tuning fallback none`). The commit, then the time, are added as today (docs/features/eval-config-c.md, AC13) only when another run shares config, split and fallback.

## Revision 4 — every fallback scope in the fallback text

- **AC11 — scope**: the fallback text of AC9 and AC10 is followed by the scope whenever it is not `uncertain` (`0.8 nothing-kept`, `0.8 no-answer`).

## Revision 5 — repeated runs, as mean and range

The final runs repeat each config three times on the test split (`runs/2026-10-10T15-33-58-836Z-A-test` to `runs/2026-10-10T16-08-01-461Z-C-test`), so that no conclusion is drawn below the run-to-run spread. The README's figures must come from a generated table, not from a hand computation.

- **AC12 — repeated runs table**: a section `## Repeated runs`, before `## Runs`, with one row per group of runs sharing config, split, commit and fallback text (AC9), ordered by config, split and fallback text. Columns: config, split, commit, fallback, runs (the number of runs); then context complete, context precision, retrieval cost/question, retrieval latency p50, retrieval latency p95, accuracy; then the mean cost per question of each role of the "By stage" table (embed, judge, fallback, rewrite, answer); then end-to-end cost/question and end-to-end latency p50. Each cell is the mean over the group's runs, formatted as in the main table, followed by ` [min–max]` when the group has more than one run and the values differ; accuracy is the mean number correct over n (`53.3/60 [52–55]`). A measure absent from every run of the group shows `-`.
- **AC13 — provenance**: under the table, each group's run folders.

## Technical plan

- `scripts/results-table.ts` (new). Reads `FAILURES` (families, levers) and `CATEGORIES` from `src/eval/` and `evals/schema.ts`.
- No new dependency.

## Test strategy

Tests in `scripts/results-table.test.ts` running the script as a subprocess on hand-written run folders in a temporary directory (two configs, two splits, one config with loop metrics), checking the three tables, the default run selection, the provenance lines and the output path.
