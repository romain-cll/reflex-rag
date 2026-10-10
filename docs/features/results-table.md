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

## Technical plan

- `scripts/results-table.ts` (new). Reads `FAILURES` (families, levers) and `CATEGORIES` from `src/eval/` and `evals/schema.ts`.
- No new dependency.

## Test strategy

Tests in `scripts/results-table.test.ts` running the script as a subprocess on hand-written run folders in a temporary directory (two configs, two splits, one config with loop metrics), checking the three tables, the default run selection, the provenance lines and the output path.
