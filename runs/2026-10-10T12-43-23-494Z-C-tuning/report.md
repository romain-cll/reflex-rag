# Eval run: config C, tuning split

k = 5, candidates = 50, commit c72ebac

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 84.7% | 1.42 | 0.00075 | 646 | 2612 | 2362 | 4401 | 0.00093 | 1305 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.17 | 12 | 0 |
| multi_hop | 15 | 66.7% | 76.7% | 66.7% | 65.6% | 2.87 | 0.00075 | 621 | 1373 | 2259 | 5572 | 0.00102 | 1798 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.33 | 0.00 | 1.33 | 15 | 0 |
| temporal | 12 | 91.7% | 100.0% | 100.0% | 50.0% | 3.25 | 0.00077 | 572 | 2647 | 2498 | 5574 | 0.00110 | 2078 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.25 | 0.00 | 1.42 | 12 | 0 |
| contradiction | 9 | 100.0% | 100.0% | 100.0% | 100.0% | 2.33 | 0.00073 | 577 | 1328 | 2814 | 3785 | 0.00103 | 1769 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 | 0.00 | 1.00 | 9 | 0 |
| no_answer | 12 | 100.0% | - | - | - | 0.00 | 0.00122 | 2625 | 3301 | 2625 | 3301 | 0.00122 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.00 | 1.00 | 4.08 | 0 | 12 |
| overall | 60 | 90.0% | 92.7% | 89.6% | 72.9% | 2.00 | 0.00084 | 662 | 2892 | 2529 | 4355 | 0.00106 | 1739 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0.53 | 0.20 | 1.82 | 48 | 12 |

## Failures

### judge_rejected

q-014, q-018, q-019, q-021, q-027

### wrong_version

q-036
