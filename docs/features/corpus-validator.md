# Corpus validator

Phase 1. Checks a written vault against its truth file (`world.json`). Writer subagents run it on their batch and fix their notes until it is clean; it is the only guarantee that the expected answers of the evals are really in the vault, and that nothing else was invented.

## Acceptance criteria

`validateVault(world, files)` takes the world and a map from vault-relative path to markdown content, and returns `{ errors, warnings }`, two lists of `{ path, rule, message }`.

- **AC1 — missing and unexpected notes**: a world note with no file gives an error with rule `missing`; a file that is no world note gives an error with rule `unexpected`.
- **AC2 — frontmatter**: a note whose frontmatter does not parse, or does not equal the world note's `frontmatter` (same keys, same string or string-array values, key order ignored), gives an error with rule `frontmatter`.
- **AC3 — anchors**: for every fact the note states, every anchor must appear in the note body, compared case-insensitively with whitespace collapsed; each missing anchor gives an error with rule `anchor` naming the fact and the anchor.
- **AC4 — links**: every link of the world note must exist in the file as a wikilink resolving to the target note; each missing one gives an error with rule `link`. A wikilink that resolves to no note of the vault gives an error with rule `unresolved-link`. A wikilink to an existing note that the world note does not list gives a warning with rule `extra-link`.
- **AC5 — forbidden terms**: a term of the note's `forbiddenTerms` found in its body (whole word, case-insensitive) gives an error with rule `forbidden`. A term of any `absent` topic found anywhere in any note (frontmatter included) gives an error with rule `absent-topic`.
- **AC6 — unplanned numbers**: in the body, outside wikilinks, every money amount (`$48,200`, `$3.85`), percentage (`12%`), date (`2025-06-10`, `June 10, 2025`, `June 2025`) and other number above 10 must be covered by the note's own texts: the anchors and statements of the facts it states, its title, its frontmatter values, its context, and the titles of the notes it links to. A long date is covered when either its long form or its `YYYY-MM-DD` form appears there. Each uncovered one gives an error with rule `unplanned-number`. Numbers from 0 to 10 are always allowed.
- **AC7 — invented people**: a two-word name whose first word is in the generator's first-name pool, and which is neither a world person nor a name written in any fact statement of the world, gives a warning with rule `unknown-person`.
- **AC8 — length**: a body whose word count is below 80% of the note's minimum or above 125% of its maximum gives a warning with rule `length`.
- **AC9 — CLI**: `bun corpus/generator/cli.ts validate <name> [--out <dir>] [--batch <batch-NN>]` reads `<dir>/<name>/world.json` and every `*.md` file under `<dir>/<name>/vault/` (skipping dot folders), prints the errors and warnings grouped by note path followed by the counts, and exits with code 1 when there is at least one error, 0 otherwise. With `--batch`, only the notes of that batch are checked (same batches as `generate`), and files outside the batch are not reported as `unexpected`.

## Technical plan

Files:

- `corpus/generator/validate.ts` (new): `validateVault(world: World, files: Map<string, string>): { errors: Issue[]; warnings: Issue[] }` with `Issue { path: string; rule: string; message: string }`. Reuses `parseNote` from `src/vault/parse.ts` for frontmatter, body and wikilinks, and the link resolution rules of the parser (by path, then by file name, case-insensitive).
- `corpus/generator/cli.ts` (modified): `validate` command (AC9). Batch membership comes from `renderBatches(world, BATCH_SIZE)`, the same constant `generate` uses.
- `corpus/generator/pools.ts`: `FIRST_NAMES` is the first-name pool for AC7.
- No new dependency.

## Test strategy

Unit tests in `corpus/generator/validate.test.ts` on a small hand-written `World` (a few notes, facts, a vocabulary trap, an absent topic) with in-memory files, one rule at a time: a clean vault gives no error, then each defect gives the expected rule. CLI test as a subprocess with `--out` pointing to a temporary folder holding a tiny `world.json` and vault.
