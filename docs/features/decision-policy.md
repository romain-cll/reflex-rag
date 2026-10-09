# Decision policy

Phase 3. The deterministic rules that turn the judge's verdicts into the next action of the retrieval loop: follow the links of some notes, answer, search again or abstain. Pure code, no model: the thresholds and budgets are configuration, traced with every run, and every action names the rule that fired. Configs B and C share it; only the judge and the thresholds differ.

## Revision 2 — notes and verdicts

The policy of the first version read a per-turn assessment (sufficient, missing, a probability per link). The judge now gives each note a verdict distribution (`answer`, `step`, `none`, see docs/features/llm-judge.md), so the policy reads the judged notes instead. This revision replaces every criterion of the first version.

## Acceptance criteria

`decide(state, config)` returns an action `{ type, rule, … }`. The state holds every note judged so far, in order of first judgement, each with its path, its verdict probabilities, whether its links were already opened (`expanded`) and whether it links to a note not judged yet (`hasUnjudgedLinks`), plus the hops and rewrites already used. A note is **kept** when its `answer` probability is ≥ the answer threshold. A note is **openable** when it is not expanded and has unjudged links. Rules are tried in this order; the first that applies wins:

- **AC1 — `follow-steps`**: when hops remain and some openable note has a `step` probability ≥ the step threshold, open all such notes: the action `expand` carries their paths, by decreasing `step` probability (ties by order of judgement).
- **AC2 — `answer`**: when at least one note is kept, answer.
- **AC3 — `explore`**: when no note is kept and hops remain, open the best openable notes, at most the explore budget, ranked by decreasing `answer` + `step` probability (ties by order of judgement): the action `expand` carries their paths. The rule does not apply when no note is openable.
- **AC4 — `rewrite`**: when no note is kept and rewrites remain, search again.
- **AC5 — `abstain`**: otherwise (no note kept, no hop or no openable note, no rewrite left), abstain.
- **AC6 — configuration**: `DEFAULT_POLICY` holds the thresholds (answer 0.5, step 0.5) and budgets (2 hops, 1 rewrite, 3 notes opened by `explore`, 5 notes in the context). The context budget is used by the loop, not by `decide`; it lives in the same configuration so that a run traces one object. The defaults are config B's starting point; config C gets its own thresholds, chosen on the tuning split.
- **AC7 — purity**: `decide` reads only its arguments, changes neither of them, and returns the same action for the same inputs.

## Technical plan

Files:

- `src/loop/policy.ts` (rewritten): `PolicyConfig { thresholds: { answer; step }; budgets: { maxHops; maxRewrites; explore; maxNotes } }`, `DEFAULT_POLICY`, `JudgedNote { path; verdict: Record<Verdict, number>; expanded; hasUnjudgedLinks }`, `LoopState { notes: JudgedNote[]; hops; rewrites }`, `Action` (a union of `expand` with `paths`, `answer`, `rewrite`, `abstain`, each with `rule`), `RULES` (the five rule ids), `decide`.
- Uses `Verdict` from `src/core/judge.ts`.
- No new dependency.

## Test strategy

Unit tests in `src/loop/policy.test.ts` on hand-built states: each rule alone; the priority between rules (a step note is opened even when a note is kept; a kept note answers before `explore`); which notes `follow-steps` and `explore` pick, their order and ties, the explore budget, expanded notes and notes without unjudged links skipped; budgets (no hop left, no rewrite left); boundary values at each threshold (≥ applies); the default configuration and purity. No model, no I/O.
