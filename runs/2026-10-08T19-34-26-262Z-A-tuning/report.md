# Eval run: config A, tuning split

k = 8, commit 6de2b91

## Metrics

| category | n | accuracy | recall | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | retrieval_miss | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | answer_error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 1840 | 2100 | 0.00021 | 1650 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| multi_hop | 15 | 6.7% | 36.7% | 2639 | 5234 | 0.00026 | 1670 | 5 | 9 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 66.7% | 75.0% | 2272 | 4359 | 0.00031 | 1643 | 3 | 0 | 1 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 100.0% | 94.4% | 2538 | 2722 | 0.00030 | 1772 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| no_answer | 12 | 100.0% | - | 1940 | 3738 | 0.00022 | 1704 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| overall | 60 | 70.0% | 72.9% | 2100 | 4024 | 0.00026 | 1683 | 8 | 9 | 1 | 0 | 0 | 0 | 0 |

## Failures

### retrieval_miss

q-014, q-017, q-018, q-020, q-027, q-028, q-036, q-037

### false_abstention

q-013, q-015, q-016, q-019, q-021, q-023, q-024, q-025, q-026

### wrong_version

q-032
