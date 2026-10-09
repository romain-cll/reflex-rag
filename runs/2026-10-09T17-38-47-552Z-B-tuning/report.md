# Eval run: config B, tuning split

k = 5, candidates = 50, commit c97c6ad

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 67.6% | 2.08 | 6067 | 8051 | 0.00196 | 1584 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.42 | 0.00 | 1.42 | 12 | 0 |
| multi_hop | 15 | 86.7% | 86.7% | 86.7% | 65.8% | 3.20 | 8556 | 14330 | 0.00225 | 1992 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.53 | 0.00 | 1.53 | 15 | 0 |
| temporal | 12 | 91.7% | 91.7% | 91.7% | 42.8% | 3.33 | 6445 | 13651 | 0.00213 | 2150 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 66.7% | 83.3% | 66.7% | 90.7% | 2.33 | 9102 | 12036 | 0.00220 | 1724 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.08 | 10966 | 15710 | 0.00283 | 1029 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.00 | 1 | 11 |
| overall | 60 | 90.0% | 90.6% | 87.5% | 63.8% | 2.25 | 8051 | 13651 | 0.00228 | 1862 | 0 | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.73 | 0.20 | 1.93 | 49 | 11 |

## Failures

### context_budget

q-036

### judge_rejected

q-018, q-027, q-042, q-044, q-047
