# Eval run: config B, tuning split

k = 5, candidates = 50, commit 81e06ef

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 72.9% | 1.67 | 5829 | 7791 | 0.00185 | 1408 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.00 | 1.25 | 12 | 0 |
| multi_hop | 15 | 73.3% | 80.0% | 73.3% | 63.1% | 3.07 | 8741 | 12467 | 0.00216 | 1975 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.60 | 0.00 | 1.60 | 15 | 0 |
| temporal | 12 | 83.3% | 83.3% | 83.3% | 40.8% | 3.08 | 6630 | 12944 | 0.00201 | 2019 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 89.8% | 2.33 | 9373 | 13255 | 0.00222 | 1720 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 11926 | 14924 | 0.00288 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.00 | 0 | 12 |
| overall | 60 | 86.7% | 87.5% | 83.3% | 65.0% | 2.07 | 8386 | 12944 | 0.00222 | 1796 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.72 | 0.20 | 1.92 | 48 | 12 |

## Failures

### judge_rejected

q-013, q-018, q-023, q-027, q-028, q-039, q-040, q-044
