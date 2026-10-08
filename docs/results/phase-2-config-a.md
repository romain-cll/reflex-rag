# Phase 2 — baseline, config A (simple RAG)

Config A is a single retrieval pass: BM25 and `mistral-embed` candidates fused by reciprocal rank fusion, the top 8 chunks handed to a fixed answerer (Claude Haiku 5.5, effort `low`, structured output). No judge, no loop. Every figure below comes from the two traced runs versioned with this note.

## Setup

- Corpus: dev vault, 202 notes of the fictional company Larkspur Devices (`corpus/dev/`, generator revision 2, seed 42, scale 1), index of 766 chunks and 253 links.
- Questions: `evals/dev/questions.json`, derived from the truth file; two disjoint splits of 60 (12 simple, 15 multi-hop, 12 temporal, 9 contradiction, 12 no-answer each).
- Grading: deterministic, against the expected values of the truth file (see `docs/features/eval-run.md`).
- Code at commit `6de2b91`; runs: `runs/2026-10-08T19-34-26-262Z-A-tuning/` and `runs/2026-10-08T19-36-50-711Z-A-test/`, run one after the other.

## Results

Accuracy as correct / questions, recall as the mean share of the expected source notes found in the context.

| Category      |      Tuning |        Test | Recall (tuning / test) |
| ------------- | ----------: | ----------: | ---------------------: |
| Simple        |     12 / 12 |     12 / 12 |        100.0% / 100.0% |
| Multi-hop     |      1 / 15 |      1 / 15 |          36.7% / 43.3% |
| Temporal      |      8 / 12 |     10 / 12 |          75.0% / 83.3% |
| Contradiction |       9 / 9 |       8 / 9 |          94.4% / 94.4% |
| No answer     |     12 / 12 |     12 / 12 |                    n/a |
| **Overall**   | **42 / 60** | **43 / 60** |          72.9% / 77.1% |

| Run    | Latency p50 | Latency p95 | Cost per question | Answerer input tokens |
| ------ | ----------: | ----------: | ----------------: | --------------------: |
| Tuning |    2,100 ms |    4,024 ms |          $0.00026 |                 1,683 |
| Test   |    2,077 ms |    3,469 ms |          $0.00025 |                 1,656 |

The two runs cost $0.0303 in total.

## Failures

| Failure                             | Tuning | Test |
| ----------------------------------- | -----: | ---: |
| `retrieval_miss`                    |      8 |    5 |
| `false_abstention`                  |      9 |   10 |
| `wrong_version`                     |      1 |    0 |
| `missed_contradiction`              |      0 |    1 |
| `wrong_answer`                      |      0 |    1 |
| `unsupported_claim`, `answer_error` |      0 |    0 |

Two failure modes account for 33 of the 35 wrong answers.

**1. Multi-hop: the first hop is retrieved, the linked note is not (28 of 30 multi-hop questions).** In 20 of them the context holds the note that names the entity (the tooling sign-off, the account handoff, the pilot kickoff) but not the note that holds the answer (the supplier, person or customer page it links to); the answerer then abstains in 19, correctly, which the taxonomy counts as `false_abstention`. In the other 8 even the first hop is missing. Example, test `q-074`, "Who is the main contact at the customer running the Granite pilot?": the context has `Meetings/2026-05-31 Granite pilot kickoff.md`, which names Redwood Hills Realty Partners, but not `Customers/Redwood Hills Realty Partners.md`, which names the contact; answer: "The excerpts name the customer for the Granite pilot as Redwood Hills Realty Partners, but do not name its main contact person."

**2. Vocabulary shift: the decision is never retrieved (5 of 5 enclosure-vendor questions).** "Which quote was selected for the … enclosure?" retrieves both supplier quotes, the enclosure review that leaned toward the cheaper vendor and the project page that was never updated; it never retrieves the tooling sign-off, which records the final vendor without using the word "quote". Example, test `q-098` (Granite): the answer is the outdated vendor, Wexford Molding, instead of Lattice Molding; graded `retrieval_miss` because the source note is absent. The requirements document, which A sometimes retrieves, links to that sign-off.

**3. A contradiction resolved by authority (1 case).** Test `q-100`, "How many units did the Granite EVT build produce?": the EVT review says 89 units, a personal journal 94. The answerer gives 89 and mentions 94 as "her own tally, not the official record". The truth file treats the two as a contradiction to report, so it is graded `missed_contradiction`; the answer's reasoning is defensible.

## What this baseline says

- A simple retrieval pass answers single-note questions, reports absences and flags contradictions when both sources are retrieved: Haiku 5.5 never invented an answer (no `unsupported_claim`).
- It fails where the answer sits one link away (multi-hop) or behind a change of vocabulary (the quote / sign-off trap). Both are cases where following a labelled link from a retrieved note would reach the answer: the target of configs B and C.

## Limits

- One run per split: Haiku does not accept a temperature, so answers vary between runs; the variance is not measured yet.
- 60 questions per split: one question moves a category by 7 to 11 points.
- The corpus and its questions come from the same generator; known limits are listed in `docs/features/corpus-generator.md`.
- Latency includes the network round trips to Mistral and Anthropic.
