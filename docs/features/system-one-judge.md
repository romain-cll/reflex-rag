# System-one judge and LLM fallback

Phase 4. The judge of config C: the system-one model answers, for each note, the same closed question as config B's LLM judge (`JUDGE_QUESTION`, docs/features/llm-judge.md); when it hesitates on a note, the LLM judge decides that note instead. Config C differs from B only by this judge and by its thresholds.

## Acceptance criteria

- **AC1 — one call per note**: `SystemOneJudge(systemOne, { concurrency })` implements `Judge`. For each note it makes one `decide` call with `state = { question, note: { path, date, links, text } }` and one question `verdict: { type: "choice", instructions: JUDGE_QUESTION.instructions, criteria: JUDGE_QUESTION.criteria }`. Batching notes into one state mixed them up in the Clef-flash trial; one call per note is the system-one way of asking. With no note, it makes no call.
- **AC2 — mapping**: each note gets the `probabilities` of its answer for `answer`, `step` and `none`, clamped to [0, 1] and normalized to sum to 1; a missing option counts 0; all zero gives `{ answer: 0, step: 0, none: 1 }`. `calls` lists the calls in the order of the notes, each tagged `role: "judge"`.
- **AC3 — concurrency**: at most `concurrency` calls are in flight (default 16; Jev allows 80 requests per second); the result does not depend on the order in which calls complete.
- **AC4 — errors keep their cost**: when a call fails, the judge waits for the other calls of the batch, then throws an error carrying `calls`, the calls that completed.
- **AC5 — fallback**: `FallbackJudge(primary, fallback, { threshold })` implements `Judge`. It judges every note with `primary`; a note whose highest verdict probability is below `threshold` is **uncertain**; all uncertain notes are judged again by `fallback` in one `judge` call, and their verdicts replace the primary ones. With no uncertain note, `fallback` is not called.
- **AC6 — what the fallback reports**: the `Judgement` gains optional fields, set by `FallbackJudge`: `fallback`, the paths judged again (in input order), and `stages: { judgeMs, fallbackMs }`, the wall-clock time of the primary phase and of the fallback phase (0 without fallback). `calls` holds the primary calls, then the fallback calls tagged `role: "fallback"`. An error of the fallback judge propagates carrying `calls`: the primary calls, plus the fallback's billed call when its error carries one.

## Technical plan

- `src/core/judge.ts` (modified): optional `fallback` and `stages` on `Judgement`.
- `src/core/types.ts` (modified): `ModelCall.role` becomes `"embed" | "judge" | "fallback" | "rewrite" | "answer"`.
- `src/judge/system-one-judge.ts` (new): `SystemOneJudge`.
- `src/judge/fallback-judge.ts` (new): `FallbackJudge`.
- Uses `SystemOne` (docs/features/system-one-client.md) and `JUDGE_QUESTION`. No new dependency.

## Test strategy

Unit tests in `src/judge/system-one-judge.test.ts` (a fake `SystemOne` recording its requests, with scripted answers and delays: state and question contents, mapping, normalization, concurrency limit, completion order, errors with completed calls) and `src/judge/fallback-judge.test.ts` (fake primary and fallback judges: threshold boundary — a highest probability equal to the threshold is not uncertain —, only uncertain notes sent, one fallback call, merge, `fallback` list, call order and roles, stages measured, no fallback call when none is uncertain, error propagation with the primary calls). No network.
