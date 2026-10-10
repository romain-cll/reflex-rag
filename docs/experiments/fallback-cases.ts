// Dissects the LLM fallback calls of config C runs: for each turn where Haiku
// judged notes again, whether Jev had already kept an answer note, which notes
// Haiku judged, its verdicts, whether they are sources, and the time the
// fallback took. The trace keeps the verdict that replaced Jev's, not Jev's own:
// a note judged again had Jev's answer + step in the grey zone [low, keep).
// Usage: bun docs/experiments/fallback-cases.ts <run folder>... [--cases]
// No model call.
import { readFileSync } from "node:fs"
import { isAnswerNote, isKept, POLICIES } from "/Users/romain/projects/reflex-rag/src/loop/policy.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const qs: any[] = (JSON.parse(readFileSync(`${ROOT}/evals/dev/questions.json`, "utf8")) as any).questions
const byId = new Map(qs.map((q) => [q.id, q]))
const args = process.argv.slice(2)
const showCases = args.includes("--cases")
const C = POLICIES.C
const fmt = (v: any) => `answer ${v.answer.toFixed(2)}, step ${v.step.toFixed(2)}, none ${v.none.toFixed(2)}`

for (const dir of args.filter((a) => !a.startsWith("--"))) {
  const [, ...lines] = readFileSync(`${ROOT}/runs/${dir}/trace.jsonl`, "utf8").trim().split("\n")
  const records = lines.map((l) => JSON.parse(l))
  let calls = 0, afterAnswer = 0, notes = 0, confirmed = 0, nonSourcesKept = 0, sourcesKept = 0, sourcesRejected = 0
  const questions = new Set<string>()
  const cases: string[] = []
  for (const r of records) {
    if (!r.loop) continue
    const sources = new Set<string>(byId.get(r.id).sources)
    const context: [string, any][] = []
    r.loop.steps.forEach((step: any, turn: number) => {
      const rejudged = new Set<string>(step.fallback ?? [])
      const primaryKept = (step.kept as string[]).filter((p) => !rejudged.has(p))
      if (rejudged.size > 0) {
        calls++
        questions.add(r.id)
        const answers = [...context, ...primaryKept.map((p) => [p, step.judged[p]] as [string, any])].filter(([, v]) => isAnswerNote(v, C))
        if (answers.length > 0) afterAnswer++
        const lines: string[] = []
        for (const path of rejudged) {
          notes++
          const v = step.judged[path]
          const kept = isKept(v, C)
          const source = sources.has(path)
          if (!kept && !source) confirmed++
          if (kept && !source) nonSourcesKept++
          if (kept && source) sourcesKept++
          if (!kept && source) sourcesRejected++
          lines.push(`    - ${path}: Haiku ${fmt(v)} → ${kept ? "kept" : "not kept"}${source ? " (source)" : ""}`)
        }
        const best = answers.sort((a, b) => b[1].answer - a[1].answer)[0]
        cases.push(
          [
            `${r.id} (${r.category}) turn ${turn + 1}, ${r.grade.correct ? "correct" : `wrong: ${r.grade.failure}`}, fallback ${Math.round(r.stages.fallbackMs)} ms of ${Math.round(r.retrievalMs)} ms retrieval`,
            `  answer note already kept: ${best ? `${best[0]} (${fmt(best[1])})` : "none"}; sufficient ${step.sufficient ?? "-"}; action ${step.action.type} (${step.action.rule})`,
            ...lines,
          ].join("\n")
        )
      }
      for (const p of step.kept as string[]) context.push([p, step.judged[p]])
    })
  }
  console.log(`${dir}: ${calls} fallback calls in ${questions.size}/${records.length} questions, ${afterAnswer} after an answer note was kept; ${notes} notes judged again: ${confirmed} rejections confirmed, ${nonSourcesKept} non-sources kept, ${sourcesKept} sources kept, ${sourcesRejected} sources not kept`)
  if (showCases) console.log(cases.join("\n"))
}
