// Draws the 20 answers of the grader check from the final runs on the test
// split and writes docs/results/grader-check.md, for Romain to label by hand.
// Four answers per config (A, B, C, C+, C before the fallback fix): two the
// grader marked correct, two it marked wrong when the config has them, the
// categories spread across the sample. Seeded: the same runs give the same
// sample. No model call.
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
const ROOT = "/Users/romain/projects/reflex-rag"
const qs: any[] = (JSON.parse(readFileSync(`${ROOT}/evals/dev/questions.json`, "utf8")) as any).questions
const byId = new Map(qs.map((q) => [q.id, q]))

// Mulberry32: a small seeded generator, so that the draw is reproducible.
let seed = 20261010
const random = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const shuffled = <T,>(xs: T[]) => xs.map((x) => [random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

const runs = readdirSync(`${ROOT}/runs`).filter((n) => /^2026-10-10T1[5-6].*-test$/.test(n)).sort()
const labelOf = (settings: any) => {
  if (settings.config !== "C") return settings.config
  const { fallbackLow, fallbackWhen } = settings.loop
  return fallbackLow === null ? "C" : fallbackWhen === "no-answer" ? "C+" : "C before"
}
const pool = new Map<string, any[]>()
for (const name of runs) {
  const [first, ...lines] = readFileSync(`${ROOT}/runs/${name}/trace.jsonl`, "utf8").trim().split("\n")
  const label = labelOf(JSON.parse(first!))
  for (const line of lines) pool.set(label, [...(pool.get(label) ?? []), { run: name, ...JSON.parse(line) }])
}

const picked: any[] = []
const usedQuestions = new Set<string>()
const categoryCount = new Map<string, number>()
for (const label of ["A", "B", "C", "C+", "C before"]) {
  const records = shuffled(pool.get(label)!)
  for (const correct of [true, false]) {
    let wanted = 2
    // Prefer the least represented categories, then questions not drawn yet.
    const candidates = records
      .filter((r) => r.grade.correct === correct && !usedQuestions.has(r.id))
      .sort((a, b) => (categoryCount.get(a.category) ?? 0) - (categoryCount.get(b.category) ?? 0))
    for (const record of candidates) {
      if (wanted === 0) break
      if (picked.some((p) => p.id === record.id)) continue
      picked.push({ label, ...record })
      usedQuestions.add(record.id)
      categoryCount.set(record.category, (categoryCount.get(record.category) ?? 0) + 1)
      wanted--
    }
  }
}
// Configs with fewer than two wrong answers left room: fill up to 20 with correct ones.
for (const record of shuffled([...pool.values()].flat().map((r) => r))) {
  if (picked.length >= 20) break
  if (usedQuestions.has(record.id)) continue
  const label = labelOf(JSON.parse(readFileSync(`${ROOT}/runs/${record.run}/trace.jsonl`, "utf8").split("\n")[0]!))
  picked.push({ label, ...record })
  usedQuestions.add(record.id)
}

const cell = (text: unknown) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ")
const expectedOf = (q: any) => {
  const e = q.expected
  if (e.kind === "value") return `value: ${e.values.join(" / ")}`
  if (e.kind === "conflict") return `conflict between: ${e.values.join(" / ")}`
  return e.kind === "undecided" ? "no decision was made" : "abstain (the vault does not say)"
}
const items = picked.map((p, i) => {
  const q = byId.get(p.id)
  const out = p.output
  return [
    `### ${i + 1}. ${p.id} (${p.category}, config ${p.label})`,
    "",
    `- **Question**: ${q.question}`,
    `- **Expected**: ${expectedOf(q)}${q.stale.length > 0 ? `; outdated values that must not be given: ${q.stale.join(" / ")}` : ""}`,
    `- **Answer**: status \`${out?.status ?? "none"}\`; value: ${cell(out?.value) || "(none)"}`,
    `- **Answer text**: ${cell(out?.answer) || "(none)"}`,
    `- **Grader**: ${p.grade.correct ? "correct" : `wrong (${p.grade.failure})`}`,
    `- **Run**: \`runs/${p.run}\``,
    `- **Romain agrees** (yes / no, and why if no): `,
    "",
  ].join("\n")
})
writeFileSync(
  `${ROOT}/docs/results/grader-check.md`,
  [
    "# Grader check",
    "",
    "Twenty answers drawn from the final runs on the test split (`docs/experiments/grader-sample.ts`, seeded), four per config, with answers the grader marked correct and wrong. For each one, say whether you agree with the grader's verdict, given the question and the expected answer. The grader only reads the answer's status and value (and the answer text for conflicts and undecided questions); an explanation that mentions an outdated value it replaces is fine.",
    "",
    ...items,
  ].join("\n")
)
console.log(`wrote ${picked.length} items:`, picked.map((p) => `${p.id} ${p.label} ${p.category} ${p.grade.correct ? "ok" : "ko"}`).join(", "))
