# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 87.5% | 1.42 | 0.00093 | 1958 | 3775 | 3519 | 5326 | 0.00111 | 1337 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 73.3% | 83.3% | 80.0% | 68.0% | 3.00 | 0.00113 | 2513 | 6457 | 4437 | 8738 | 0.00140 | 1906 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 58.9% | 2.83 | 0.00093 | 846 | 6001 | 2599 | 7813 | 0.00120 | 1933 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 66.7% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00092 | 2023 | 2315 | 3894 | 5368 | 0.00123 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00116 | 2653 | 5065 | 2653 | 5065 | 0.00118 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 86.7% | 92.7% | 89.6% | 74.4% | 1.97 | 0.00103 | 2268 | 4976 | 3564 | 6141 | 0.00123 | 1727 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | 0.45 | 0.18 | 1.68 | 49 | 11 |

## Failures

### judge_rejected

q-077, q-081, q-102, q-108

### not_followed

q-085

### wrong_version

q-083

### missed_contradiction

q-100

### unsupported_claim

q-115
