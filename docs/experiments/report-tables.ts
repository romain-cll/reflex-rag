// The figures of REPORT.md that RESULTS.md does not give directly, from the 15
// final runs on the test split (three per config): per-category means, failures
// by layer, who abstained, context precision on answerable questions only and
// config A's precision ceiling, fallback calls, and the context handed to the
// answerer. Means over the three runs of a config. No model call.
import { readdirSync, readFileSync } from "node:fs"
const ROOT = "/Users/romain/projects/reflex-rag"
const qs: any[] = (JSON.parse(readFileSync(`${ROOT}/evals/dev/questions.json`, "utf8")) as any).questions
const byId = new Map(qs.map((q) => [q.id, q]))
const runs = readdirSync(`${ROOT}/runs`).filter((n) => /^2026-10-10T1[5-6].*-test$/.test(n)).sort()
const labelOf = (settings: any) => {
  if (settings.config !== "C") return settings.config
  const { fallbackLow, fallbackWhen } = settings.loop
  return fallbackLow === null ? "C" : fallbackWhen === "no-answer" ? "C+" : "C before"
}
const LABELS = ["A", "B", "C", "C+", "C before"]
const CATEGORIES = ["simple", "multi_hop", "temporal", "contradiction", "no_answer"]
const groups = new Map<string, { settings: any; records: any[] }[]>()
for (const name of runs) {
  const [first, ...lines] = readFileSync(`${ROOT}/runs/${name}/trace.jsonl`, "utf8").trim().split("\n")
  const settings = JSON.parse(first!)
  const label = labelOf(settings)
  groups.set(label, [...(groups.get(label) ?? []), { settings, records: lines.map((l) => JSON.parse(l)) }])
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const r1 = (x: number) => (Math.round(x * 10) / 10).toString()
const pct = (x: number) => `${(100 * x).toFixed(1)}%`
const perRun = (label: string, f: (records: any[]) => number) => mean(groups.get(label)!.map((g) => f(g.records)))
const range = (label: string, f: (records: any[]) => number) => {
  const xs = groups.get(label)!.map((g) => f(g.records))
  const [lo, hi] = [Math.min(...xs), Math.max(...xs)]
  return lo === hi ? r1(lo) : `${r1(mean(xs))} [${lo}–${hi}]`
}
const answerable = (rs: any[]) => rs.filter((r) => r.category !== "no_answer")
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n")

console.log("## Per category: context complete and accuracy (mean of 3 runs, count / questions)\n")
const n = (cat: string) => qs.filter((q) => q.split === "test" && q.category === cat).length
console.log(
  table(
    ["config", ...CATEGORIES.flatMap((c) => [`${c} complete`, `${c} accuracy`])],
    LABELS.map((label) => [
      label,
      ...CATEGORIES.flatMap((cat) => {
        const inCat = (rs: any[]) => rs.filter((r) => r.category === cat)
        const complete = cat === "no_answer" ? "-" : `${range(label, (rs) => inCat(rs).filter((r) => r.contextComplete).length)}/${n(cat)}`
        return [complete, `${range(label, (rs) => inCat(rs).filter((r) => r.grade.correct).length)}/${n(cat)}`]
      }),
    ])
  )
)

console.log("\n## Failures by layer (mean per run of 60 questions)\n")
const FAILURES = ["retrieval_miss", "judge_rejected", "not_followed", "context_budget", "wrong_version", "missed_contradiction", "unsupported_claim", "wrong_answer", "false_abstention"]
console.log(
  table(
    ["failure", ...LABELS],
    [
      ...FAILURES.map((f) => [f, ...LABELS.map((label) => r1(perRun(label, (rs) => rs.filter((r) => r.grade.failure === f).length)))]),
      ["retrieval layer", ...LABELS.map((label) => r1(perRun(label, (rs) => rs.filter((r) => !r.grade.correct && r.contextComplete === false).length)))],
      ["answer layer (context complete or no source)", ...LABELS.map((label) => r1(perRun(label, (rs) => rs.filter((r) => !r.grade.correct && r.contextComplete !== false).length)))],
    ]
  )
)

console.log("\n## Who abstained (mean per run)\n")
const byLoop = (r: any) => r.loop?.outcome?.type === "abstain"
const byAnswerer = (r: any) => !byLoop(r) && r.output?.status === "abstained"
const noAnswer = (rs: any[]) => rs.filter((r) => r.category === "no_answer")
console.log(
  table(
    ["config", "no-answer questions right /12", "no-answer: abstained by the loop", "no-answer: abstained by the answerer", "answerable: abstained by the loop", "answerable: abstained by the answerer"],
    LABELS.map((label) => [
      label,
      r1(perRun(label, (rs) => noAnswer(rs).filter((r) => r.grade.correct).length)),
      r1(perRun(label, (rs) => noAnswer(rs).filter(byLoop).length)),
      r1(perRun(label, (rs) => noAnswer(rs).filter(byAnswerer).length)),
      r1(perRun(label, (rs) => answerable(rs).filter(byLoop).length)),
      r1(perRun(label, (rs) => answerable(rs).filter(byAnswerer).length)),
    ])
  )
)

console.log("\n## Context handed to the answerer (mean per question)\n")
const ceiling = (rs: any[]) =>
  mean(answerable(rs).filter((r) => r.notesInContext > 0).map((r) => Math.min(new Set(byId.get(r.id).sourceGroups.flat()).size, r.notesInContext) / r.notesInContext))
console.log(
  table(
    ["config", "notes in context", "answerer input tokens", "precision, all questions with a context", "precision, answerable questions", "precision ceiling for that many notes"],
    LABELS.map((label) => [
      label,
      r1(perRun(label, (rs) => mean(rs.map((r) => r.notesInContext)))),
      Math.round(perRun(label, (rs) => mean(rs.flatMap((r) => r.calls.filter((c: any) => c.role === "answer").map((c: any) => c.inputTokens))))).toString(),
      pct(perRun(label, (rs) => mean(rs.filter((r) => r.precision !== null).map((r) => r.precision)))),
      pct(perRun(label, (rs) => mean(answerable(rs).filter((r) => r.precision !== null).map((r) => r.precision)))),
      pct(perRun(label, ceiling)),
    ])
  )
)

console.log("\n## Judge and fallback calls (mean per question)\n")
const calls = (rs: any[], role: string) => mean(rs.map((r) => r.calls.filter((c: any) => c.role === role).length))
console.log(
  table(
    ["config", "judge calls", "Haiku fallback calls", "questions with a fallback /60", "hops", "rewrites"],
    LABELS.map((label) => [
      label,
      r1(perRun(label, (rs) => calls(rs, "judge")) * 100 / 100),
      perRun(label, (rs) => calls(rs, "fallback")).toFixed(3),
      r1(perRun(label, (rs) => rs.filter((r) => (r.loop?.fallback ?? []).length > 0).length)),
      perRun(label, (rs) => mean(rs.map((r) => r.loop?.hops ?? 0))).toFixed(2),
      perRun(label, (rs) => mean(rs.map((r) => r.loop?.rewrites ?? 0))).toFixed(2),
    ])
  )
)
