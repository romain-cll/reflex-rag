# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 90.3% | 1.42 | 0.00074 | 678 | 919 | 2399 | 3111 | 0.00093 | 1337 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 66.7% | 80.0% | 73.3% | 67.8% | 2.87 | 0.00080 | 726 | 1346 | 2407 | 4566 | 0.00108 | 1836 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 57.9% | 2.83 | 0.00078 | 568 | 1294 | 2368 | 3135 | 0.00105 | 1928 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00074 | 800 | 8106 | 3171 | 9755 | 0.00103 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.11 | 0.00 | 1.11 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00118 | 2793 | 5566 | 2793 | 5566 | 0.00120 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 86.7% | 91.7% | 87.5% | 74.7% | 1.93 | 0.00085 | 726 | 3420 | 2516 | 4266 | 0.00106 | 1705 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0.47 | 0.18 | 1.70 | 49 | 11 |

## Failures

### judge_rejected

q-074, q-077, q-081, q-085, q-102, q-108

### unsupported_claim

q-115

### wrong_answer

q-075
