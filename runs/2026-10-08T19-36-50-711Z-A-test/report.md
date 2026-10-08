# Eval run: config A, test split

k = 8, commit 6de2b91

## Metrics

| category | n | accuracy | recall | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | retrieval_miss | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | answer_error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 1948 | 2520 | 0.00022 | 1662 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| multi_hop | 15 | 6.7% | 43.3% | 2236 | 4266 | 0.00027 | 1656 | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 83.3% | 83.3% | 2039 | 3469 | 0.00024 | 1645 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 88.9% | 100.0% | 2441 | 2786 | 0.00029 | 1767 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| no_answer | 12 | 100.0% | - | 1950 | 4455 | 0.00021 | 1576 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| overall | 60 | 71.7% | 78.1% | 2077 | 3469 | 0.00025 | 1656 | 16 | 0 | 0 | 1 | 0 | 0 | 0 |

## Failures

### retrieval_miss

q-073, q-074, q-075, q-077, q-078, q-079, q-080, q-081, q-082, q-083, q-084, q-085, q-086, q-087, q-095, q-098

### missed_contradiction

q-100
