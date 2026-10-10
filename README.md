# reflex-rag

Agent harnesses spend LLM calls on yes/no decisions inside their retrieval loops. I measured whether a small decision model can make those calls instead, at equal quality, for less cost and latency. Here are the bench, the result, and the fix the traces pointed to.

**Status:** the final runs on the test split are in (commit `c9e4a6e`, three runs per config). Pending: the hand check of the grader and the write-up. The table below is filled from traced runs only.

## Hypothesis

On a realistic company note vault, a retrieval loop judged by a system-one decision model reaches the quality of the same loop judged by an LLM, at a cost and latency close to simple RAG.

A negative or mixed result is a valid outcome, as long as it is explained. Stated on 2026-10-09, before config C was built.

## Result

| Config             | Judge in the loop                                  | Context complete | Retrieval cost / question | Retrieval latency p50 |      Accuracy |
| ------------------ | -------------------------------------------------- | ---------------: | ------------------------: | --------------------: | ------------: |
| A: simple RAG      | none                                               |            68.8% |                $0.0000015 |                0.22 s | 42.7/60 (71%) |
| B: retrieval loop  | LLM (Claude Haiku 5.5)                             |            86.8% |                  $0.00203 |                6.45 s | 51.7/60 (86%) |
| C: retrieval loop  | system one (Jev)                                   |            86.8% |                  $0.00085 |                0.68 s | 51.7/60 (86%) |
| C+: retrieval loop | system one (Jev), LLM fallback while no answer yet |            88.9% |                  $0.00086 |                0.70 s | 53.3/60 (89%) |

Test split (60 questions never used for tuning), same questions and same answerer for every config; mean of three runs, whose ranges are in `docs/results/RESULTS.md` (accuracy varies by up to 3 answers between runs of a config, so a gap of one or two answers is noise). _Context complete_ is the share of questions whose final context holds every expected source. _Retrieval cost_ and _retrieval latency_ are those of the layer under test (search, judge, LLM fallback, query rewrites), without the answerer, which is the same for every config; the end-to-end figures are in `docs/results/RESULTS.md`. _Accuracy_ is end-to-end and comes last on purpose: the layer under test returns context, not answers.

## What is in the repo

- **System under test**: the retrieval layer, which returns the notes that answer a question: `src/vault`, `src/index`, `src/retrieval`, `src/loop` (loop and decision policy), `src/judge`.
- **Measuring instrument**: `corpus/` (seeded generator, truth file and the generated vault), `evals/` (questions derived from the truth file), the grader and the run harness in `src/eval`, and the answerer in `src/answer`, fixed and identical for A, B and C.
- **Evidence**: `runs/` (one JSONL trace per run) and `docs/results/`.
