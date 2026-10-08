# LLM judge

Phase 3. The judge of config B: Claude Haiku 5.5 answers the closed questions of the loop with probabilities. Two calls per turn, as for the system-one judge of config C: one scores the relevance of the candidate chunks, one assesses the kept context (sufficient? what is missing? which link may hold it?). The Anthropic API exposes no token probabilities, so the probabilities are stated by the model; this is a limit of config B to report.

## Acceptance criteria

- **AC1 — interface**: `LLMJudge` implements `Judge` (`src/core/judge.ts`) on top of an `LLM` (`completeJson`). The chunks a judge receives carry their note date (`DatedChunk`: `Chunk` plus `noteDate: string | null`).
- **AC2 — relevance**: `relevance(question, chunks)` makes one `completeJson` call whose prompt holds the question and every chunk with its id, note path, note date, heading and text, and asks, for each chunk id, the probability that the chunk helps answer the question. It returns `{ chunks, calls }`: a probability for every input chunk id (0 for an id the model left out; ids the model invented are ignored; values clamped to [0, 1]) and the call. With no chunk, it makes no call and returns empty results.
- **AC3 — assess**: `assess(question, chunks, links)` makes one `completeJson` call whose prompt holds the question, the chunks (as in AC2) and every visible link with its id, the title of its target note and its label (the sentence around the link). It asks for the probability that the chunks are enough to answer, a probability for each of the four `missing` values, and, for each link, the probability that its target holds what is missing, judged from the label and the title only. It returns an `Assessment`: `sufficient` clamped to [0, 1]; `missing.probabilities` normalized to sum to 1 (uniform when all are 0) and `missing.choice` the most probable value, ties going to the first in `MISSING` order; a probability for every input link id (0 when left out); and the call.
- **AC4 — prompts**: both prompts are fixed system prompts that define each probability, ask for calibrated estimates rather than certainties, and tell the model to use only the given text. The `missing` values are explained: `detail_in_linked_note` (the answer is likely in a note one link away), `newer_version` (the context may be outdated: a later note may change it), `topic_not_found` (nothing on the topic was found), `unidentified`.
- **AC5 — budget**: each call sets `maxTokens` from the number of items it scores, and the judge passes the `LLM`'s errors through unchanged (they carry the billed call).

## Technical plan

Files:

- `src/core/types.ts` (modified): `DatedChunk`.
- `src/core/judge.ts` (modified): `Judge` methods take `DatedChunk[]`.
- `src/judge/llm-judge.ts` (new): `class LLMJudge implements Judge`, constructor `(llm: LLM)`, Zod schemas of the two outputs, the two system prompts as constants.
- No new dependency.

## Test strategy

Unit tests in `src/judge/llm-judge.test.ts` with a fake `LLM` that records the requests and returns scripted values: prompt contents, output mapping (missing and invented ids, clamping, normalization, argmax and ties), no call on empty input, budgets, error propagation. No network.
