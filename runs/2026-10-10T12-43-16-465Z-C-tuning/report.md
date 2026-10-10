# Eval run: config C, tuning split

k = 5, candidates = 50, commit c72ebac

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 79.2% | 1.58 | 0.00087 | 1635 | 2776 | 3508 | 4333 | 0.00106 | 1378 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| multi_hop | 15 | 80.0% | 83.3% | 80.0% | 62.2% | 3.13 | 0.00102 | 2131 | 4778 | 3955 | 7679 | 0.00131 | 1920 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 50.0% | 3.25 | 0.00085 | 908 | 2597 | 3061 | 5276 | 0.00120 | 2165 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.17 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 96.3% | 2.44 | 0.00086 | 756 | 2660 | 3325 | 5219 | 0.00120 | 1823 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.11 | 0.00 | 1.11 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00123 | 2962 | 5377 | 2962 | 5377 | 0.00123 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 93.3% | 94.8% | 93.8% | 69.8% | 2.12 | 0.00097 | 2031 | 3993 | 3651 | 5276 | 0.00121 | 1827 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.53 | 0.20 | 1.82 | 48 | 12 |

## Failures

### judge_rejected

q-014, q-018, q-027

### wrong_version

q-036
