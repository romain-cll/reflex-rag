# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 86.1% | 1.50 | 0.00089 | 1065 | 4248 | 2799 | 6077 | 0.00108 | 1375 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 73.3% | 80.0% | 73.3% | 64.7% | 3.07 | 0.00114 | 2439 | 5854 | 3948 | 7635 | 0.00142 | 1921 | 0 | 0 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 56.1% | 2.92 | 0.00090 | 619 | 123069 | 2434 | 124813 | 0.00117 | 1952 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00091 | 2047 | 2858 | 3823 | 5574 | 0.00121 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00116 | 2646 | 3905 | 2747 | 3905 | 0.00118 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 88.3% | 91.7% | 87.5% | 72.3% | 2.02 | 0.00101 | 2199 | 3905 | 3165 | 6169 | 0.00122 | 1746 | 0 | 0 | 5 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.45 | 0.18 | 1.68 | 49 | 11 |

## Failures

### judge_rejected

q-074, q-077, q-081, q-102, q-108

### not_followed

q-085

### unsupported_claim

q-115
