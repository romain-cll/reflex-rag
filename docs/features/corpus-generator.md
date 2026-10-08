# Corpus generator

Phase 1. A deterministic generator that builds the truth file (`world.json`) of a fictional company and one writing brief per note. The prose of the notes is written later from the briefs; the truth file is what makes the expected answers of the evals checkable.

Company: Larkspur Devices, Inc. (Portland, OR, about 150 people), designs connected indoor air-quality sensors for commercial buildings, manufacturing outsourced. World from 2025-01-06 to `today` = 2026-09-30.

## World shape

`world.json` is validated by `WorldSchema` (Zod):

- `meta`: `seed`, `scale`, `company`, `start`, `today` (dates are `YYYY-MM-DD` strings everywhere).
- `people`: `id`, `name`, `roles` (`title`, `team`, `from`, `to` or `null`).
- `customers`: `id`, `name`, `segment`, `city`. `suppliers`: `id`, `name`, `category`, `city`. `projects`: `id`, `codename`, `product`, `goal`, `owner` (person id), `start`.
- `facts`: `id`, `subject` (entity id), `attribute`, `value`, `statement` (canonical English sentence), `anchors` (exact strings the note must contain), `validFrom`, `validTo` or `null`, `supersededBy` (fact id) or `null`.
- `notes`: `id`, `path`, `type`, `title`, `date`, `author` (person id), `frontmatter` (string or string-array values only), `context` (situation for the writer), `states` (fact ids), `links` (`target` note id, `intent`: what the sentence around the link must say), `forbiddenTerms`, `words` (`[min, max]`).
- `traps`: `id`, `kind` (`revised_decision`, `stale_note`, `divergent_duplicate`, `contradiction`, `undecided`, `vocabulary_shift`), `facts`, `truthNotes`, `decoyNotes`.
- `chains`: `id`, `notes` (note ids, entry first), `answer` (fact id).
- `absent`: `id`, `subject`, `topic`, `forbiddenTerms` (topics the vault must never mention, for "no answer" questions).

## Acceptance criteria

- **AC1 — determinism**: `generateWorld({ seed, scale })` returns deep-equal worlds for the same seed and scale, and different worlds for different seeds.
- **AC2 — schema**: the world passes `WorldSchema.parse`, and ids are unique within each collection.
- **AC3 — size**: at scale 1 the world has between 180 and 220 notes. At scale 2 it has at least 1.8 times as many notes as at scale 1.
- **AC4 — quotas**: at scale 1, by default: at least 30 chains, 24 superseded facts (`supersededBy` set), 18 contradiction traps (`contradiction` + `divergent_duplicate`), 24 absent topics, 6 `undecided` traps, and one `vocabulary_shift` trap per project. `options.quotas` overrides these numbers; when a quota is not met, `generateWorld` throws an error naming it.
- **AC5 — paths**: every note path is `<Folder>/<basename>.md` with `Folder` in `Projects`, `Meetings`, `Specs`, `Quotes`, `Decisions`, `Customers`, `Suppliers`, `People`, `Journal/<person name>`. Basenames are unique (case-insensitive), equal to the note `title`, and match `/^[A-Za-z0-9 ,.'&()-]+$/`.
- **AC6 — references**: every reference (note `author`, `states`, `links[].target`; project `owner`; trap `facts`, `truthNotes`, `decoyNotes`; chain `notes`, `answer`; fact `supersededBy`) points to an existing item of the right collection. Every note date lies within `[meta.start, meta.today]` and is on or after the `validFrom` of every fact the note states.
- **AC7 — facts**: every fact is stated by at least one note. Every fact has at least one anchor, and every anchor is a substring of its statement.
- **AC8 — supersession**: when fact A has `supersededBy` B, A and B share `subject` and `attribute`, differ in `value`, `B.validFrom` is after `A.validFrom` and `A.validTo` equals `B.validFrom`.
- **AC9 — contradictions**: a `contradiction` or `divergent_duplicate` trap has exactly two facts with the same `subject` and `attribute`, different values, both with `validTo` null and `supersededBy` null, and no note states both.
- **AC10 — chains**: a chain has 3 or 4 notes, each note links to the next one, and the answer fact is stated by the last note and not by the first.
- **AC11 — forbidden terms**: the truth notes of a `vocabulary_shift` trap have non-empty `forbiddenTerms`. No note's forbidden term appears (case-insensitive, whole word) in its title, context, link intents or the statements of the facts it states. No `absent` forbidden term appears anywhere in the world's fact statements, note titles, contexts or link intents, nor in any rendered batch.
- **AC12 — briefs**: `renderBatches(world, size)` returns batches named `batch-01`, `batch-02`… with at most `size` notes each, every note in exactly one batch, grouped so that notes of the same project or customer stay together as much as the size allows. Each batch's markdown starts with a cast section naming every author of its notes with their role at the note date, then for each note: its path, its frontmatter as a fenced YAML block, the statement and anchors of every fact it states, every link target written as `[[<target title>]]` with its intent, its forbidden terms, its context and its word range.
- **AC13 — CLI**: `bun corpus/generator/cli.ts generate --name <name> --seed <n> --scale <k> [--out <dir>]` writes `<dir>/<name>/world.json` and `<dir>/<name>/briefs/batch-NN.md` (`--out` defaults to `corpus`). It refuses, with exit code 1, when `<dir>/<name>/vault` already exists, unless `--force` is passed.

## Technical plan

Files (all under `corpus/generator/`):

- `schema.ts`: `WorldSchema` and the inferred types (`World`, `Fact`, `NoteSpec`, `Trap`…).
- `random.ts`: seeded PRNG (mulberry32) with `pick`, `shuffle`, `int` helpers. No dependency.
- `pools.ts`: fictional name pools (people, customers, suppliers, project codenames, absent topics).
- `world.ts`: `generateWorld(options: { seed: number; scale: number; quotas?: Partial<Quotas> }): World` and `DEFAULT_QUOTAS`. Builds the entities, then runs templates that emit facts, notes and traps together:
  - project lifecycle: hub, kickoff, requirements, a divergent copy of the requirements, supplier quotes, a comparison meeting that favours vendor A, a later meeting that signs off vendor B worded without "quote" and linked from the requirements, a launch-date slip, a customer pilot, status updates, a meeting with an undecided topic;
  - customers: account note with an account-owner change, review meeting, contract value contradicting the account note for some;
  - suppliers, people (role changes, stale profiles), personal journals, company decisions and meetings.
- `briefs.ts`: `renderBatches(world: World, size: number): { name: string; noteIds: string[]; markdown: string }[]`.
- `cli.ts`: `generate` command (AC13).
- Dependency: `zod` (installed).

Implementation by the PO (content design); tests by the tester.

## Test strategy

Unit tests in `corpus/generator/world.test.ts` and `corpus/generator/briefs.test.ts` checking the invariants above on `generateWorld({ seed: 42, scale: 1 })` (plus other seeds for AC1, scale 2 for AC3, impossible quotas for AC4). CLI test in `corpus/generator/cli.test.ts` running the command as a subprocess with `--out` pointing to a temporary folder.
