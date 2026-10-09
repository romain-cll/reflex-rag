# Eval run: config C, tuning split

k = 5, candidates = 50, commit db31145

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 91.7% | 100.0% | 100.0% | 57.2% | 2.42 | 4001 | 5741 | 0.00129 | 1742 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.25 | 0.00 | 1.42 | 12 | 0 |
| multi_hop | 15 | 60.0% | 80.0% | 60.0% | 47.9% | 3.93 | 4809 | 7181 | 0.00146 | 2292 | 0 | 2 | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.53 | 0.00 | 1.53 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 35.4% | 3.92 | 4401 | 6754 | 0.00153 | 2421 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.17 | 0.00 | 1.33 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 69.6% | 3.44 | 5335 | 6018 | 0.00151 | 2194 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.44 | 0.00 | 1.44 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 2389 | 3405 | 0.00096 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 86.7% | 93.8% | 87.5% | 51.2% | 2.77 | 4147 | 6018 | 0.00135 | 2169 | 0 | 2 | 1 | 3 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0.68 | 0.20 | 1.97 | 48 | 12 |

## Failures

### context_budget

q-014, q-020

### judge_rejected

q-018

### not_followed

q-013, q-023, q-026

### wrong_version

q-028

### wrong_answer

q-003
