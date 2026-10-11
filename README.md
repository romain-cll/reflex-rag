# reflex-rag

Agent harnesses spend LLM calls on yes/no decisions inside their retrieval loops. I measured whether a small decision model can make those calls instead, at equal quality, for less cost and latency. Here are the bench, the result, and the fix the traces pointed to.

**Hypothesis** (2026-10-09, before config C was built): a retrieval loop judged by a system-one decision model reaches the quality of the same loop judged by an LLM, at a cost and latency close to simple RAG.

**Answer: yes for quality and latency, partly for cost.** The loop judged by Jev, a system-one model (C), matches the same loop judged by Claude Haiku 5.5 (B), with retrieval about ten times faster and 58% cheaper. End to end, C is close to simple RAG (A) in latency, 2.5 s against 2.2 s, but costs 2.8 times as much.

| Config                                |  Context complete | Retrieval cost / question | Retrieval latency p50 |        Accuracy |
| ------------------------------------- | ----------------: | ------------------------: | --------------------: | --------------: |
| A: simple RAG, top 5 notes            |             68.8% |                $0.0000015 |                0.22 s | 42.7/60 [42–43] |
| B: loop judged by Haiku               | 86.8% [85.4–87.5] |                  $0.00203 |                6.45 s | 51.7/60 [51–52] |
| C: loop judged by Jev                 | 86.8% [85.4–87.5] |                  $0.00085 |                0.68 s | 51.7/60 [50–53] |
| C+: C, Haiku fallback while no answer | 88.9% [87.5–89.6] |                  $0.00086 |                0.70 s | 53.3/60 [52–55] |

Test split of 60 questions never used for tuning, mean of three runs [min–max]. Accuracy comes last: the layer under test returns context, not answers. B is my own LLM loop, not a product.

**The full write-up is [`REPORT.md`](REPORT.md).**

## The fix the traces pointed to

- **Symptom**: C's Haiku fallback, meant for the notes Jev nearly kept, ran in 28 of 60 test questions and raised retrieval p50 from 0.68 s to 2.24 s.
- **Diagnosis**: 83 of its 87 calls over three runs came after Jev had already kept a note stating the answer. The rule looked at each note alone, never at whether the turn already had its answer.
- **Fix**: one option, `--fallback-when no-answer`, so the fallback only runs while no answer is kept (spec `a9018d7`, failing tests `5921097`, implementation `0ba47d7`).

| Test split, 3 runs | Questions with a fallback | Retrieval p50 | Retrieval cost | Context complete | Accuracy |
| ------------------ | ------------------------: | ------------: | -------------: | ---------------: | -------: |
| C before           |                     28/60 |        2.24 s |       $0.00102 |            88.9% |  52.7/60 |
| C+ (after)         |                    1.7/60 |        0.70 s |       $0.00086 |            88.9% |  53.3/60 |

Three dissected cases and the replay that predicted the effect: [REPORT §4](REPORT.md#4-the-fix-the-traces-pointed-to).

## How it works

- **Bench**: 202 notes of a fictional company, generated from a truth file with planted traps (revised decisions, diverging copies, topics never mentioned). 120 questions in five categories, split into tuning and test. [§1](REPORT.md#1-setup-and-bench)
- **Loop**: each turn, the judge scores the candidate notes (`answer`, `step`, `none`), then a one-page deterministic policy (`src/loop/policy.ts`) follows links, answers, rewrites the query or abstains.
- **Why a system one**: each decision is a closed question, so Jev returns a probability per option instead of writing text: 0.32 s per judge call against 3.44 s for Haiku. [§2](REPORT.md#where-the-gap-comes-from)
- **Links**: the graph is the vault's own wikilinks, extracted into a disposable index; following a link means judging the target note.
- **Failures by layer**: every wrong answer is attributed to retrieval or to the answerer from its trace. [§3](REPORT.md#3-which-layer-failed)

## Can the numbers be trusted

- Three runs per config at one commit, and no claim from a gap below the run-to-run noise (up to 3 answers).
- The grader is code, not a model, and agreed with my hand check on 20 of 20 answers.
- Every figure comes from a traced run, and [`RESULTS.md`](docs/results/RESULTS.md) is generated from the traces. [§5](REPORT.md#5-can-the-numbers-be-trusted)

## Limits

- Retrieval only: no agent planning, memory or permissions.
- Small synthetic corpus written by Claude models: short Markdown notes, no PDFs.
- The gain is almost all multi-hop: simple RAG is near the ceiling on the other categories.
- One LLM (Haiku 5.5). C's cost advantage rests on list prices; its latency advantage does not.

The rest, and next steps: [§7](REPORT.md#7-limits-and-next-steps).

## Reproduce

Needs [Bun](https://bun.sh) and `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `TYPESAFE_API_KEY` in `.env` (see `.env.example`).

```sh
bun install
bun src/cli.ts index corpus/dev/vault
bun src/cli.ts eval --config A --split test
bun src/cli.ts eval --config B --split test
bun src/cli.ts eval --config C --split test --fallback none           # C
bun src/cli.ts eval --config C --split test --fallback-when no-answer # C+
bun src/cli.ts eval --config C --split test                           # C before
bun scripts/results-table.ts                                          # regenerates RESULTS.md
```

A test run costs $0.02 (A) to $0.14 (B), and `--dry-run` prints an upper bound first. `bun run check` needs no key: the tests mock every model.

## What is in the repo

- **System under test**: `src/vault`, `src/index`, `src/retrieval`, `src/loop`, `src/judge`.
- **Measuring instrument**: `corpus/` (generator, truth file, vault), `evals/` (questions), `src/eval` (grader, run harness), `src/answer` (the answerer, identical for every config).
- **Evidence**: `runs/` (JSONL traces), `docs/results/`, `docs/experiments/` (scripts behind the report's figures), `docs/features/` (specs).
