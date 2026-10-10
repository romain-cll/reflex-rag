# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 90.3% | 1.42 | 0.00074 | 631 | 1760 | 2386 | 3567 | 0.00093 | 1337 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 53.3% | 73.3% | 66.7% | 65.1% | 2.80 | 0.00080 | 611 | 2461 | 2423 | 5246 | 0.00106 | 1771 | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 55.1% | 2.92 | 0.00078 | 600 | 2366 | 2454 | 4192 | 0.00106 | 1979 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00073 | 556 | 1193 | 3324 | 3497 | 0.00104 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00116 | 2927 | 4061 | 2927 | 4061 | 0.00117 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 83.3% | 89.6% | 85.4% | 73.2% | 1.93 | 0.00085 | 690 | 3222 | 2565 | 4061 | 0.00105 | 1697 | 0 | 1 | 6 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 1 | 0.45 | 0.18 | 1.68 | 49 | 11 |

## Failures

### context_budget

q-078

### judge_rejected

q-074, q-077, q-081, q-085, q-102, q-108

### wrong_version

q-083

### unsupported_claim

q-115

### wrong_answer

q-075
