# Results table

The single page that compares every run: one row per run (config × split), every measure the project relies on, generated from the traced runs so that no figure is copied by hand.

## Acceptance criteria

- **AC1 — command**: `bun scripts/results-table.ts [--out <file>] [<runDir>...]` writes the page (default `docs/results/RESULTS.md`). Without run directories, it takes, for each config and split found under `runs/`, the most recent run.
- **AC2 — main table**: one row per run, ordered by config then split, with: config, split, date, commit; number of questions; context complete rate; recall; accuracy as `correct/n` and percentage; retrieval failures and answer failures (counts); correct abstentions on no-answer questions as `correct/n`, with the number made by the loop and by the answerer; mean chunks in the context; mean answerer input tokens; latency p50 and p95; cost per question and total cost; mean hops, rewrites and judge calls (empty for config A).
- **AC3 — per category**: a second table with one row per category and a column group per run: accuracy as `correct/n` and context complete rate.
- **AC4 — failures**: a third table with one row per failure type (family, type, lever) and one column per run with its count.
- **AC5 — provenance**: under each table, the run directories it was built from; the page states that it is generated and must not be edited by hand.
- **AC6 — no model call**: the script reads only the runs' `trace.jsonl` settings line and `summary.json`.

## Technical plan

- `scripts/results-table.ts` (new). Reads `FAILURES` (families, levers) and `CATEGORIES` from `src/eval/` and `evals/schema.ts`.
- No new dependency.

## Test strategy

Tests in `scripts/results-table.test.ts` running the script as a subprocess on hand-written run folders in a temporary directory (two configs, two splits, one config with loop metrics), checking the three tables, the default run selection, the provenance lines and the output path.
