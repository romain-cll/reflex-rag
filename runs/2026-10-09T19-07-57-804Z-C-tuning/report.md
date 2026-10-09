# Eval run: config C, tuning split

k = 5, candidates = 50, commit db31145

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 83.3% | 91.7% | 91.7% | 57.9% | 2.50 | 2225 | 4307 | 0.00082 | 1803 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.17 | 0.00 | 1.33 | 12 | 0 |
| multi_hop | 15 | 46.7% | 66.7% | 46.7% | 46.2% | 3.67 | 2578 | 3932 | 0.00094 | 2172 | 0 | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.67 | 0.00 | 1.67 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 35.4% | 3.92 | 2388 | 4748 | 0.00094 | 2381 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.33 | 0.00 | 1.50 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 73.3% | 3.33 | 3143 | 3637 | 0.00095 | 2135 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.22 | 0.00 | 1.22 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 2475 | 3152 | 0.00096 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 81.7% | 87.5% | 81.3% | 51.5% | 2.70 | 2486 | 3932 | 0.00092 | 2125 | 0 | 4 | 2 | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0.70 | 0.20 | 1.98 | 48 | 12 |

## Failures

### context_budget

q-001, q-014, q-018, q-020

### judge_rejected

q-019, q-027

### not_followed

q-013, q-023, q-026

### wrong_version

q-036

### wrong_answer

q-003
