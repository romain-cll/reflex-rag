# Report: a system-one judge in a retrieval loop

Agent harnesses spend LLM calls on yes/no decisions inside their retrieval loops: does this note answer the question, is the answer complete, which link is worth opening. I measured whether a system-one model, which returns a probability for each option of a closed question instead of writing text, can take those decisions instead of the LLM, at equal quality, for less cost and latency.

**Answer, on this bench.** Yes for quality and latency, partly for cost. The loop judged by Jev, TypeSafe's system-one model (config C), matches the same loop judged by Claude Haiku 5.5 (config B): the same share of complete contexts (86.8%) and the same accuracy (51.7/60). Its retrieval takes 0.68 s instead of 6.45 s (p50) and costs $0.00085 per question instead of $0.00203 (−58%). End to end, C's latency is close to simple RAG's (2.5 s against 2.2 s) but its cost is not: simple RAG's retrieval is almost free, and C costs 2.8 times as much.

**The fix the traces pointed to** (section 4). C's Haiku fallback ran in 28 of 60 questions, nearly always after Jev had already found the answer. Restricted to the turns where no note stating the answer is kept yet (config C+), it runs in 1.7 of 60, retrieval p50 drops from 2.24 s to 0.70 s, and C+ is at least as good as B.

Test split, 60 questions, mean of three runs per config, [min–max] when the runs differ:

| Config                                   |  Context complete | Retrieval cost / question | Retrieval latency p50 |        Accuracy | Questions with a Haiku fallback |
| ---------------------------------------- | ----------------: | ------------------------: | --------------------: | --------------: | ------------------------------: |
| A: simple RAG                            |             68.8% |                $0.0000015 |                0.22 s | 42.7/60 [42–43] |                                 |
| B: loop, Haiku                           | 86.8% [85.4–87.5] |                  $0.00203 |                6.45 s | 51.7/60 [51–52] |                                 |
| C: loop, Jev                             | 86.8% [85.4–87.5] |                  $0.00085 |                0.68 s | 51.7/60 [50–53] |                            0/60 |
| C+: loop, Jev, Haiku while no answer     | 88.9% [87.5–89.6] |                  $0.00086 |                0.70 s | 53.3/60 [52–55] |                          1.7/60 |
| C before: loop, Jev, Haiku at every turn | 88.9% [87.5–89.6] |                  $0.00102 |                2.24 s | 52.7/60 [52–53] |                           28/60 |

- **Context complete** is the share of the 48 answerable questions whose final context holds every expected source.
- **Retrieval cost and latency** cover the layer under test (search, judge, fallback, query rewrites), not the answerer shared by every config.
- **Accuracy** is end to end: it also measures the answerer, which is why it comes last. The layer under test returns context, not answers.

Every test figure comes from the 15 runs at commit `c9e4a6e`, three per config, listed in `docs/results/RESULTS.md`. Tuning figures name their run, and figures `RESULTS.md` does not give name the `docs/experiments/` script behind them.

## Contents

1. [Setup and bench](#1-setup-and-bench)
2. [Result](#2-result)
3. [Which layer failed](#3-which-layer-failed)
4. [The fix the traces pointed to](#4-the-fix-the-traces-pointed-to)
5. [Can the numbers be trusted](#5-can-the-numbers-be-trusted)
6. [How C got there, on the tuning split](#6-how-c-got-there-on-the-tuning-split)
7. [Limits and next steps](#7-limits-and-next-steps)
8. [Reproduce](#8-reproduce)

## 1. Setup and bench

**Corpus.** 202 Markdown notes of a fictional hardware company, Larkspur Devices: customer and supplier pages, people, projects, meeting notes, quotes, specs, decisions and personal journals. The notes link to each other with wikilinks in running text.

Claude models wrote the notes from a truth file, `corpus/dev/world.json`, produced by a seeded generator that plants four traps:

- decisions revised over time, and pages never updated after them;
- copies that diverge;
- facts worded without the question's vocabulary;
- topics the vault never mentions.

A validator checks the vault against the truth file: 0 errors. The index, derived from the vault, holds 766 chunks and 253 links.

**Questions.** 120 questions derived from the truth file, each with its expected answer and its source notes. They are split into tuning and test splits of 60 questions each, with the same category mix:

| Category      | Questions per split | What it tests                                                        |
| ------------- | ------------------: | -------------------------------------------------------------------- |
| simple        |                  12 | one note is enough                                                   |
| multi-hop     |                  15 | the answer is one or two links away from the note the question names |
| temporal      |                  12 | the fact changed over time: only the latest version is right         |
| contradiction |                   9 | two notes disagree, and the answer must report both                  |
| no-answer     |                  12 | the vault does not say, and the answer must abstain                  |

Thresholds and fixes were chosen on the tuning split; only test-split figures are claimed.

**Configs.** All five configs share the same search and the same answerer:

- **Search**: BM25 and `mistral-embed`, fused by reciprocal rank. The 50 best chunks are grouped by note: about 27 candidate notes per question on the first turn.
- **Answerer**: Claude Haiku 5.5 with a fixed prompt, there only to measure end-to-end quality.

| Config   | Retrieval                     | Judge in the loop                                                                                   |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| A        | the top 5 notes of one search | none                                                                                                |
| B        | retrieval loop                | Claude Haiku 5.5                                                                                    |
| C        | retrieval loop                | Jev (TypeSafe's system-one model), alone                                                            |
| C+       | retrieval loop                | Jev, and Haiku re-judges the notes Jev nearly kept, only while no answer note is kept               |
| C before | retrieval loop                | Jev, and Haiku re-judges the notes Jev nearly kept, at every turn (the rule before section 4's fix) |

B is my own LLM loop, built for this comparison, not a product.

**The loop.** Each turn has two parts: the judge scores the candidate notes, then a deterministic policy picks the next action.

- **The judge** gives every candidate note three probabilities: `answer` (the note states the answer), `step` (it leads to the answer) and `none`. In the same call, it also says whether the notes kept so far state the complete answer. Both judges score all the candidate notes of a turn in one call: Haiku writes its verdicts as JSON, Jev gets one multiple-choice question per note and returns a probability for each option.
- **The veto**, with Jev only: the same call asks a second question per note, with all the notes in view, and sets a note to `none` when it is off topic, about another entity, or outdated according to the others.
- **The policy** (`src/loop/policy.ts`, one page) applies the first of six rules that fits:
  1. follow the links of a strong step note;
  2. while the judge rates the kept notes below 0.5 for a complete answer, follow their links;
  3. answer;
  4. if nothing is kept, explore the links of the best-scored notes;
  5. rewrite the query (Haiku);
  6. abstain.

The budgets are 2 hops, 1 rewrite and 5 notes in the final context.

B and C differ only in the judge and its thresholds:

- **B** keeps a note when `answer` or `step` reaches 0.5.
- **C** keeps a note when `answer` + `step` reaches 0.9. In C+ and C before, the notes Jev nearly kept, `answer` + `step` in the **grey zone** [0.8, 0.9), go to Haiku.

A kept note is an **answer note** when its `answer` reaches the answer threshold (0.5 for B, 0.7 for C) or is at least its `step` (`isAnswerNote`). The fix of section 4 turns on this test.

**Checkpoint.** The bench must make A fail where the loop is meant to help. A finds the sources of every simple question but of only 1 of the 15 multi-hop questions (table in section 2).

The bench is weaker elsewhere: A also finds the sources of 11 of 12 temporal questions and all 9 contradictions, and abstains correctly on 11 of 12 no-answer questions. Those three categories test that the loop does no harm; they leave it no room to gain (section 7).

## 2. Result

The headline table is at the top of this report.

**Conclusion.** Replacing the LLM judge with Jev keeps the loop's context completeness and accuracy (C equals B on both) and divides its retrieval latency by 9.5 and its retrieval cost by 2.4. C+ is at least as good as B: its 1.7-answer lead is within the noise (section 5).

### Cost by brick

Per question, in USD, mean of three runs:

| Brick                              |             A |           B |           C |          C+ |    C before |
| ---------------------------------- | ------------: | ----------: | ----------: | ----------: | ----------: |
| Mistral embeddings                 |     0.0000015 |   0.0000017 |   0.0000018 |   0.0000018 |   0.0000018 |
| Judge: Jev                         |               |             |     0.00084 |     0.00084 |     0.00084 |
| Judge: Haiku                       |               |     0.00202 |             |             |             |
| Fallback: Haiku                    |               |             |           0 |     0.00001 |     0.00017 |
| Query rewriter: Haiku              |               |     0.00001 |     0.00001 |     0.00001 |     0.00001 |
| **Retrieval**                      | **0.0000015** | **0.00203** | **0.00085** | **0.00086** | **0.00102** |
| Answerer: Haiku, outside the layer |       0.00037 |     0.00020 |     0.00021 |     0.00021 |     0.00021 |
| **End to end**                     |   **0.00038** | **0.00223** | **0.00106** | **0.00106** | **0.00123** |

The answerer costs more with A because A hands it 5 notes, against about 2 for the loops: 2,784 input tokens against 1,622 to 1,745.

### Latency

|                |      A |       B |      C |     C+ | C before |
| -------------- | -----: | ------: | -----: | -----: | -------: |
| Retrieval p50  | 0.22 s |  6.45 s | 0.68 s | 0.70 s |   2.24 s |
| Retrieval p95  | 1.44 s | 11.51 s | 3.19 s | 3.13 s |   4.65 s |
| End to end p50 | 2.23 s |  8.32 s | 2.52 s | 2.57 s |   3.34 s |

### Where the gap comes from

B and C make about the same number of judge calls: 1.6 and 1.7 per question. One judge call, over all the calls of each config's three runs (`docs/experiments/report-tables.ts`):

| Per judge call      | Haiku (B) |           Jev (C) |
| ------------------- | --------: | ----------------: |
| Latency, median     |    3.44 s |            0.32 s |
| Input tokens, mean  |     8,824 |            11,896 |
| Output tokens, mean |       779 | 1,494, not billed |
| Cost, mean          |  $0.00127 |          $0.00050 |

- **Latency**: a Jev call is about ten times faster. Haiku generates its verdicts as JSON text; Jev returns a probability for each fixed option.
- **Cost**: the gain comes from the price per token, not from fewer tokens. Jev reads more tokens per call, because its request repeats the judge's question and criteria for every note, and adds a veto question per note. But it costs $0.042 per million input tokens with output free (TypeSafe's models page), against $0.10 / $0.50 for Haiku.

### By category

Mean of three runs: complete contexts / answerable questions, then correct answers / questions.

| Config   | Simple        | Multi-hop         | Temporal        | Contradiction | No-answer |
| -------- | ------------- | ----------------- | --------------- | ------------- | --------- |
| A        | 12/12 · 11/12 | 1/15 · 2/15       | 11/12 · 11/12   | 9/9 · 7.7/9   | 11/12     |
| B        | 12/12 · 12/12 | 11/15 · 10.3/15   | 12/12 · 11.3/12 | 6.7/9 · 6.7/9 | 11.3/12   |
| C        | 12/12 · 12/12 | 10.7/15 · 9.3/15  | 12/12 · 12/12   | 7/9 · 7/9     | 11.3/12   |
| C+       | 12/12 · 12/12 | 11.7/15 · 11.3/15 | 12/12 · 12/12   | 7/9 · 6.7/9   | 11.3/12   |
| C before | 12/12 · 12/12 | 11.7/15 · 11/15   | 12/12 · 12/12   | 7/9 · 6.3/9   | 11.3/12   |

Source: `docs/experiments/report-tables.ts`.

Almost all of the loop's gain is multi-hop: B leads A by 9 answers, 8.3 of them multi-hop. On contradictions, the loops lose about one answer to A (section 3).

### Context precision, and why A's is low

**Context precision** is the share of the notes handed to the answerer that are expected sources:

|                                                       |     A |     B |     C |    C+ | C before |
| ----------------------------------------------------- | ----: | ----: | ----: | ----: | -------: |
| Notes in context                                      |     5 |   1.8 |   1.9 |   1.9 |      2.0 |
| Precision, every question with a context (RESULTS.md) | 21.0% | 69.6% | 74.0% | 74.7% |    72.3% |
| Precision, the 48 answerable questions                | 26.3% | 73.9% | 75.5% | 76.2% |    73.8% |

A's precision is low by construction, not because A misses the right note:

- **A always hands over 5 notes**, and an answerable test question has 1 to 3 sources (1.7 on average). Even a complete context scores 20% to 60%, so A's ceiling on the answerable questions is 34.2%, and it reaches 26.3%. The right note is usually among the five, next to three or four others.
- **The no-answer questions weigh on A alone.** A's 21.0% also counts those 12 questions, where every note is off target (0%). The loops hand an empty context when they abstain, so most of these questions drop out of their mean.

## 3. Which layer failed

Every wrong answer is attributed to one layer, from its trace (`src/eval/grade.ts`).

**The retrieval layer** fails when the final context misses a source. The failure type says where the source note was lost:

- `retrieval_miss`: the search never found it;
- `judge_rejected`: the judge scored it and did not keep it;
- `not_followed`: a kept note linked to it, but the link was not opened;
- `context_budget`: it was kept, then cut by the 5-note budget.

**The answer layer** fails when the context holds every source, or the question has none, and the answer is still wrong.

Wrong answers per run of 60 questions, mean of three runs:

| Failure                | Layer     |       A |       B |       C |      C+ | C before |
| ---------------------- | --------- | ------: | ------: | ------: | ------: | -------: |
| `retrieval_miss`       | retrieval |      14 |       0 |       0 |       0 |        0 |
| `judge_rejected`       | retrieval |       0 |     6.3 |       6 |     5.3 |      4.3 |
| `not_followed`         | retrieval |       0 |       0 |       0 |       0 |        1 |
| `context_budget`       | retrieval |       0 |       0 |     0.3 |       0 |        0 |
| `wrong_version`        | answer    |       0 |     0.7 |     0.3 |       0 |      0.3 |
| `missed_contradiction` | answer    |       1 |       0 |       0 |     0.3 |      0.3 |
| `unsupported_claim`    | answer    |       1 |     0.7 |     0.7 |     0.7 |      0.7 |
| `wrong_answer`         | answer    |     1.3 |     0.7 |       1 |     0.3 |      0.7 |
| `false_abstention`     | answer    |       0 |       0 |       0 |       0 |        0 |
| **Retrieval layer**    |           |  **14** | **6.3** | **6.3** | **5.3** |  **5.3** |
| **Answer layer**       |           | **3.3** |   **2** |   **2** | **1.3** |    **2** |

Source: `docs/experiments/report-tables.ts`. The per-run counts are in `docs/results/RESULTS.md`. Execution failures are counted apart: `loop_error` (the loop threw) and `answer_error` (the answerer's call failed) were 0 in all 15 runs.

**What changes between configs is where retrieval fails.** A's search misses a source in 14 wrong answers per run (`retrieval_miss`), 13 of them multi-hop. In the loops, the judge saw nearly every missing source and did not keep it (`judge_rejected`). The answer layer fails 1.3 to 2 times per run in the loops, 3.3 times in A.

**The remaining failures are few, and mostly the same questions in every run:**

- **Supplier contacts** (q-077, q-081, q-085, multi-hop, "Who is Larkspur's contact at the supplier building the … enclosure?") fail in nearly every B and C run. Both answer with the earlier supplier: the tooling sign-off that changed the supplier, and the new supplier's page, never reach the context. This is a limit of the loop, not of either judge.
- **Contradictions between a spec and its diverging copy** (q-102, q-108) fail in every C run. Jev keeps the original spec as an answer note (`answer` 0.96–0.97), and the veto (section 1) removes the copy. B loses its own contradictions instead: q-107 in all three runs, q-102 in two.
- **A customer page left just under the keep threshold** (q-074, multi-hop) fails in all three C runs. The Haiku fallback of C+ rescues it in two of three runs (section 4).
- **Answer layer.** Two cases recur:
  - q-075 ("Which office does the current account owner of Foxborough Unified Schools work from?"): the context is complete, but the answerer reports a conflict where there is none (C in all three runs, B in two).
  - q-115 ("When does Cirrus launch in Japan?"): the vault only gives the general launch date, and the answerer gives it instead of abstaining (in most runs of every config).

**Who abstained.** Mean per run:

| Config   | No-answer: abstained by the loop | No-answer: abstained by the answerer | Answerable: abstained by the loop | Answerable: abstained by the answerer |
| -------- | -------------------------------: | -----------------------------------: | --------------------------------: | ------------------------------------: |
| A        |                                  |                                   11 |                                   |                                    12 |
| B        |                                9 |                                  2.3 |                                 0 |                                   0.7 |
| C        |                               11 |                                  0.3 |                                 0 |                                   1.3 |
| C+       |                               11 |                                  0.3 |                                 0 |                                   0.3 |
| C before |                               11 |                                  0.3 |                                 0 |                                   0.3 |

- **The loops abstain before the answerer is called**: on most no-answer questions the judge keeps no note, so no answer call is paid.
- **No loop abstains on an answerable question**: the few such abstentions come from the answerer, when the context misses the source.
- **A has no loop, so its answerer does all the abstaining**, including on 12 answerable questions, all multi-hop `retrieval_miss`, where it rightly says the notes do not give the answer.

## 4. The fix the traces pointed to

### C's dominant failure: the LLM it was meant to avoid

C's LLM fallback sent a note to Haiku when Jev did not keep it but nearly did: its `answer` + `step` fell in the grey zone [0.8, 0.9). With that rule, C's dominant failure was not a wrong answer but the fallback itself, the LLM call C exists to avoid.

On the tuning split (`runs/2026-10-10T11-29-39-582Z-C-tuning`, commit `a339538`), Haiku re-judged notes in 32 of the 60 questions: 33 calls. The run's median retrieval time was 2.23 s, against 0.66 s for Jev alone (`runs/2026-10-10T12-43-23-494Z-C-tuning`), at equal accuracy (54/60 for both).

Grey-zone notes are rare, 66 of the 1,801 notes Jev judged, but one is enough to trigger a call, and a fallback call takes about 1.7 s (median) against 0.3 s for a Jev call.

Dissecting every fallback call of that run (`docs/experiments/fallback-cases.ts`):

- **31 of the 33 calls** came after Jev had already kept an answer note.
- **Of the 66 notes re-judged**, Haiku confirmed 51 rejections, kept 12 non-source notes and 1 source, and left out 2 sources.

### Three cases

Cases 1 and 2 are two of the 31 calls made after an answer note; case 3 is one of the other 2. For a re-judged note, the trace keeps Haiku's verdict, not Jev's, so Jev's `answer` + `step` is only known to lie in [0.8, 0.9).

**Case 1, q-001 (simple): "What kind of customer is Whitmore Campus Services?"**

|                 |                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jev's verdict   | kept the account page `Customers/Whitmore Campus Services.md` as an answer note (`answer` 0.76 + `step` 0.16 = 0.92), and said the answer is complete (0.78) |
| Rule that fired | fallback: one other note, `Meetings/2026-03-16 Fjord pilot kickoff.md`, sat in the grey zone                                                                 |
| Haiku           | rejected it (`none` 0.70)                                                                                                                                    |
| Outcome         | the policy answered from Jev's note, correctly. The Haiku call took 1,962 ms of the question's 2,718 ms of retrieval, and changed nothing                    |

**Case 2, q-034 (temporal): "What is Hazel Osei's current role?"**

|                 |                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jev's verdict   | kept the all-hands note announcing the new role (`answer` 0.97), and said the answer is complete (0.84)                                                       |
| Rule that fired | fallback: eight notes about the Atlas and Ember projects sat in the grey zone                                                                                 |
| Haiku           | kept all eight as answer notes (`answer` 0.80–0.85), though none of them is a source of the question                                                          |
| Outcome         | correct, with the answer Jev had already found. The call took 2,069 ms of 2,629 ms. Haiku was not a better judge than Jev on these notes; it was a slower one |

**Case 3, q-021 (multi-hop): "Who is the main contact at the customer running the Fjord pilot?"**

|                 |                                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jev's verdict   | kept the pilot kickoff as a step note, but no answer note yet. Jev left the customer page, which names the contact, just under the keep threshold: `answer` 0.75 + `step` 0.12 = 0.87 in the run without fallback |
| Rule that fired | fallback: the customer page sat in the grey zone                                                                                                                                                                  |
| Haiku           | kept the customer page (`answer` 0.90)                                                                                                                                                                            |
| Outcome         | correct. Without fallback (`runs/2026-10-10T12-43-23-494Z-C-tuning`), the context held only the kickoff and the answerer abstained: wrong. This is the call worth paying for                                      |

**Which rule decided badly.** The fallback rule looked at each note alone, grey zone or not, and never asked whether the turn already had its answer. In 31 of the 33 calls it had. In cases 1 and 2 the policy answered from Jev's own answer note, so whatever Haiku said could only add notes to an answer already found. The useful calls, like case 3, come while no answer note is kept.

An earlier rule, fallback only when Jev kept nothing, never fired and lost quality on tuning (section 6). The test that matters is whether an answer note is kept, not whether any note is.

### The fix

The fix is one option, `--fallback-when no-answer`: grey-zone notes go to Haiku only while no answer note is kept, from earlier turns or from Jev's current call, with the test the loop already uses for its context (`isAnswerNote`, section 1). Jev's call, the thresholds and the policy are unchanged.

| Step                                                  | Commit    |
| ----------------------------------------------------- | --------- |
| Spec: `docs/features/system-one-judge.md`, Revision 6 | `a9018d7` |
| Failing tests                                         | `5921097` |
| Implementation                                        | `0ba47d7` |

**Predicted by replay, before any paid run.** Replayed on another tuning run, whose grey zone started at 0.85 (`runs/2026-10-10T12-43-16-465Z-C-tuning`), the new rule keeps 2 of that run's 25 calls and 2 of the 3 sources Haiku rescued there (q-019 and q-021).

**On the tuning split** (`runs/2026-10-10T14-03-44-798Z-C-tuning`):

- 2 calls in 2 of the 60 questions, none after an answer note;
- 4 notes re-judged: 2 sources kept, 2 rejections confirmed;
- retrieval p50 0.80 s, against 2.23 s before.

### Before and after, on the test split

**Result: the fallback is 16 times rarer and retrieval 16% cheaper, at the same quality.** Same commit `c9e4a6e` and same questions: the two configs differ by the option alone. Three runs each, mean [min–max]:

| Config     |  Context complete | Retrieval cost / question | Retrieval latency p50 | Retrieval latency p95 |        Accuracy | Questions with a Haiku fallback |
| ---------- | ----------------: | ------------------------: | --------------------: | --------------------: | --------------: | ------------------------------: |
| C before   | 88.9% [87.5–89.6] |                  $0.00102 |                2.24 s |                4.65 s | 52.7/60 [52–53] |                           28/60 |
| C+ (after) | 88.9% [87.5–89.6] |                  $0.00086 |                0.70 s |                3.13 s | 53.3/60 [52–55] |                          1.7/60 |

By brick, the whole cost difference is the Haiku fallback: $0.00017 per question before, $0.00001 after. Jev ($0.00084), the rewriter ($0.00001) and the answerer outside the layer ($0.00021) cost the same in both.

**By category** (complete contexts · correct answers), no category loses:

| Config   | Simple        | Multi-hop         | Temporal      | Contradiction | No-answer |
| -------- | ------------- | ----------------- | ------------- | ------------- | --------- |
| C before | 12/12 · 12/12 | 11.7/15 · 11/15   | 12/12 · 12/12 | 7/9 · 6.3/9   | 11.3/12   |
| C+       | 12/12 · 12/12 | 11.7/15 · 11.3/15 | 12/12 · 12/12 | 7/9 · 6.7/9   | 11.3/12   |

**The same dissection on the test runs** (`docs/experiments/fallback-cases.ts`):

|                                              | C before, three runs | C+, three runs |
| -------------------------------------------- | -------------------: | -------------: |
| Haiku calls                                  |                   87 |              5 |
| Calls made after Jev had kept an answer note |                   83 |              0 |
| Notes re-judged                              |                  179 |              7 |
| Rejections confirmed                         |                  155 |              2 |
| Non-source notes kept                        |                   14 |              0 |
| Sources kept                                 |                    7 |              5 |
| Sources left out                             |                    3 |              0 |

### Is the fallback worth keeping at all?

Against C, the same loop without any fallback, C+ has 88.9% complete contexts against 86.8%, and 53.3/60 against 51.7/60, for $0.00001 and 0.02 s more per question. The accuracy ranges overlap, so the gain is within the noise, but it has a visible source: C misses q-074, whose customer page Jev leaves just under the threshold, in all three runs, and C+ rescues it in two. The fallback is worth keeping as cheap insurance, not as a proven accuracy gain.

## 5. Can the numbers be trusted

**Three runs per config, at the same commit.** Every table gives the mean, and [min–max] when the runs differ.

Accuracy moves by up to 3 answers between runs of the same config (C: 50 to 53; C+: 52 to 55). There are two sources of noise:

- Haiku accepts no temperature setting, in any of its four roles (judge, fallback, rewriter, answerer).
- Jev is not deterministic either. In the three C runs, the first turn judged the same 1,629 notes for the same 60 questions. Between two runs, 93 to 101 of those verdicts moved by more than 0.05, and 8 to 11 keep decisions flipped (`docs/experiments/jev-determinism.ts`).

**No conclusion from a gap below the noise.**

- C+ leads B and C by 1.7 answers each: both gaps are inside the spread, so the report says "C+ is at least as good as B", not "better".
- The gaps the report does claim are far above the spread, and their ranges do not overlap:
  - retrieval latency: B 5.93–6.81 s, C 0.63–0.73 s;
  - retrieval cost: B $0.00201–0.00205, C $0.00085;
  - A against the loops on multi-hop: 2/15 against 8 to 12/15.

**The grader is code, checked by hand.** Answers are graded without a model (`src/eval/grade.ts`): the answer's status (answered, conflict or abstained) and value are matched against the expected values of the truth file, at word and number boundaries, and an outdated value makes the answer wrong.

I checked its verdicts by hand on 20 answers from the final runs, drawn with a fixed seed: 4 per config, 10 graded correct and 10 wrong, all five categories. I agreed with all 20 (`docs/results/grader-check.md`). On 20 answers, that only shows agreement with a human above 83% (95% Clopper-Pearson lower bound), not 100%.

**Every figure is tied to a commit.**

- The test figures come from commit `c9e4a6e`, and `docs/results/RESULTS.md` lists the 15 run folders behind them.
- The tuning figures of sections 4 and 6 name their run, and the run's settings line records its commit.
- `RESULTS.md` is generated from the traces (`bun scripts/results-table.ts`), never edited by hand.

**The tuning split flatters every loop.** B answers 57/60 on tuning at commit `a339538`, against 51.7/60 on test. That gap is expected from choosing thresholds and fixes on the tuning split, and it is why only test figures are claimed.

## 6. How C got there, on the tuning split

Each row is a change a trace pointed to, named with its spec revision and measured by one tuning run before and after; some rows bundle several changes in one commit. With single runs, a 2-answer gap is noise.

| What the trace showed                                                                                                                     | Change                                                                                                                                                        | Config, commits         | Context complete |     Precision |   Accuracy | Questions with a fallback |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------: | ------------: | ---------: | ------------------------: |
| B dropped the notes it marked `step` (0.7–0.8): account handoffs, pilot kickoffs. Multi-hop context complete: 0/15                        | keep step notes (decision-policy, Revision 3)                                                                                                                 | B `341aac8` → `81e06ef` |    64.6% → 83.3% | 81.5% → 65.0% | 44 → 52/60 |                           |
| Judged alone, the page holding a multi-hop answer never names the account of the question: Jev `none` 0.73–0.95                           | one Jev call per turn, all notes in one call (system-one-judge, Revision 2)                                                                                   | C `e1da4b3` → `c97c6ad` |    72.9% → 83.3% | 23.2% → 46.5% | 46 → 50/60 |                   54 → 50 |
| Jev split a useful note between `answer` and `step` (q-013: 0.53 and 0.44): neither reached 0.7                                           | keep on `answer` + `step` ≥ 0.9 (decision-policy, Revision 4)                                                                                                 | C `c97c6ad` → `db31145` |    83.3% → 87.5% | 46.5% → 51.2% | 50 → 52/60 |                   50 → 47 |
| Step notes were opened after the answer was found (28 of 43 first turns). A note about another entity looked like an answer (q-016, 0.93) | open steps only above the best answer, keep only linked steps, veto from the notes taken together (decision-policy, Revision 5; system-one-judge, Revision 4) | C `db31145` → `ce00e69` |    87.5% → 85.4% | 51.2% → 68.6% | 52 → 52/60 |                   47 → 31 |
| The note naming the person was kept but never opened, so the person's page stayed unjudged (q-013, q-023, q-026)                          | the judge says whether the answer is complete; the policy opens the kept notes while it is not (decision-policy, Revision 6)                                  | C `ce00e69` → `a339538` |    85.4% → 89.6% | 68.6% → 71.0% | 52 → 54/60 |                   31 → 32 |
| The Haiku fallback ran in half the questions, mostly after the answer was found (section 4)                                               | fallback only while no answer note is kept (system-one-judge, Revision 6)                                                                                     | C `a339538` → `0ba47d7` |    89.6% → 93.8% | 71.0% → 72.0% | 54 → 57/60 |                    32 → 2 |

### What did not work

**The judge's verdicts were cut off by its own thinking.**

- **Symptom**: the first B run on the tuning split (`runs/_superseded/2026-10-09T14-37-20-166Z-B-tuning`, commit `bbe74a3`) lost 18 of its 60 questions to `loop_error`, all with "Anthropic output truncated (stop_reason max_tokens)", and answered 30/60.
- **Cause**: Haiku 5.5 thinks adaptively even at effort `low`, and its thinking tokens count against `max_tokens`, so the JSON verdicts were cut off.
- **Fix**: every Anthropic call now gets 4,096 tokens of headroom on top of its visible budget (answerer spec, AC7; commit `341aac8`). The next run had no loop error and answered 44/60.
- **Why it matters**: a harness failure, not a model failure, and visible as one only because the failure taxonomy counts loop errors apart from wrong answers.

**The planned judge: scoring links from their sentence.**

- **Design**: the initial plan asked the judge four closed questions per turn: a relevance score per chunk, then sufficiency, what is missing, and a score per link from the sentence around it.
- **Trial**: a first trial on Clef-flash, a system-one model served locally with Jev's API (`docs/experiments/trial.ts`, `notes.ts`), showed that a judge recognises a note holding the answer, but not a note that leads to it. A link scored from its title and sentence is a bet on a note the judge cannot see.
- **Change**: the judge now gives one verdict per whole note, and following a link means judging the target note itself (llm-judge spec, Revision 2).
- **Second dead end**: judged one at a time, the page holding a multi-hop answer got `none` 0.73–0.95 from Jev (row 2 of the table above). With all the notes of the turn in one call, the same pages got `answer` 0.61–0.94, with a third fewer input tokens (`docs/experiments/batched.ts`), and one call per turn became the design.

**Two tries at taming the fallback before the fix of section 4.**

| Attempt | Run                                      | Rule                                                                                         | What happened                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `runs/2026-10-09T17-38-44-205Z-C-tuning` | a note went to Haiku when its highest probability fell between 0.6 and Jev's keep thresholds | Haiku judged 196 of the 1,816 notes again, in 50 of the 60 questions. It kept 19, 3 of them sources: about 30% of C's cost and 1.8 s per question for those 3 notes. The zone then moved onto `answer` + `step`, just below the keep threshold: the grey zone of section 4 |
| 2       | `runs/2026-10-09T19-07-57-804Z-C-tuning` | the fallback ran only when Jev kept nothing                                                  | it never ran (0/60 questions). Jev keeps at least one note in almost every turn, so this was in effect "no fallback"                                                                                                                                                       |

The second attempt was tested against the grey-zone rule at the same commit (`runs/2026-10-09T19-07-56-479Z-C-tuning`):

| Rule                       | Questions with a fallback | End-to-end p50 | Context complete | Accuracy |
| -------------------------- | ------------------------: | -------------: | ---------------: | -------: |
| grey zone                  |                     47/60 |         4.15 s |            87.5% |    52/60 |
| only when Jev kept nothing |                      0/60 |         2.49 s |            81.3% |    49/60 |

Latency fell, but so did quality: at that stage, C still needed some of Haiku's rescues.

**Questions on the notes taken together, instead of one verdict per note.**

- **Tried**, against q-016, where the former account owner's page looked like an answer (row 4 of the table): two questions on all the notes at once (`docs/experiments/v1v2.ts`):
  - the same question asked about each note in the light of the others;
  - a single choice of the note that states the answer.
- **Result**: each fixed q-016, and each alone lost the contradictions: 2/9 and 0/9 kept, because Jev keeps only one of two diverging notes.
- **Kept**: the two questions together, used only as a veto over the per-note verdicts. In the first-turn replay, this raised precision from 0.63 to 0.67 with all 9 contradictions kept (system-one-judge spec, Revision 4).
- **On the test split**, the risk the replay had ruled out came back: the veto costs C q-102 and q-108 (section 3).

The full path is in the spec revisions of `docs/features/` and in `docs/experiments/README.md`.

## 7. Limits and next steps

**What the project does not show:**

- **Scope**:
  - It stops at retrieval: no agent planning or execution.
  - No agent memory: nothing is written, and no state is kept between questions.
  - No permissions: one user, one vault.
- **Traces and corpus**:
  - The traces come from evals on a synthetic corpus, not from production traffic.
  - For a note re-judged by Haiku, the trace keeps Haiku's verdict, not Jev's (section 4).
  - The corpus is small: 202 notes, where the initial plan called for 1,000 to 2,000 for the final measures. Jev's input per call is bounded by the 50 candidate chunks, not by the size of the vault, but a larger vault would put more distractors among them.
  - Short Markdown notes only, no PDFs or spreadsheets: the loop moves between notes through their links, not inside long documents.
- **Bench**:
  - The corpus, its questions and the expected answers come from one generator.
  - The notes were written by Claude models, the family of the LLM under test.
  - Simple RAG is near the ceiling on temporal, contradiction and no-answer questions (section 1), so almost all of the measured gain is multi-hop.
  - 60 test questions: one question moves accuracy by 1.7 points.
- **Models and prices**:
  - One LLM, Claude Haiku 5.5, serves as B's judge, C's fallback, the rewriter and the answerer. A stronger LLM judge might raise B.
  - Haiku's probabilities are self-reported in its JSON, since the API exposes no log-probabilities. Jev's are the model's own.
  - C's cost advantage rests on the list prices of section 2; its latency advantage does not.
  - Embeddings come from the Mistral API, so indexing is not local.
- **Baseline**: config A has no reranker (next step 3).

**Next steps, in the order the traces suggest them:**

1. **A later note one link away.** For the supplier-contact failures shared by B and C (section 3; also q-018 and q-027 on tuning): when a kept answer note records a decision, opening its links to notes dated after it would let a superseding note be judged. It would change both configs, not the comparison (`IDEAS.md`).
2. **A veto that spares contradictions.** C's veto removes one of two diverging copies (q-102, q-108, section 3). Its rule could exempt a note whose own verdict is a strong answer.
3. **A′: a system-one filter without the loop.** Simple RAG with Jev's relevance scores but no hops would separate the gain of the judge from the gain of the loop. It would also answer the objection that a reranker would close the gap.
4. **Scale and an external check.** Rerun A, B and C on a 1,000 to 2,000-note vault, and on a slice of a public enterprise bench, to show the result does not depend on a corpus built here.

## 8. Reproduce

The commands below need `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` and `TYPESAFE_API_KEY` in `.env` (see `.env.example`). Each run writes its traces to its own folder under `runs/`; the published figures run each `eval` three times.

```sh
bun install
bun src/cli.ts index corpus/dev/vault
bun src/cli.ts eval --config A --split test
bun src/cli.ts eval --config B --split test
bun src/cli.ts eval --config C --split test --fallback none                # C
bun src/cli.ts eval --config C --split test --fallback-when no-answer      # C+
bun src/cli.ts eval --config C --split test                                # C before (grey zone from 0.8, every turn)
bun scripts/results-table.ts                                               # regenerates docs/results/RESULTS.md
```

`--dry-run` prints an upper bound of a run's cost without any judge or LLM call. The scripts of `docs/experiments/` recompute the figures of this report that `RESULTS.md` does not give, from the same run folders, without any model call.
