# reflex-rag

Retrieval layer over an Obsidian vault. A system-one decision model (Clef-flash) judges the retrieval loop instead of an LLM, with an LLM fallback when confidence is low. The deliverable is the method: evals → traces → failure diagnosis → measured improvement.

The full brief is `reflex-rag-plan.md` at the repo root (French, local only, gitignored). Read it before starting a phase.

`reflex-rag-preuves.md` at the repo root (French, local only, gitignored) is the review grid: what the project must prove and the work order. It overrides the brief where they diverge (MCP, threshold sweep, order of the headline metrics).

## Rules

- One phase at a time. Stop at the end of each phase, summarise, wait for Romain's go.
- Nothing outside the brief's scope: write ideas to `IDEAS.md` and move on.
- Before adding anything, ask: does it change a figure of the results table or a line of the failure diagnosis? If not, it waits in `IDEAS.md`.
- No invented numbers in `README.md` or `REPORT.md`: every figure comes from a traced run in `runs/`.
- Code, comments, docs, README and report in English.
- Never write to the vault. The index under `.reflex/` is derived and disposable.
- No API keys in the repo: `.env` is gitignored, see `.env.example`.

## Stack

Bun + TypeScript (strict), single package. `bun:sqlite` (FTS5) for the derived index, Zod at I/O boundaries, JSONL traces. Models sit behind the interfaces in `src/core/`:

- LLM: Claude Haiku 5.5 (judge for config B, fallback for C, query rewriting, answerer); grader: Claude Sonnet 5.5
- Embeddings: `mistral-embed`
- System one: Clef-flash served by Ollama (`POST /v1/systemone`)

TypeScript is pinned to `~6.0`: typescript-eslint does not support 7.x yet.

## Commands

- `bun run check`: lint, typecheck, format check and tests. Run it before every commit.
- `bun test`, `bun run lint`, `bun run typecheck`, `bun run format`
- `bun src/cli.ts <command>`, or `reflex <command>` after `bun link`
- `bun scripts/inspect-note.ts <path or title>`: a note's chunks, links and backlinks from `.reflex/index.db`

### Corpus

- `bun corpus/generator/cli.ts generate --name dev --seed 42 --scale 1 [--force]`: truth file `corpus/dev/world.json` and writing briefs `corpus/dev/briefs/`. Scale 1 ≈ 200 notes, scale 10 ≈ 2,000.
- The notes of `corpus/dev/vault/` are written by subagents from the briefs, following `corpus/WRITING.md`, one batch each.
- `bun corpus/generator/cli.ts validate dev [--batch batch-NN]`: checks the vault against the world. Must print `0 errors` before the vault is committed.

### Lint (check only)

Read-only commands for the reviewer agent, whose guard allows only npm and npx:

- `npx eslint .`
- `npx tsc --noEmit`
- `npm test`

## Git

Trunk-based: small commits straight on `main`, conventional commits (`feat:`, `test:`, `docs:`, `chore:`, scoped with the feature slug when there is one). No feature branches, no merge requests.

## TDD workflow

For the deterministic logic (parser, index, decision policy):

1. Spec in `docs/features/<slug>.md`: acceptance criteria, technical plan, test strategy. Commit `docs(<slug>): spec`.
2. The `tester` agent writes failing tests (`*.test.ts` next to the code). Commit `test(<slug>): red` and keep the SHA.
3. The `dev` agent makes them pass without touching the tests. Commit `feat(<slug>): …`.
4. The `reviewer` agent checks the result against the spec, the red SHA and the Definition of Done.

No tests against real model APIs: mock the judge, LLM and embedder at their interfaces.

## Definition of Done

- `bun run check` is green.
- Tests unchanged since the red commit.
- Every acceptance criterion has at least one test.
- No dependency beyond the spec's technical plan.
- Model calls go through the interfaces in `src/core/` and return their `ModelCall` (tokens, latency) for the traces.
