# Eval run: config A, tuning split

k = 5, candidates = 50, commit bbe74a3

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 20.0% | 5.00 | 2076 | 8642 | 0.00033 | 2763 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| multi_hop | 15 | 6.7% | 36.7% | 6.7% | 14.7% | 5.00 | 2869 | 11770 | 0.00039 | 2644 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 | 0 |
| temporal | 12 | 75.0% | 75.0% | 75.0% | 21.7% | 5.00 | 2237 | 3669 | 0.00038 | 2729 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 42.2% | 5.00 | 2821 | 5717 | 0.00046 | 3079 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| no_answer | 12 | 100.0% | - | - | 0.0% | 5.00 | 2053 | 4141 | 0.00031 | 2657 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| overall | 60 | 71.7% | 74.0% | 64.6% | 18.3% | 5.00 | 2470 | 4470 | 0.00037 | 2753 | 0 | 0 | 0 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 |

## Failures

### retrieval_miss

q-013, q-014, q-015, q-016, q-017, q-018, q-019, q-020, q-021, q-023, q-024, q-025, q-026, q-027, q-028, q-036, q-037
