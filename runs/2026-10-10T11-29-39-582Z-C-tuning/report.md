# Eval run: config C, tuning split

k = 5, candidates = 50, commit a339538

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 80.6% | 1.50 | 0.00095 | 2095 | 2718 | 3786 | 4432 | 0.00113 | 1342 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| multi_hop | 15 | 66.7% | 76.7% | 66.7% | 62.7% | 2.93 | 0.00107 | 2264 | 5260 | 4030 | 9324 | 0.00135 | 1868 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 50.0% | 3.25 | 0.00098 | 622 | 2629 | 2498 | 6855 | 0.00129 | 2129 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.25 | 0.00 | 1.42 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 100.0% | 2.33 | 0.00095 | 1993 | 3347 | 4402 | 5883 | 0.00127 | 1769 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.11 | 0.00 | 1.11 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00127 | 2442 | 3121 | 2442 | 3121 | 0.00127 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 90.0% | 92.7% | 89.6% | 71.0% | 2.03 | 0.00105 | 2227 | 3347 | 3616 | 6188 | 0.00127 | 1783 | 0 | 0 | 4 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.55 | 0.20 | 1.83 | 48 | 12 |

## Failures

### judge_rejected

q-014, q-018, q-019, q-027

### not_followed

q-026

### wrong_version

q-036
