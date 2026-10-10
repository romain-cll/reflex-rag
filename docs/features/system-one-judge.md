# System-one judge and LLM fallback

Phase 4. The judge of config C: the system-one model answers, for each note, the same closed question as config B's LLM judge (`JUDGE_QUESTION`, docs/features/llm-judge.md); when it hesitates on a note, the LLM judge decides that note instead. Config C differs from B only by this judge and by its thresholds.

## Acceptance criteria

- **AC1 — one call per note**: `SystemOneJudge(systemOne, { concurrency })` implements `Judge`. For each note it makes one `decide` call with `state = { question, note: { path, date, links, text } }` and one question `verdict: { type: "choice", instructions: JUDGE_QUESTION.instructions, criteria: JUDGE_QUESTION.criteria }`. Batching notes into one state mixed them up in the Clef-flash trial; one call per note is the system-one way of asking. With no note, it makes no call.
- **AC2 — mapping**: each note gets the `probabilities` of its answer for `answer`, `step` and `none`, clamped to [0, 1] and normalized to sum to 1; a missing option counts 0; all zero gives `{ answer: 0, step: 0, none: 1 }`. `calls` lists the calls in the order of the notes, each tagged `role: "judge"`.
- **AC3 — concurrency**: at most `concurrency` calls are in flight (default 16; Jev allows 80 requests per second); the result does not depend on the order in which calls complete.
- **AC4 — errors keep their cost**: when a call fails, the judge waits for the other calls of the batch, then throws an error carrying `calls`, the calls that completed.
- **AC5 — fallback**: `FallbackJudge(primary, fallback, { threshold })` implements `Judge`. It judges every note with `primary`; a note whose highest verdict probability is below `threshold` is **uncertain**; all uncertain notes are judged again by `fallback` in one `judge` call, and their verdicts replace the primary ones. With no uncertain note, `fallback` is not called.
- **AC6 — what the fallback reports**: the `Judgement` gains optional fields, set by `FallbackJudge`: `fallback`, the paths judged again (in input order), and `stages: { judgeMs, fallbackMs }`, the wall-clock time of the primary phase and of the fallback phase (0 without fallback). `calls` holds the primary calls, then the fallback calls tagged `role: "fallback"`. An error of the fallback judge propagates carrying `calls`: the primary calls, plus the fallback's billed call when its error carries one.

## Revision 2 — one call per batch, with context

The first config C run on the tuning split (`runs/2026-10-09T16-35-14-158Z-C-tuning`, per-note calls) lost the multi-hop questions: judged alone, the note holding the answer (a person's page) never mentions the account of the question, and Jev classified it `none` (0.73–0.95). A replay on Jev with all the notes of a turn in one state (`/v1/systemone` evaluates every question against the whole shared state) classified those notes `answer` (0.61–0.94), with a third fewer input tokens and one call per turn; its probabilities are less clear-cut, so config C needs higher thresholds and a narrower fallback. This revision supersedes AC1, AC3, AC5 and AC6 where they differ.

- **AC7 — one call per batch**: `SystemOneJudge(systemOne, { maxNotesPerCall })` makes one `decide` call for the notes it receives, split into batches of at most `maxNotesPerCall` (default 40, to stay well under Jev's 64K-token request limit), the batches running in parallel. The state is `{ question, context: { k1: note, … }, notes: { n1: note, … } }` (each note `{ path, date, links, text }`; `context` omitted when empty), with one question per note to score: `nK: { type: "choice", instructions: "About note nK of the state only. " + JUDGE_QUESTION.instructions, criteria: JUDGE_QUESTION.criteria }`. Context notes (AC8 of docs/features/llm-judge.md) are in the state but get no question. The mapping of AC2 applies to each note's answer; `calls` lists one call per batch, in batch order, tagged `role: "judge"`. A failed batch makes the judge throw, after the other batches end, an error carrying the completed calls (AC4).
- **AC8 — fallback on a grey zone**: `FallbackJudge(primary, fallback, { low, isKept })` judges the notes with `primary`; a note is **uncertain** when `isKept(verdict)` is false and `max(answer, step) ≥ low` — Jev nearly kept it. The uncertain notes are judged by `fallback` in one call, with as context the call's context plus the notes `primary` kept; their verdicts replace the primary ones. `fallback`, `stages`, call order and roles are as in AC6. Config C passes `isKept` from its policy (docs/features/decision-policy.md, Revision 3), so that the grey zone sits just below the keep thresholds.

## Revision 3 — when the fallback runs

In the same run, Haiku judged again 196 of the 1,816 notes Jev judged, in 50 of the 60 questions, and kept 19 of them, of which 3 were sources; in 42 of the 51 turns with a fallback, Jev had already kept a note with `answer` ≥ 0.7. The fallback cost about 30% of config C's cost and 1.8 s per question for those 3 notes.

- **AC9 — grey zone on the keep score**: a note is uncertain when it is not kept and its keep score is ≥ `low`, the keep score being `answer + step` when the policy has a keep threshold, `max(answer, step)` otherwise; `FallbackJudge` takes it as an option `score(verdict)`.
- **AC10 — fallback scope**: `FallbackJudge` takes `when: "uncertain" | "nothing-kept"` (default `"uncertain"`, AC8). With `"nothing-kept"`, the uncertain notes are judged again only when the call's context is empty and the primary kept none of the call's notes: the LLM is asked only when the system one has nothing sure yet.

## Revision 4 — a veto from the notes taken together

Judged one by one, a note about another entity than the question's can look like an answer (q-016: the former account owner's page, answer 0.93). Asked in the same call, a question taking the other notes into account rejected it (none 0.73), and a single choice among the notes picked the current owner (0.79 against 0.01). Each alone lost the contradiction questions (2/9 and 0/9: Jev keeps one of two diverging notes); used together as a veto on the per-note verdicts, they raised precision from 0.63 to 0.67 with all 9 contradictions kept (replay of the first turn).

- **AC11 — generic wording**: the `step` criterion of `JUDGE_QUESTION` becomes "The note does not state the answer, but it identifies something the answer depends on, or it links to a note likely to hold the answer." (both judges).
- **AC12 — veto questions**: `src/judge/question.ts` exports `JUDGE_CROSS_QUESTION` — `instructions(alias)`: "Read all the notes in the state. Taking into account what the other notes say, what does note <alias> give for answering the question?"; `criteria(alias)`: answer "Note <alias> states the answer, and no other note shows that this information is outdated or superseded.", step "Note <alias> does not state the answer, but it identifies something the answer depends on, or links to a note likely to hold it.", none "Note <alias> does not help: it is off topic, about another entity than the one the question asks about, or outdated according to other notes." — and `JUDGE_BEST_QUESTION`: "According to all the notes, which note states the answer to the question as it stands?".
- **AC13 — veto**: `SystemOneJudge` takes an optional `veto: { none, best }`. When set, each batch call also holds, for each scored note `nK`, a question `xK` (choice, `JUDGE_CROSS_QUESTION` for `nK`) and one question `best` (choice whose options are the batch's aliases, each described "Note nK", plus `none`: "No note states the answer."). A note is **vetoed** when its `xK` probability of `none` is ≥ `veto.none` and its `best` probability is < `veto.best`: its verdict becomes `{ answer: 0, step: 0, none: 1 }`. The `Judgement` gains `vetoed`, the vetoed paths in input order. Without `veto`, the call is unchanged. Config C uses `{ none: 0.7, best: 0.02 }`.

## Revision 5 — is the answer complete?

- **AC14 — sufficiency**: `SystemOneJudge` takes an option `sufficiency: boolean` (default `false`). When set, each batch call also holds a question `sufficient: { type: "noul", instructions: JUDGE_SUFFICIENT_QUESTION }` (docs/features/llm-judge.md, AC9). The `Judgement` gains `sufficient`, the highest `noul` among the batches, clamped to [0, 1]; a batch whose answer is missing or not a `noul` is ignored; with no valid answer, `sufficient` is absent. Without the option, the call is unchanged.
- **AC15 — through the fallback**: `FallbackJudge` returns the primary's `sufficient` when it has one, with or without a fallback call.

## Revision 6 — the fallback only while no answer is found

The fallback sweep on the tuning split showed the LLM fallback mostly asked about notes Jev had rightly left out, after the answer was found. With the grey zone from 0.85 (`runs/2026-10-10T12-43-16-465Z-C-tuning`), Haiku judged again 42 of the 1,779 notes, in 25 of the 60 questions: it confirmed the rejection of 30, kept 9 notes that are not sources, and kept 3 sources (q-019, q-020, q-021); in 23 of its 25 calls, Jev had already kept an answer note. From 0.8 (`runs/2026-10-10T11-29-39-582Z-C-tuning`): 66 notes in 32 questions, 51 rejections confirmed, 12 non-sources kept, 1 source kept and 2 rejected; 31 of its 33 calls came after an answer note. Rare per note, the fallback is frequent per question, and its time is paid per call: about 1.5 s for a Haiku call against 0.3 s for a Jev call; the questions with a fallback took 2.2 s (median), C without fallback 0.69 s (`runs/2026-10-10T12-43-23-494Z-C-tuning`). Replayed on these traces, calling the fallback only while no answer note is kept leaves 2 of the 25 calls and 2 of the 3 rescues (q-019, q-021).

- **AC16 — verdicts of the context**: a context note may carry the `verdict` it was kept with (`ContextNote = NoteForJudge & { verdict?: Record<Verdict, number> }` in `src/core/judge.ts`; `Judge.judge` takes `context?: ContextNote[]`). The judges show the model the note as before, never the verdict.
- **AC17 — scope `no-answer`**: `FallbackJudge` takes `when: "no-answer"`, with an option `isAnswer(verdict)`. The uncertain notes are judged again only when no context note has a verdict for which `isAnswer` is true and no note the primary kept in this call has one; a context note without `verdict` does not count as an answer. With another scope, `isAnswer` is not used.

## Technical plan

- `src/core/judge.ts` (modified): optional `fallback` and `stages` on `Judgement`.
- `src/core/types.ts` (modified): `ModelCall.role` becomes `"embed" | "judge" | "fallback" | "rewrite" | "answer"`.
- `src/judge/system-one-judge.ts` (new): `SystemOneJudge`.
- `src/judge/fallback-judge.ts` (new): `FallbackJudge`.
- Uses `SystemOne` (docs/features/system-one-client.md) and `JUDGE_QUESTION`. No new dependency.

## Test strategy

Unit tests in `src/judge/system-one-judge.test.ts` (a fake `SystemOne` recording its requests, with scripted answers and delays: state and question contents, mapping, normalization, concurrency limit, completion order, errors with completed calls) and `src/judge/fallback-judge.test.ts` (fake primary and fallback judges: threshold boundary — a highest probability equal to the threshold is not uncertain —, only uncertain notes sent, one fallback call, merge, `fallback` list, call order and roles, stages measured, no fallback call when none is uncertain, error propagation with the primary calls). No network.
