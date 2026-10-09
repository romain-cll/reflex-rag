# Retrieval loop

Phase 3. The agentic retrieval of configs B and C: start from the hybrid search, let the judge classify the notes found, let the decision policy choose, and open the links of some notes or search again until the policy answers or abstains. The loop returns the notes that make the context and the full trace of its turns.

## Revision 2 — notes, not chunks

The unit is now the note: the hybrid search finds chunks, the loop turns them into notes, the judge classifies whole notes (docs/features/llm-judge.md) and opening a link means judging its target note. A note reached through a link keeps a trace of the note it came from, so that a multi-hop answer comes with its path. This revision replaces every criterion of the first version.

## Acceptance criteria

`runLoop(question, deps)` with `deps = { retrieve, index, judge, rewriter, policy, candidates }` returns `{ context, outcome, steps, calls, hops, rewrites, judged, kept, frontier }`.

- **AC1 — search**: the loop retrieves `candidates` chunks (default 50) for the query and lists their notes in order of first appearance, skipping notes already judged. Each note is sent to `judge.judge` as a `NoteForJudge`: its path, its date, its text (its chunks in order, each section's heading as a `## ` line before its text, the preamble without heading) and the distinct paths it links to. All the notes of a turn go in one `judge.judge` call.
- **AC2 — decide**: after each turn, the loop calls `decide` with every judged note (verdicts, `expanded`, `hasUnjudgedLinks` from the index's outgoing links), the hops and the rewrites.
- **AC3 — expand**: on `expand`, the loop marks the given notes as expanded, collects the targets of their outgoing links that were never judged (each target once; its parent is the first given note that links to it), judges them in one call, and counts one hop.
- **AC4 — rewrite**: on `rewrite`, the loop gives the rewriter the question and the 5 best judged notes (by decreasing `answer` + `step` probability, ties by order of judgement), searches again with the query it returns (AC1), and counts one rewrite.
- **AC5 — answer**: on `answer`, the context is built from the kept notes (`answer` probability ≥ the threshold), by decreasing `answer` probability (ties by order of judgement); each kept note is followed by its ancestors through the parent links (parent, then the parent's parent…) that are not in the context yet; the list is cut to the policy's note budget. Each context item is a `ContextChunk` with the note path, the note date, an empty heading and the note text of AC1. On `abstain`, the context is empty. `outcome` is the final action.
- **AC6 — result fields**: `judged` maps every judged note to its verdict probabilities; `kept` lists the kept notes and their ancestors before the cut, in context order; `frontier` lists the targets of the outgoing links of judged notes that were never judged.
- **AC7 — trace**: `steps` holds one entry per turn: its kind (`search`, `expand`, `rewrite`), the query or the expanded paths, the verdict probabilities of the notes judged this turn, the parent of each note reached by a link, the notes kept this turn, and the action with its rule. `calls` holds every model call in order (embeddings, judge, rewriter).
- **AC8 — termination**: the loop always ends: each `expand` uses a hop and each `rewrite` a rewrite, within the policy's budgets; if it ever reaches more turns than 1 + hops budget + rewrites budget, it stops, answering when a note is kept and abstaining otherwise.
- **AC9 — failures keep their cost**: when the judge or the rewriter throws, `runLoop` throws a `LoopError` carrying the original error's message, every call made so far (including the billed call the original error carries, if any) and the steps completed so far.
- **AC10 — rewriters**: `Rewriter.rewrite(question, notes)` takes the best notes (path and text). `CodeRewriter` builds a query from the question plus up to 6 terms taken from the notes' texts (capitalized words and phrases absent from the question, by frequency, ties by order of appearance), with no model call. `LLMRewriter` asks the `LLM` for one new query given the question and the paths of the notes found so far, none of which answered, and returns its call.

## Technical plan

Files:

- `src/loop/loop.ts` (rewritten): `runLoop`, `LoopDeps`, `LoopResult`, `LoopStep`, `LoopError`. `retrieve` has the shape of `HybridRetriever.retrieve`; `index` needs `chunksOf`, `getNote` and `outgoingLinks` from `src/index/read.ts`; the policy comes from `src/loop/policy.ts`; the context item type is `ContextChunk` from `src/answer/answerer.ts`. A helper `noteText(index, path)` builds the note text of AC1 and is exported for config A.
- `src/loop/rewriter.ts` (modified): the `Rewriter` signature of AC10.
- No new dependency.

## Test strategy

Unit tests in `src/loop/loop.test.ts` with fakes for every dependency (a retriever returning scripted chunks per query, an in-memory index of notes, chunks and links, a judge with scripted verdicts per note that records its calls, a recording rewriter) and the real `decide`: each path (answer at once, follow a step then answer with the path in the context, explore then answer, rewrite then answer, abstain); notes deduplicated across turns; the note text sent to the judge; parents and ancestors; context order and cut; `judged`, `kept`, `frontier`; trace contents and call order; budgets and termination; `LoopError` with calls and steps. Unit tests in `src/loop/rewriter.test.ts` for both rewriters (fake `LLM` for the second). No network.
