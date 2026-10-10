# Eval run: config A, tuning split

k = 5, candidates = 50, commit a339538

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 20.0% | 5.00 | 0.00000 | 177 | 607 | 1928 | 2792 | 0.00032 | 2763 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| multi_hop | 15 | 6.7% | 36.7% | 6.7% | 14.7% | 5.00 | 0.00000 | 211 | 1966 | 2620 | 4930 | 0.00039 | 2644 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 75.0% | 75.0% | 75.0% | 21.7% | 5.00 | 0.00000 | 187 | 352 | 2238 | 3134 | 0.00038 | 2729 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 42.2% | 5.00 | 0.00000 | 200 | 558 | 2897 | 3144 | 0.00046 | 3079 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 5.00 | 0.00000 | 200 | 3367 | 2078 | 5066 | 0.00032 | 2657 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| overall | 60 | 71.7% | 74.0% | 64.6% | 18.3% | 5.00 | 0.00000 | 193 | 1417 | 2212 | 3330 | 0.00037 | 2753 | 0 | 0 | 0 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 |

## Failures

### retrieval_miss

q-013, q-014, q-015, q-016, q-017, q-018, q-019, q-020, q-021, q-023, q-024, q-025, q-026, q-027, q-028, q-036, q-037
