# Retrieval loop

Phase 3. The agentic retrieval of configs B and C: start from the hybrid search, let the judge score and assess, let the decision policy choose, and follow links or search again until the policy answers or abstains. The loop returns a context packet and the full trace of its turns.

## Acceptance criteria

`runLoop(question, deps)` with `deps = { retrieve, index, judge, rewriter, policy, candidates }` returns `{ context, outcome, steps, calls, hops, rewrites }`.

- **AC1 — first turn**: the loop retrieves `candidates` chunks (default 50) for the question, dates them from their notes, asks `judge.relevance` on them and keeps those whose probability is ≥ the relevance threshold.
- **AC2 — assessment**: after each change of the kept chunks, the loop lists the visible links — the outgoing links of the notes of the kept chunks whose target note is not in the context and has not been followed — asks `judge.assess` with the kept chunks (best first, at most the chunk budget) and those links, then calls `decide` with the state and the policy.
- **AC3 — follow a link**: on `follow`, the loop loads the chunks of the target note from the index, asks `judge.relevance` on them, keeps the relevant ones, marks the target as followed even when nothing was kept, counts one hop, and assesses again.
- **AC4 — search again**: on `rewrite`, the loop asks the rewriter for a new query, retrieves `candidates` chunks for it, drops the chunks already judged, asks `judge.relevance` on the others, keeps the relevant ones, counts one rewrite, and assesses again; the next decision knows that a rewrite just happened.
- **AC5 — end**: on `answer`, the context is the kept chunks sorted by relevance (ties by rank of first retrieval), cut to the chunk budget, each with note path, note date, heading and text; on `abstain`, the context is empty. `outcome` is the final action.
- **AC6 — kept chunks**: a chunk judged twice keeps its highest probability; the kept set has no duplicates.
- **AC7 — trace**: `steps` holds one entry per turn: its kind (`search`, `follow`, `rewrite`), the query or link, the ids of the chunks judged with their probabilities, the ids kept, the assessment and the action with its rule. `calls` holds every model call in order (embeddings, judge, rewriter).
- **AC8 — termination**: the loop always ends: the policy's budgets bound hops and rewrites, and the loop stops with `answer-best-effort` semantics if it ever reaches more assessments than hops plus rewrites plus one.
- **AC9 — rewriters**: `CodeRewriter` builds a query from the question plus up to 6 terms taken from the kept chunks (capitalized words and phrases absent from the question, by frequency), with no model call; `LLMRewriter` asks the `LLM` for one reformulated query given the question, the kept chunks' headings and the judge's `missing` choice, and returns its call.

## Revision 2 — after the phase-3 review

- **AC10 — failures keep their cost**: when the judge or the rewriter throws, `runLoop` throws a `LoopError` carrying the original error's message, every call made so far (including the billed call the original error carries, if any) and the steps completed so far.
- **AC11 — no assessment of an empty context**: when no chunk is kept, the loop does not call `judge.assess`; the step records the assessment `{ sufficient: 0, missing: topic_not_found with probability 1, links: {} }` with `skipped: true`, and the policy then searches again or abstains as before. (This supersedes the "one assessment per turn" reading of AC2 for empty contexts.)
- **AC12 — visible links in the trace**: each step also records the visible links it assessed: id, target path, label and the judge's probability.

## Technical plan

Files:

- `src/loop/loop.ts` (new): `runLoop`, `LoopDeps`, `LoopResult`, `LoopStep`. `retrieve` has the shape of `HybridRetriever.retrieve`; `index` needs `chunksOf`, `getNote` and `outgoingLinks` from `src/index/read.ts`; the policy comes from `src/loop/policy.ts`; the context chunk type is `ContextChunk` from `src/answer/answerer.ts`.
- `src/loop/rewriter.ts` (new): `Rewriter` interface (`kind`, `rewrite(question, kept, missing)` → `{ query, calls }`), `CodeRewriter`, `LLMRewriter`.
- No new dependency.

## Test strategy

Unit tests in `src/loop/loop.test.ts` with fakes for every dependency (retriever returning scripted chunks per query, an in-memory index of notes, chunks and links, a judge with scripted probabilities, a recording rewriter) and the real `decide`: each path (answer at once, one hop then answer, rewrite then answer, abstain), budgets, kept-chunk merging, context order and cut, trace contents and call order, termination. Unit tests in `src/loop/rewriter.test.ts` for both rewriters (fake `LLM` for the second). No network.
