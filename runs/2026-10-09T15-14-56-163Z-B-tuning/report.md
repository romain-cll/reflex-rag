# Eval run: config B, tuning split

k = 5, candidates = 50, commit 341aac8

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 95.8% | 1.08 | 5619 | 8794 | 0.00181 | 1170 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.00 | 1.25 | 12 | 0 |
| multi_hop | 15 | 20.0% | 30.0% | 0.0% | 75.0% | 0.80 | 9292 | 14550 | 0.00215 | 1054 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.87 | 0.20 | 2.07 | 12 | 3 |
| temporal | 12 | 83.3% | 100.0% | 100.0% | 59.7% | 2.25 | 7071 | 12479 | 0.00202 | 1695 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 100.0% | 2.11 | 9483 | 13854 | 0.00219 | 1626 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 13931 | 19073 | 0.00290 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.00 | 0 | 12 |
| overall | 60 | 73.3% | 76.0% | 64.6% | 81.5% | 1.18 | 8794 | 16410 | 0.00222 | 1370 | 0 | 0 | 14 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0.78 | 0.25 | 2.03 | 45 | 15 |

## Failures

### judge_rejected

q-013, q-016, q-017, q-018, q-019, q-021, q-022, q-023, q-024, q-025, q-026, q-027, q-044, q-047

### false_abstention

q-037

### wrong_version

q-036
