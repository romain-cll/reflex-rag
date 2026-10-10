# Eval run: config B, tuning split

k = 5, candidates = 50, commit bbe74a3

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain | loop_error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 91.7% | 91.7% | 91.7% | 90.9% | 1.08 | 6503 | 11078 | 0.00195 | 1212 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.50 | 0.08 | 1.58 | 11 | 1 | 0 |
| multi_hop | 15 | 0.0% | 13.3% | 0.0% | 66.7% | 0.40 | 7754 | 13268 | 0.00200 | 1068 | 8 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.47 | 0.07 | 1.67 | 6 | 1 | 8 |
| temporal | 12 | 58.3% | 66.7% | 66.7% | 44.4% | 1.67 | 5915 | 8113 | 0.00183 | 1632 | 3 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.17 | 0.00 | 1.17 | 9 | 0 | 3 |
| contradiction | 9 | 33.3% | 44.4% | 33.3% | 100.0% | 1.00 | 7522 | 12174 | 0.00195 | 1625 | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.11 | 0.00 | 1.11 | 5 | 0 | 4 |
| no_answer | 12 | 75.0% | - | - | - | 0.00 | 12113 | 18580 | 0.00257 | - | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.50 | 0.75 | 3.25 | 0 | 9 | 3 |
| overall | 60 | 50.0% | 52.1% | 45.8% | 74.2% | 0.80 | 7118 | 13846 | 0.00206 | 1373 | 18 | 0 | 11 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.57 | 0.18 | 1.78 | 31 | 11 | 18 |

## Failures

### loop_error

q-013, q-014, q-015, q-020, q-021, q-023, q-024, q-026, q-028, q-035, q-037, q-040, q-042, q-045, q-048, q-051, q-053, q-060

### judge_rejected

q-010, q-016, q-017, q-018, q-019, q-022, q-025, q-027, q-036, q-043, q-044

### wrong_version

q-038
