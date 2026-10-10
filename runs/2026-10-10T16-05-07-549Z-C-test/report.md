# Eval run: config C, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 91.7% | 1.33 | 0.00075 | 664 | 2261 | 2775 | 3848 | 0.00094 | 1305 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 66.7% | 76.7% | 73.3% | 66.4% | 2.87 | 0.00082 | 653 | 2206 | 2470 | 4288 | 0.00108 | 1808 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.27 | 0.00 | 1.27 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 59.3% | 2.75 | 0.00078 | 688 | 2778 | 2454 | 5321 | 0.00105 | 1903 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00073 | 556 | 2498 | 3481 | 5222 | 0.00104 | 1708 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.17 | 0.00120 | 2662 | 3407 | 2687 | 3407 | 0.00122 | 1439 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.92 | 0.92 | 3.83 | 1 | 11 |
| overall | 60 | 86.7% | 90.6% | 87.5% | 75.0% | 1.90 | 0.00086 | 717 | 2800 | 2662 | 4252 | 0.00107 | 1682 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0.45 | 0.18 | 1.68 | 49 | 11 |

## Failures

### judge_rejected

q-074, q-077, q-081, q-085, q-102, q-108

### unsupported_claim

q-115

### wrong_answer

q-075
