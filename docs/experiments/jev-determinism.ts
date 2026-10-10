// Is Jev deterministic? Compares the first turn of the three runs of C without
// fallback on the test split (same commit, same questions): when a question's
// first search judged the same notes in two runs, how many verdicts moved, how
// many keep decisions flipped, and how many sufficiency values moved. Without
// fallback, every first-turn verdict is Jev's. No model call.
import { readFileSync } from "node:fs"
import { isKept, POLICIES } from "/Users/romain/projects/reflex-rag/src/loop/policy.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const RUNS = ["2026-10-10T15-36-34-920Z-C-test", "2026-10-10T15-50-30-055Z-C-test", "2026-10-10T16-02-22-269Z-C-test"]
const firstTurns = RUNS.map(
  (dir) =>
    new Map(
      readFileSync(`${ROOT}/runs/${dir}/trace.jsonl`, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => JSON.parse(l))
        .filter((r) => r.loop?.steps?.length > 0)
        .map((r) => [r.id, r.loop.steps[0]])
    )
)
for (let i = 0; i < RUNS.length; i++)
  for (let j = i + 1; j < RUNS.length; j++) {
    let questions = 0, verdicts = 0, moved = 0, flipped = 0, sufficiency = 0, sufficiencyMoved = 0
    for (const [id, a] of firstTurns[i]!) {
      const b = firstTurns[j]!.get(id)
      if (!b) continue
      const paths = Object.keys(a.judged)
      if (paths.length !== Object.keys(b.judged).length || !paths.every((p) => p in b.judged)) continue
      questions++
      for (const p of paths) {
        const [va, vb] = [a.judged[p], b.judged[p]]
        verdicts++
        if (["answer", "step", "none"].some((k) => Math.abs(va[k] - vb[k]) > 0.05)) moved++
        if (isKept(va, POLICIES.C) !== isKept(vb, POLICIES.C)) flipped++
      }
      if (a.sufficient !== undefined && b.sufficient !== undefined) {
        sufficiency++
        if (Math.abs(a.sufficient - b.sufficient) > 0.05) sufficiencyMoved++
      }
    }
    console.log(
      `${RUNS[i]!.slice(0, 19)} vs ${RUNS[j]!.slice(0, 19)}: ${questions} questions with the same first-turn notes; ${moved}/${verdicts} verdicts moved by more than 0.05, ${flipped} keep decisions flipped; ${sufficiencyMoved}/${sufficiency} sufficiency values moved by more than 0.05`
    )
  }
