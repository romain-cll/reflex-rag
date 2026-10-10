# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 86.1% | 1.50 | 0.00074 | 870 | 3516 | 2648 | 5336 | 0.00094 | 1375 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 80.0% | 80.0% | 80.0% | 68.7% | 2.87 | 0.00083 | 610 | 2392 | 2384 | 4881 | 0.00110 | 1830 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 59.3% | 2.75 | 0.00078 | 608 | 1600 | 2412 | 3657 | 0.00106 | 1903 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 66.7% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00073 | 670 | 997 | 2750 | 4064 | 0.00104 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00116 | 2647 | 4215 | 2755 | 4215 | 0.00117 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 88.3% | 91.7% | 89.6% | 74.3% | 1.93 | 0.00085 | 717 | 3516 | 2539 | 4215 | 0.00106 | 1706 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0.45 | 0.18 | 1.68 | 49 | 11 |

## Failures

### judge_rejected

q-077, q-081, q-085, q-102, q-108

### missed_contradiction

q-100

### unsupported_claim

q-115
