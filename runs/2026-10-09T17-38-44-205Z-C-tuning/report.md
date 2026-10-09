# Eval run: config C, tuning split

k = 5, candidates = 50, commit c97c6ad

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 66.9% | 1.92 | 3847 | 5436 | 0.00106 | 1428 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.17 | 0.00 | 1.33 | 12 | 0 |
| multi_hop | 15 | 46.7% | 66.7% | 46.7% | 35.6% | 4.00 | 5584 | 9452 | 0.00152 | 2295 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.73 | 0.00 | 1.73 | 15 | 0 |
| temporal | 12 | 83.3% | 100.0% | 100.0% | 31.8% | 4.33 | 5186 | 7568 | 0.00158 | 2617 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.50 | 0.00 | 1.67 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 56.9% | 4.22 | 5457 | 6603 | 0.00173 | 2631 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.56 | 0.00 | 1.56 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 2571 | 5624 | 0.00101 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 83.3% | 89.6% | 83.3% | 46.5% | 2.88 | 4211 | 7017 | 0.00137 | 2222 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0.80 | 0.20 | 2.08 | 48 | 12 |

## Failures

### judge_rejected

q-013, q-014, q-018, q-019, q-020, q-023, q-024, q-027

### wrong_version

q-036, q-038
