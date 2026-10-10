# Eval run: config C, tuning split

k = 5, candidates = 50, commit 0ba47d7

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 80.6% | 1.50 | 0.00075 | 673 | 4259 | 2412 | 6538 | 0.00093 | 1346 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| multi_hop | 15 | 80.0% | 83.3% | 80.0% | 67.1% | 2.80 | 0.00078 | 806 | 2350 | 2739 | 4950 | 0.00106 | 1786 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 48.6% | 3.33 | 0.00075 | 614 | 961 | 2646 | 4710 | 0.00109 | 2167 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.17 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 100.0% | 2.33 | 0.00073 | 652 | 1500 | 3195 | 3991 | 0.00107 | 1769 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00121 | 3357 | 4724 | 3357 | 4724 | 0.00121 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 95.0% | 94.8% | 93.8% | 72.0% | 2.02 | 0.00085 | 803 | 3582 | 2899 | 4710 | 0.00107 | 1768 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.52 | 0.20 | 1.80 | 48 | 12 |

## Failures

### judge_rejected

q-014, q-018, q-027
