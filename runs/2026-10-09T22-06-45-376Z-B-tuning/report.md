# Eval run: config B, tuning split

k = 5, candidates = 50, commit ce00e69

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 77.8% | 1.50 | 0.00164 | 3904 | 6558 | 5044 | 8070 | 0.00182 | 1335 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 12 | 0 |
| multi_hop | 15 | 80.0% | 80.0% | 80.0% | 69.3% | 2.33 | 0.00175 | 5685 | 7543 | 7349 | 10476 | 0.00199 | 1633 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.13 | 0.00 | 1.13 | 15 | 0 |
| temporal | 12 | 75.0% | 91.7% | 91.7% | 32.8% | 3.25 | 0.00173 | 4759 | 7330 | 7378 | 11313 | 0.00210 | 2224 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 92.6% | 2.11 | 0.00175 | 5364 | 6718 | 7676 | 9524 | 0.00203 | 1631 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.08 | 0.00274 | 10575 | 13709 | 10575 | 13709 | 0.00276 | 1130 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 86.7% | 89.6% | 87.5% | 65.3% | 1.87 | 0.00192 | 5543 | 12322 | 7378 | 12322 | 0.00214 | 1694 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.42 | 0.18 | 1.60 | 49 | 11 |

## Failures

### judge_rejected

q-013, q-018, q-027, q-038, q-040, q-044

### wrong_version

q-034, q-036
