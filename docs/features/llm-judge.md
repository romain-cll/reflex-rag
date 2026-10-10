# LLM judge

Phase 3. The judge of config B: Claude Haiku 5.5 classifies whole notes for a question, with one closed question shared with the system-one judge of config C, so that the two configs differ only by the model that answers it.

## Revision 2 — one question per note

The first version made two calls per turn: a relevance score per chunk, then an assessment of the kept chunks (sufficient? what is missing? which link to follow?). A trial of Clef-flash on the dev vault (2026-10-09) showed that a judge recognises a note that holds the answer, but not a note that is a step toward it, and that a link probability judged from a title and a sentence is a bet on a note the judge cannot see. The unit is now the note (the vault's notes are short: 255 tokens on average, 570 at most), the judge answers one `choice` question per note, and following a link means judging the target note itself. This revision replaces every criterion of the first version.

## Acceptance criteria

- **AC1 — interface**: `Judge` (`src/core/judge.ts`) has one method, `judge(question, notes)`, where each note is a `NoteForJudge { path, date, text, links }`: `text` is the whole note body, `links` the paths of the notes it links to. It returns `{ notes, calls }`: for every input note path, a probability for each verdict of `VERDICTS = ["answer", "step", "none"]`, summing to 1.
- **AC2 — the shared question**: `src/judge/question.ts` exports `JUDGE_QUESTION`, the instructions and the description of each verdict, used word for word by every judge:
  - instructions: "A question is asked about a company's internal note vault, and answering it may need several notes read one after the other. What does this note give for answering the question?"
  - `answer`: "The note states the answer to the question, or a part of it."
  - `step`: "The note does not state the answer, but it leads to it: it names the person, supplier, customer, meeting or decision the question depends on, or it links to a note that likely holds the answer."
  - `none`: "The note does not help answer the question."
- **AC3 — one call per batch**: `LLMJudge.judge` makes one `completeJson` call for all the notes it receives. The system prompt holds the instructions and the three verdict descriptions of `JUDGE_QUESTION`, asks for the probability of each verdict for every note, calibrated rather than certain, judged only from the given text. The user prompt holds the question, then each note under a short alias `n1`, `n2`… in input order, with its path, its date when it has one, the paths it links to, and its text.
- **AC4 — output mapping**: the model answers `{ notes: [{ id, answer, step, none }] }` with the aliases. The judge maps the aliases back to the note paths, ignores unknown aliases, clamps every value to [0, 1] and normalizes each note's three values to sum to 1; a note the model left out, or whose three values are all 0, gets `{ answer: 0, step: 0, none: 1 }`.
- **AC5 — budget and errors**: `maxTokens` is a fixed base plus 48 tokens per note (Haiku's structured output measured 32–34 tokens per `{ id, probability }` entry in the first version; an entry now holds three values). With no note, the judge makes no call and returns empty results. The `LLM`'s errors pass through unchanged (they carry the billed call).

The Anthropic API exposes no token probabilities: config B's probabilities are stated by the model, a limit to report.

## Revision 3 — notes already kept, as context

A turn that opens links judges only the link targets; a note judged alone may look off topic although a note already kept explains why it matters (an account handoff naming the person whose page holds the answer). The judge now receives the kept notes as context. This revision extends AC1 and AC3.

- **AC8 — context**: `judge(question, notes, context?)` takes optional `context` notes (`NoteForJudge[]`), shown to the model but not scored: the result holds verdicts for `notes` only. `LLMJudge` lists them in the user prompt before the notes to score, under a heading saying that they were already kept and must not be scored, each with its path, date, links and text and without an alias. With no note to score, no call is made, whatever the context.

## Revision 4 — is the answer complete?

The policy needs to know whether the notes found so far state the whole answer or only point to it (docs/features/decision-policy.md, Revision 6), in the same call.

- **AC9 — the shared question**: `src/judge/question.ts` exports `JUDGE_SUFFICIENT_QUESTION`: "Taken together, do all the notes given, context notes included, state the complete answer to the question, with nothing left to look up in another note?"
- **AC10 — option**: `new LLMJudge(llm, { sufficiency: true })`. The system prompt then adds a paragraph asking for `sufficient`, the probability from 0 to 1 of a yes to `JUDGE_SUFFICIENT_QUESTION` word for word; the output schema gains a required number `sufficient`; `maxTokens` gains 16. The `Judgement` gains `sufficient`, the value clamped to [0, 1]. Without the option (default), the prompt, the schema, the budget and the result are unchanged.

## Technical plan

Files:

- `src/core/judge.ts` (rewritten): `VERDICTS`, `Verdict`, `NoteForJudge`, `Judgement { notes: Record<string, Record<Verdict, number>>; calls }`, `Judge`. `Relevance`, `Assessment` and `MISSING` are removed.
- `src/core/types.ts` (modified): `DatedChunk` is removed.
- `src/judge/question.ts` (new): `JUDGE_QUESTION`.
- `src/judge/llm-judge.ts` (rewritten): `class LLMJudge implements Judge`, constructor `(llm: LLM)`.
- No new dependency.

## Test strategy

Unit tests in `src/judge/llm-judge.test.ts` with a fake `LLM` that records the requests and returns scripted values: the system prompt holds `JUDGE_QUESTION` word for word; the user prompt holds the question and each note's alias, path, date, links and text; alias mapping, unknown and missing aliases, clamping, normalization, the all-zero case, no call on empty input, the token budget, error propagation. No network.
