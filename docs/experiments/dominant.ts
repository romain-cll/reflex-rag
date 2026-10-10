// Replays the context assembly of B's and C's last tuning runs with the
// kept notes classified by their dominant verdict (answer note when answer >=
// step), or with every kept note that is not an answer note counted as a step
// note, or with only the answer notes classified by their dominant verdict,
// instead of the answer and step thresholds. No model call.
import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import { contextMeasuresOf } from "/Users/romain/projects/reflex-rag/src/eval/grade.ts"
import { isKept, POLICIES } from "/Users/romain/projects/reflex-rag/src/loop/policy.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const qs: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
const links = (path: string) => [...new Set(index.outgoingLinks(path).map((l) => l.targetPath))]
type V = { answer: number; step: number; none: number }
const ranked = <T,>(xs: T[], s: (x: T) => number) => [...xs].sort((a, b) => s(b) - s(a))

type Rule = "threshold" | "dominant" | "rest-as-steps" | "answer-dominant"
function context(rec: any, config: "B" | "C", rule: Rule): string[] {
  const policy = POLICIES[config]
  const parents: Record<string, string> = Object.assign({}, ...rec.loop.steps.map((s: any) => s.parents))
  const judged: [string, V][] = Object.entries(rec.loop.judged)
  const kept = judged.filter(([, v]) => isKept(v, policy))
  // rest-as-steps: the answer notes as before, every other kept note as a step note.
  // answer-dominant: a kept note is an answer note when answer >= step; step notes keep their threshold.
  const isAnswer = ([, v]: [string, V]) =>
    rule === "dominant" || rule === "answer-dominant" ? v.answer >= v.step : v.answer >= policy.thresholds.answer
  const isStep = (e: [string, V]) =>
    rule === "dominant" ? e[1].step > e[1].answer : rule === "rest-as-steps" ? !isAnswer(e) : e[1].step >= policy.thresholds.step
  const answers = ranked(kept.filter(isAnswer), ([, v]) => v.answer)
  const steps = ranked(kept.filter(isStep), ([, v]) => v.step)
  const paths = new Set<string>()
  for (const [path] of answers) {
    let p: string | undefined = path
    while (p !== undefined && !paths.has(p)) { paths.add(p); p = parents[p] }
    for (const [s] of steps) if (links(s).includes(path)) paths.add(s)
  }
  if (answers.length === 0) for (const [p] of ranked(kept, ([, v]) => v.step)) paths.add(p)
  return [...paths].slice(0, policy.budgets.maxNotes)
}

for (const [config, dir] of [["B", "2026-10-09T22-06-45-376Z-B-tuning"], ["C", "2026-10-09T22-06-41-730Z-C-tuning"]] as const) {
  const recs = (await Bun.file(`${ROOT}/runs/${dir}/trace.jsonl`).text()).trim().split("\n").slice(1).map((l) => JSON.parse(l))
  for (const rule of ["threshold", "dominant", "rest-as-steps", "answer-dominant"] as const) {
    let complete = 0, withSources = 0, precision = 0, nonEmpty = 0
    const changed: string[] = []
    for (const rec of recs) {
      const q = qs.find((x) => x.id === rec.id)
      const notes = rec.loop?.outcome.type === "answer" ? context(rec, config, rule) : []
      const m = contextMeasuresOf(q, notes)
      if (m.contextComplete !== null) { withSources++; if (m.contextComplete) complete++ }
      if (m.precision !== null) { nonEmpty++; precision += m.precision }
      if (rule !== "threshold" && m.contextComplete !== null && m.contextComplete !== contextMeasuresOf(q, context(rec, config, "threshold")).contextComplete) changed.push(`${rec.id} ${m.contextComplete ? "+" : "-"}`)
    }
    console.log(`${config} ${rule}: complete ${complete}/${withSources}, precision ${(precision / nonEmpty).toFixed(3)}${rule !== "threshold" ? `, changed: ${changed.join(", ") || "none"}` : ""}`)
  }
}
