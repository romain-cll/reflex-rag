# Eval run: config B, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 83.3% | 1.58 | 0.00167 | 4644 | 85839 | 6386 | 87627 | 0.00186 | 1404 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 12 | 0 |
| multi_hop | 15 | 73.3% | 80.0% | 80.0% | 77.8% | 2.07 | 0.00203 | 7425 | 9486 | 8715 | 11134 | 0.00223 | 1498 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.07 | 0.00 | 1.07 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 59.0% | 2.58 | 0.00192 | 5417 | 8400 | 7207 | 11063 | 0.00218 | 1845 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.17 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 66.7% | 83.3% | 66.7% | 100.0% | 2.00 | 0.00189 | 5890 | 8968 | 7790 | 10744 | 0.00217 | 1709 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.22 | 0.00 | 1.22 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.33 | 0.00256 | 10237 | 13696 | 10237 | 13696 | 0.00260 | 1208 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.67 | 0.75 | 3.42 | 3 | 9 |
| overall | 60 | 86.7% | 90.6% | 87.5% | 74.0% | 1.72 | 0.00202 | 6809 | 11474 | 8550 | 11474 | 0.00221 | 1578 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0.42 | 0.15 | 1.57 | 51 | 9 |

## Failures

### judge_rejected

q-077, q-081, q-085, q-100, q-105, q-107

### unsupported_claim

q-115

### wrong_answer

q-075
