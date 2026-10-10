# Eval run: config A, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 91.7% | 100.0% | 100.0% | 23.3% | 5.00 | 0.00000 | 206 | 1397 | 1925 | 3186 | 0.00035 | 2881 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| multi_hop | 15 | 13.3% | 43.3% | 6.7% | 17.3% | 5.00 | 0.00000 | 202 | 1284 | 2418 | 4200 | 0.00038 | 2668 | 0 | 0 | 0 | 0 | 13 | 0 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 91.7% | 91.7% | 91.7% | 26.7% | 5.00 | 0.00000 | 182 | 1668 | 2129 | 3395 | 0.00036 | 2650 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 77.8% | 100.0% | 100.0% | 44.4% | 5.00 | 0.00000 | 209 | 804 | 2575 | 3255 | 0.00046 | 3060 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 5.00 | 0.00000 | 226 | 1845 | 2052 | 32776 | 0.00034 | 2758 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| overall | 60 | 70.0% | 80.2% | 68.8% | 21.0% | 5.00 | 0.00000 | 202 | 1284 | 2173 | 3293 | 0.00038 | 2784 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 1 | 1 | 2 |

## Failures

### retrieval_miss

q-073, q-074, q-075, q-077, q-078, q-079, q-080, q-082, q-083, q-084, q-085, q-086, q-087, q-098

### missed_contradiction

q-100

### unsupported_claim

q-115

### wrong_answer

q-069, q-105
