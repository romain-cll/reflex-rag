# Eval run: config B, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 81.9% | 1.58 | 0.00167 | 4150 | 6200 | 6197 | 7736 | 0.00186 | 1413 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 12 | 0 |
| multi_hop | 15 | 73.3% | 73.3% | 73.3% | 71.1% | 2.00 | 0.00199 | 6683 | 10623 | 8447 | 12432 | 0.00220 | 1461 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.13 | 0.00 | 1.13 | 15 | 0 |
| temporal | 12 | 83.3% | 100.0% | 100.0% | 47.4% | 3.17 | 0.00187 | 4643 | 8429 | 7062 | 10477 | 0.00218 | 2034 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.08 | 0.00 | 1.08 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00189 | 6086 | 7686 | 8594 | 10637 | 0.00220 | 1746 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 0.42 | 0.00261 | 9964 | 12504 | 10067 | 12504 | 0.00267 | 1161 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.58 | 0.67 | 3.25 | 4 | 8 |
| overall | 60 | 86.7% | 89.6% | 87.5% | 67.0% | 1.87 | 0.00201 | 5934 | 11731 | 7911 | 11990 | 0.00222 | 1608 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.42 | 0.13 | 1.55 | 52 | 8 |

## Failures

### judge_rejected

q-077, q-078, q-081, q-085, q-102, q-107

### wrong_version

q-089, q-097
