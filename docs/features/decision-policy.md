# Decision policy

Phase 3. The deterministic rules that turn the judge's probabilities into the next action of the retrieval loop: answer, follow a link, search again or abstain. Pure code, no model: the thresholds and budgets are configuration, traced with every run, and every action names the rule that fired. Configs B and C share it; only the judge differs.

## Acceptance criteria

`decide(state, config)` returns an action `{ type, rule, … }`. The state holds the latest `Assessment` of the judge (`sufficient` probability, `missing` choice with its probabilities, a probability per visible link id), the visible links, the paths of the notes already in the context, the number of relevant chunks kept so far, and the hops and rewrites already used. Rules are tried in this order; the first that applies wins:

- **AC1 — `sufficient`**: when `sufficient` ≥ the sufficiency threshold, answer.
- **AC2 — `follow-link`**: when hops remain, follow the visible link with the highest probability among those whose target note is not in the context yet, if that probability ≥ the link threshold. Ties go to the smallest link id. The action carries the link and its probability.
- **AC3 — `rewrite-topic-not-found`**: when the judge's `missing` choice is `topic_not_found` and rewrites remain, search again.
- **AC4 — `rewrite-nothing-relevant`**: when no relevant chunk has been kept and rewrites remain, search again.
- **AC5 — `abstain-nothing-relevant`**: when no relevant chunk has been kept and no rewrite remains, abstain.
- **AC6 — `answer-best-effort`**: otherwise (no promising link or hops used up, no search to try, some relevant chunks), answer with what was found.
- **AC7 — configuration**: `DEFAULT_POLICY` holds the thresholds (relevance 0.5, sufficiency 0.7, link 0.5) and budgets (3 hops, 1 rewrite, 12 context chunks). The relevance threshold and the chunk budget are used by the loop, not by `decide`; they live in the same configuration so that a run traces one object.
- **AC8 — purity**: `decide` reads only its arguments, changes neither of them, and returns the same action for the same inputs.

## Technical plan

Files:

- `src/loop/policy.ts` (new): `PolicyConfig { thresholds: { relevance; sufficient; link }; budgets: { maxHops; maxRewrites; maxChunks } }`, `DEFAULT_POLICY`, `LoopState`, `Action` (a union of `answer`, `follow` with `link` and `probability`, `rewrite`, `abstain`, each with `rule`), `RULES` (the six rule ids), `decide`.
- Uses `Assessment` and `MISSING` from `src/core/judge.ts` and `Link` from `src/core/types.ts`.
- No new dependency.

## Test strategy

Unit tests in `src/loop/policy.test.ts` on hand-built states: each rule alone, the priority between rules (a sufficient context with a promising link answers; a promising link wins over `topic_not_found`; visited targets are skipped; ties), budgets (no hop left, no rewrite left), boundary values at each threshold (≥ applies), the default configuration and purity. No model, no I/O.
