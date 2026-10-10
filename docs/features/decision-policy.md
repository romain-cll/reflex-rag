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

## Revision 3 — step notes are kept

The config B run on the tuning split at commit 341aac8 (`runs/2026-10-09T15-14-56-163Z-B-tuning`: multi-hop context complete 0/15, 12 `judge_rejected`) showed the judge marking the intermediate notes of multi-hop questions as `step` (0.7–0.8: account handoffs, pilot kickoffs, tooling sign-offs) and the loop dropping them whenever the answer note was found by the search rather than through their links. This revision supersedes the definition of a kept note: a note is **kept** when its `answer` probability is ≥ the answer threshold **or** its `step` probability is ≥ the step threshold. The rules and their order are unchanged; AC2 thus answers as soon as a step note is kept and no rule before it applies.

## Revision 4 — a keep threshold on answer + step

In config C's run at commit c97c6ad (`runs/2026-10-09T17-38-44-205Z-C-tuning`), 8 multi-hop questions lost their intermediate note although Jev found it useful: it split its probability between `answer` and `step` (q-013: 0.53 and 0.44; q-023: 0.48 and 0.47), so that neither reached 0.7 while their sum exceeded 0.95. A replay of that trace with "keep when answer + step ≥ 0.9" raised context completeness from 40/48 to 41/48 (multi-hop 7/15 to 8/15) and precision from 0.46 to 0.54. This revision extends AC6 and the definition of a kept note.

- **AC8 — keep threshold**: `thresholds.keep` is optional. When it is set, a note is kept when `answer + step ≥ keep`, and the answer and step thresholds keep their other uses (`follow-steps` and the context order); when it is unset, the definition of Revision 3 applies. `isKept(verdict, config)` follows this. `POLICIES.C` sets `keep: 0.9`; `DEFAULT_POLICY` and `POLICIES.B` leave it unset.

## Revision 5 — open a step only when it is the stronger lead

A replay of the first turn of every tuning question (Jev, `runs/2026-10-09T19-07-56-479Z-C-tuning`) found an answer note (answer ≥ 0.7) in 43 questions, 28 of which also had a step note ≥ 0.7 whose links the policy opened although the answer was already found. A step note serves to find the answer while none is found, and to justify it once found.

- **AC9 — strategy**: `PolicyConfig.strategy` is optional: `{ openSteps?: "always" | "above-best-answer"; contextSteps?: "all" | "linked" }`, defaults `"always"` and `"all"` (the behaviour so far). With `openSteps: "above-best-answer"`, `follow-steps` opens only the openable notes whose `step` is ≥ the step threshold **and** greater than the highest `answer` probability among the judged notes. `contextSteps` is used by the loop (docs/features/retrieval-loop.md, AC16). `POLICIES.B` and `POLICIES.C` set `{ openSteps: "above-best-answer", contextSteps: "linked" }`; `DEFAULT_POLICY` leaves `strategy` unset.

## Revision 6 — open the kept notes while the answer is incomplete

In C's run at commit ce00e69 (`runs/2026-10-09T22-06-41-730Z-C-tuning`), 3 multi-hop questions (q-013, q-023, q-026) lost the note holding the answer: Jev judged the intermediate note (an account handoff naming a person) `answer` 0.60–0.68 and `step` 0.27–0.32, the policy kept it, but `follow-steps` did not open it, its `step` being below the best `answer`; the person's page stayed in the frontier. The judge now also says whether the notes of its call, taken together, state the complete answer (docs/features/llm-judge.md, Revision 4; docs/features/system-one-judge.md, Revision 5), in the same call.

- **AC10 — sufficiency in the state**: `LoopState` gains `sufficient?: number`, the probability the last judgement reporting one gave that the notes state the complete answer.
- **AC11 — `follow-kept`**: a rule between `follow-steps` and `answer`. It applies when `thresholds.sufficient` is set, `state.sufficient` is defined and below it, hops remain and some kept note is openable; the action `expand` carries the openable kept notes, ranked by decreasing `answer` + `step` (ties by order of judgement), at most the explore budget. `RULES` becomes `follow-steps`, `follow-kept`, `answer`, `explore`, `rewrite`, `abstain`.
- **AC12 — configuration**: `thresholds.sufficient` is optional; `POLICIES.B` and `POLICIES.C` set it to 0.5; `DEFAULT_POLICY` leaves it unset.

## Revision 7 — answer notes, shared

- **AC13 — `isAnswerNote(verdict, config)`**: exported by `src/loop/policy.ts`: the note is kept (`isKept`) and its `answer` probability is ≥ the answer threshold or ≥ its `step` probability (docs/features/retrieval-loop.md, AC17). The loop's context assembly and config C's fallback use it.

## Technical plan

Files:

- `src/loop/policy.ts` (rewritten): `PolicyConfig { thresholds: { answer; step }; budgets: { maxHops; maxRewrites; explore; maxNotes } }`, `DEFAULT_POLICY`, `JudgedNote { path; verdict: Record<Verdict, number>; expanded; hasUnjudgedLinks }`, `LoopState { notes: JudgedNote[]; hops; rewrites }`, `Action` (a union of `expand` with `paths`, `answer`, `rewrite`, `abstain`, each with `rule`), `RULES` (the five rule ids), `decide`.
- Uses `Verdict` from `src/core/judge.ts`.
- No new dependency.

## Test strategy

Unit tests in `src/loop/policy.test.ts` on hand-built states: each rule alone; the priority between rules (a step note is opened even when a note is kept; a kept note answers before `explore`); which notes `follow-steps` and `explore` pick, their order and ties, the explore budget, expanded notes and notes without unjudged links skipped; budgets (no hop left, no rewrite left); boundary values at each threshold (≥ applies); the default configuration and purity. No model, no I/O.
