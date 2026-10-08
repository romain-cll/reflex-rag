# Phase 2 — baseline, config A (simple RAG)

Config A is a single retrieval pass: BM25 and `mistral-embed` candidates fused by reciprocal rank fusion, the top 8 chunks handed to a fixed answerer (Claude Haiku 5.5, effort `low`, structured output). No judge, no loop. Every figure below comes from the two traced runs versioned with this note, unless another source is named.

## Setup

- Corpus: dev vault, 202 notes of the fictional company Larkspur Devices (`corpus/dev/`, generator revision 2, seed 42, scale 1); `reflex index` built 766 chunks and 253 links from it.
- Questions: `evals/dev/questions.json`, derived from the truth file; two disjoint splits of 60 (12 simple, 15 multi-hop, 12 temporal, 9 contradiction, 12 no-answer each). Each question lists the groups of notes its answer needs: every group is needed, one note of a group is enough.
- Grading: deterministic, against the expected values of the truth file (see `docs/features/eval-run.md`). The runs were answered at commit `6de2b91` and regraded offline with `scripts/regrade-run.ts` after the grader review (source groups, matching at word and number boundaries); the answers and costs are those recorded.
- Runs: `runs/2026-10-08T19-34-26-262Z-A-tuning/` and `runs/2026-10-08T19-36-50-711Z-A-test/`, run one after the other.

## Results

Accuracy as correct / questions; recall as the mean share of the needed source groups found in the context.

| Category      |      Tuning |        Test | Recall (tuning / test) |
| ------------- | ----------: | ----------: | ---------------------: |
| Simple        |     12 / 12 |     12 / 12 |        100.0% / 100.0% |
| Multi-hop     |      1 / 15 |      1 / 15 |          36.7% / 43.3% |
| Temporal      |      8 / 12 |     10 / 12 |          75.0% / 83.3% |
| Contradiction |       9 / 9 |       8 / 9 |        100.0% / 100.0% |
| No answer     |     12 / 12 |     12 / 12 |                    n/a |
| **Overall**   | **42 / 60** | **43 / 60** |          74.0% / 78.1% |

| Run    | Latency p50 | Latency p95 | Cost per question | Answerer input tokens |
| ------ | ----------: | ----------: | ----------------: | --------------------: |
| Tuning |    2,100 ms |    4,024 ms |          $0.00026 |                 1,683 |
| Test   |    2,077 ms |    3,469 ms |          $0.00025 |                 1,656 |

The two runs cost $0.0303 in total.

## Failures

| Failure                                                                 | Tuning | Test |
| ----------------------------------------------------------------------- | -----: | ---: |
| `retrieval_miss`                                                        |     17 |   16 |
| `wrong_version`                                                         |      1 |    0 |
| `missed_contradiction`                                                  |      0 |    1 |
| `false_abstention`, `unsupported_claim`, `wrong_answer`, `answer_error` |      0 |    0 |

All 33 retrieval misses come from two modes; the other 2 failures are discussed after them.

**1. The answer sits one link away from a retrieved note (17 multi-hop questions).** The context holds the note that names the entity (the account handoff, the pilot kickoff, the schedule review) but not the page it links to, which holds the answer (the person, customer or lab page). The answerer then abstains, correctly. Example, test `q-074`, "Who is the main contact at the customer running the Granite pilot?": the context has `Meetings/2026-05-31 Granite pilot kickoff.md`, which names Redwood Hills Realty Partners, but not `Customers/Redwood Hills Realty Partners.md`, which names the contact; answer: "The excerpts name the customer for the Granite pilot as Redwood Hills Realty Partners, but do not name its main contact person."

**2. The decision is worded without the question's vocabulary (16 questions: 11 multi-hop, 5 temporal).** The tooling sign-off that records the final enclosure vendor never uses the word "quote", and none of these 16 contexts contains it. It fails the 5 "Which quote was selected for the … enclosure?" questions, where the context holds both supplier quotes, the enclosure review that leaned toward the cheaper vendor and the project page that was never updated; and the 11 supplier chains ("Who is Larkspur's contact at the supplier building the … enclosure?", "In which city is the supplier of the … EVT enclosures based?"), which go through that sign-off. Example, test `q-098` (Granite): the answer is the outdated vendor, Wexford Molding, instead of Lattice Molding. The requirements document, which links to the sign-off, is in 7 of these 16 contexts.

**Other failures.** Tuning `q-032`, "Who owns the Northgate Realty Partners account?": the context holds the account page (former owner) and the handoff meeting (new owner); the answerer returns both names as a conflict instead of reading the handoff as superseding the page, so the value holds the stale owner (`wrong_version`). Test `q-100`, "How many units did the Granite EVT build produce?": the EVT review says 89 units, a personal journal 94; the answerer gives 89 and mentions 94 as "her own tally, not the official record". The truth file treats the two as a contradiction to report (`missed_contradiction`); the answer's reasoning is defensible.

## What this baseline says

- A single retrieval pass answers single-note questions, reports absences and flags contradictions when both sources are retrieved: the answerer never invented an answer (no `unsupported_claim`, no `false_abstention`).
- In the 17 questions of the first mode, a retrieved note links to the missing one; in the second, the missing sign-off is linked from the requirements document, retrieved in 7 of the 16 cases, and a search that does not rely on the word "quote" could find it. Following labelled links and searching again are what configs B and C add.

## Limits

- One run per split: Haiku does not accept a temperature, so answers vary between runs; the variance is not measured yet.
- 60 questions per split: one question moves a category by 7 to 11 points.
- The corpus and its questions come from the same generator; known limits are listed in `docs/features/corpus-generator.md`.
- Latency includes the network round trips to Mistral and Anthropic.
