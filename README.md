# reflex-rag

Agent harnesses spend LLM calls on yes/no decisions inside their retrieval loops. I measured whether a small decision model can make those calls instead, at equal quality, for less cost and latency. Here are the bench, the result, and the fix the traces pointed to.

**Status:** in progress. The bench and the baseline (config A) are built; configs B and C are being measured. The table below is filled from traced runs only.

## Hypothesis

On a realistic company note vault, a retrieval loop judged by a system-one decision model reaches the quality of the same loop judged by an LLM, at a cost and latency close to simple RAG.

A negative or mixed result is a valid outcome, as long as it is explained. Stated on 2026-10-09, before config C was built.

## Result

| Config            | Judge in the loop              | Context complete | Retrieval cost / question | Retrieval latency p50 | Accuracy |
| ----------------- | ------------------------------ | ---------------: | ------------------------: | --------------------: | -------: |
| A: simple RAG     | none                           |                  |                           |                       |          |
| B: retrieval loop | LLM (Claude Haiku 5.5)         |                  |                           |                       |          |
| C: retrieval loop | system one (Jev), LLM fallback |                  |                           |                       |          |

Test split, same questions and same answerer for the three configs. _Context complete_ is the share of questions whose final context holds every expected source. _Retrieval cost_ and _retrieval latency_ are those of the layer under test (search, judge, LLM fallback, query rewrites), without the answerer, which is the same for the three configs; the end-to-end figures are in `docs/results/RESULTS.md`. _Accuracy_ is end-to-end and comes last on purpose: the layer under test returns context, not answers.

## What is in the repo

- **System under test**: the retrieval layer, which returns the notes that answer a question: `src/vault`, `src/index`, `src/retrieval`, `src/loop` (loop and decision policy), `src/judge`.
- **Measuring instrument**: `corpus/` (seeded generator, truth file and the generated vault), `evals/` (questions derived from the truth file), the grader and the run harness in `src/eval`, and the answerer in `src/answer`, fixed and identical for A, B and C.
- **Evidence**: `runs/` (one JSONL trace per run) and `docs/results/`.
