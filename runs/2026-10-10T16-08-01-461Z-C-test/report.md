# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 86.1% | 1.50 | 0.00091 | 2054 | 4031 | 3700 | 5987 | 0.00110 | 1378 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 73.3% | 83.3% | 80.0% | 63.7% | 3.07 | 0.00116 | 2245 | 70468 | 3987 | 71391 | 0.00144 | 1907 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 53.3% | 3.08 | 0.00093 | 611 | 7333 | 2459 | 10576 | 0.00123 | 2028 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 66.7% | 88.9% | 77.8% | 90.7% | 2.33 | 0.00090 | 2102 | 2519 | 3804 | 5034 | 0.00120 | 1751 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.08 | 0.00118 | 2824 | 3963 | 2854 | 3963 | 0.00119 | 1018 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.83 | 0.92 | 3.75 | 1 | 11 |
| overall | 60 | 88.3% | 92.7% | 89.6% | 70.3% | 2.05 | 0.00103 | 2245 | 5065 | 3279 | 8514 | 0.00124 | 1760 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0.43 | 0.18 | 1.67 | 49 | 11 |

## Failures

### judge_rejected

q-077, q-081, q-102, q-108

### not_followed

q-085

### wrong_answer

q-075, q-100
