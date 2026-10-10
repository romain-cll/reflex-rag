# Eval run: config B, test split

k = 5, candidates = 50, commit c9e4a6e

## Metrics

| category | n | accuracy | recall | context complete | precision | notes in context | retrieval cost/question (USD) | retrieval p50 (ms) | retrieval p95 (ms) | p50 (ms) | p95 (ms) | cost/question (USD) | input tokens | loop_error | context_budget | judge_rejected | not_followed | retrieval_miss | answer_error | false_abstention | wrong_version | missed_contradiction | unsupported_claim | wrong_answer | hops | rewrites | judge calls | answer | abstain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| simple | 12 | 100.0% | 100.0% | 100.0% | 78.3% | 1.75 | 0.00168 | 4222 | 7765 | 6206 | 9534 | 0.00188 | 1492 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.08 | 0.00 | 1.08 | 12 | 0 |
| multi_hop | 15 | 60.0% | 70.0% | 66.7% | 65.8% | 2.13 | 0.00205 | 7447 | 9537 | 9081 | 10938 | 0.00227 | 1606 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.13 | 0.00 | 1.13 | 15 | 0 |
| temporal | 12 | 100.0% | 100.0% | 100.0% | 49.6% | 2.83 | 0.00194 | 5019 | 10843 | 6667 | 12749 | 0.00221 | 1991 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.00 | 1.25 | 12 | 0 |
| contradiction | 9 | 77.8% | 88.9% | 77.8% | 96.3% | 2.22 | 0.00185 | 5756 | 9438 | 8451 | 12171 | 0.00217 | 1746 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.11 | 0.00 | 1.11 | 9 | 0 |
| no_answer | 12 | 91.7% | - | - | 0.0% | 0.25 | 0.00269 | 10348 | 12646 | 10830 | 12646 | 0.00272 | 1229 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1.83 | 0.83 | 3.67 | 2 | 10 |
| overall | 60 | 85.0% | 88.5% | 85.4% | 67.8% | 1.83 | 0.00205 | 6620 | 11338 | 8504 | 11473 | 0.00226 | 1681 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0.48 | 0.17 | 1.65 | 50 | 10 |

## Failures

### judge_rejected

q-077, q-078, q-081, q-083, q-085, q-102, q-107

### unsupported_claim

q-115

### wrong_answer

q-075
