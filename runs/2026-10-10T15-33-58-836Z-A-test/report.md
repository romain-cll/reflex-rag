# Eval run: config A, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 91.7% | 100.0% | 100.0% | 23.3% | 5.00 | 0.00000 | 278 | 1253 | 2198 | 2966 | 0.00035 | 2881 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| multi_hop | 15 | 13.3% | 43.3% | 6.7% | 17.3% | 5.00 | 0.00000 | 212 | 1688 | 2585 | 4055 | 0.00038 | 2668 | 0 | 0 | 0 | 0 | 13 | 0 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 91.7% | 91.7% | 91.7% | 26.7% | 5.00 | 0.00000 | 200 | 1278 | 2095 | 3169 | 0.00036 | 2650 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 88.9% | 100.0% | 100.0% | 44.4% | 5.00 | 0.00000 | 233 | 2803 | 2823 | 4825 | 0.00048 | 3060 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 5.00 | 0.00000 | 404 | 6641 | 2149 | 8307 | 0.00034 | 2758 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| overall | 60 | 71.7% | 80.2% | 68.8% | 21.0% | 5.00 | 0.00000 | 233 | 1688 | 2280 | 4055 | 0.00037 | 2784 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 1 | 1 | 1 |

## Failures

### retrieval_miss

q-073, q-074, q-075, q-077, q-078, q-079, q-080, q-082, q-083, q-084, q-085, q-086, q-087, q-098

### missed_contradiction

q-100

### unsupported_claim

q-115

### wrong_answer

q-069
