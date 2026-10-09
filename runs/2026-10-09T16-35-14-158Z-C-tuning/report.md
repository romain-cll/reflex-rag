# Eval run: config C, tuning split

k = 5, candidates = 50, commit e1da4b3

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 22.4% | 4.58 | 4468 | 7526 | 0.00160 | 2622 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.67 | 0.00 | 29.50 | 12 | 0 |
| multi_hop | 15 | 20.0% | 46.7% | 20.0% | 18.7% | 5.00 | 7813 | 10363 | 0.00204 | 2719 | 0 | 5 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.53 | 0.00 | 32.07 | 15 | 0 |
| temporal | 12 | 83.3% | 91.7% | 91.7% | 23.3% | 4.75 | 4793 | 9738 | 0.00166 | 2740 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.83 | 0.00 | 28.25 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 49.4% | 4.78 | 6005 | 8819 | 0.00191 | 2840 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.11 | 0.00 | 31.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 2.42 | 4969 | 6180 | 0.00155 | 2416 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.50 | 0.42 | 36.08 | 7 | 5 |
| overall | 60 | 76.7% | 81.3% | 72.9% | 23.2% | 4.32 | 5597 | 8864 | 0.00176 | 2684 | 0 | 6 | 7 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1.15 | 0.08 | 31.43 | 55 | 5 |

## Failures

### context_budget

q-014, q-016, q-019, q-021, q-025, q-036

### judge_rejected

q-013, q-015, q-022, q-023, q-024, q-026, q-027

### wrong_version

q-038
