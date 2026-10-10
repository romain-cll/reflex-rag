# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 91.7% | 1.33 | 0.00074 | 605 | 1314 | 2329 | 3102 | 0.00093 | 1305 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 66.7% | 76.7% | 73.3% | 66.4% | 2.87 | 0.00080 | 573 | 1030 | 2309 | 4332 | 0.00107 | 1832 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 55.1% | 2.92 | 0.00078 | 559 | 914 | 2396 | 4645 | 0.00108 | 1972 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00073 | 696 | 1171 | 3000 | 3484 | 0.00103 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.08 | 0.00116 | 2653 | 4609 | 2732 | 4609 | 0.00118 | 1018 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.83 | 0.92 | 3.75 | 1 | 11 |
| overall | 60 | 88.3% | 90.6% | 87.5% | 74.0% | 1.92 | 0.00085 | 634 | 2925 | 2484 | 4237 | 0.00106 | 1698 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.43 | 0.18 | 1.67 | 49 | 11 |

## Failures

### judge_rejected

q-074, q-077, q-081, q-085, q-102, q-108

### wrong_answer

q-075
