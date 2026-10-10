# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 90.3% | 1.42 | 0.00074 | 589 | 1303 | 2345 | 3256 | 0.00093 | 1337 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 80.0% | 80.0% | 80.0% | 64.2% | 3.00 | 0.00081 | 714 | 2171 | 2517 | 4307 | 0.00107 | 1864 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 59.3% | 2.75 | 0.00078 | 669 | 6651 | 2482 | 8529 | 0.00105 | 1890 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 100.0% | 2.11 | 0.00073 | 570 | 701 | 2839 | 3683 | 0.00102 | 1665 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.08 | 0.00118 | 2503 | 3168 | 2598 | 3168 | 0.00120 | 1018 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.83 | 0.92 | 3.75 | 1 | 11 |
| overall | 60 | 91.7% | 91.7% | 89.6% | 74.7% | 1.92 | 0.00085 | 667 | 3069 | 2503 | 4139 | 0.00106 | 1688 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.43 | 0.18 | 1.67 | 49 | 11 |

## Failures

### judge_rejected

q-077, q-081, q-085, q-102, q-108
