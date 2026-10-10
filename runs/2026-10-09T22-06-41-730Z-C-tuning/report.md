# Eval run: config C, tuning split

k = 5, candidates = 50, commit ce00e69

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 86.1% | 1.33 | 0.00091 | 2053 | 3147 | 3850 | 4853 | 0.00108 | 1273 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| multi_hop | 15 | 46.7% | 66.7% | 53.3% | 56.6% | 2.40 | 0.00104 | 2349 | 7538 | 4124 | 9848 | 0.00129 | 1718 | 0 | 0 | 5 | 2 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.13 | 0.00 | 1.13 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 45.6% | 3.42 | 0.00094 | 676 | 3239 | 2621 | 6871 | 0.00129 | 2249 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 96.3% | 2.44 | 0.00090 | 2166 | 2638 | 4290 | 5523 | 0.00123 | 1809 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00123 | 2709 | 3164 | 2709 | 3164 | 0.00123 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 86.7% | 89.6% | 85.4% | 68.6% | 1.92 | 0.00101 | 2285 | 3147 | 3689 | 5833 | 0.00123 | 1757 | 0 | 0 | 5 | 2 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.43 | 0.20 | 1.72 | 48 | 12 |

## Failures

### judge_rejected

q-014, q-018, q-024, q-026, q-027

### not_followed

q-013, q-023

### wrong_version

q-020
