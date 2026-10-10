# Eval run: config B, tuning split

k = 5, candidates = 50, commit a339538

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 87.5% | 1.25 | 0.00168 | 4249 | 9497 | 5836 | 11224 | 0.00185 | 1238 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 12 | 0 |
| multi_hop | 15 | 86.7% | 86.7% | 86.7% | 82.7% | 2.07 | 0.00194 | 6729 | 9896 | 8518 | 12653 | 0.00216 | 1544 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.20 | 0.00 | 1.20 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 54.4% | 2.67 | 0.00179 | 6035 | 8323 | 8019 | 10264 | 0.00207 | 1884 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.08 | 0.00 | 1.08 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 92.6% | 2.56 | 0.00194 | 6463 | 8053 | 8886 | 10379 | 0.00226 | 1838 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00286 | 11243 | 14113 | 11243 | 14113 | 0.00286 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.00 | 0 | 12 |
| overall | 60 | 95.0% | 95.8% | 95.8% | 78.7% | 1.68 | 0.00204 | 6481 | 11774 | 8645 | 12522 | 0.00224 | 1608 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.47 | 0.20 | 1.67 | 48 | 12 |

## Failures

### judge_rejected

q-018, q-027

### wrong_version

q-036
