import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const all: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
async function so(state: unknown, questions: unknown) {
  const t0 = performance.now()
  const r = await fetch("http://localhost:11434/v1/systemone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "clef-flash", state, questions }) })
  const j = (await r.json()) as any
  return { a: j.answers, ms: performance.now() - t0, tokens: j.usage?.input_tokens ?? 0 }
}
const QS = {
  step: { type: "noul", instructions: "Answering the question may need several notes, read one after the other. Does this note give the answer, or a fact that is a step toward it, such as which person, supplier, customer, meeting or decision the question depends on?", criteria: { true: "The note gives the answer or a step toward it.", false: "The note gives neither the answer nor a step toward it." } },
  points: { type: "noul", instructions: "Judging from the titles of the notes this note links to, does one of them likely hold the answer to the question, or the next step toward it?", criteria: { true: "One of the linked notes likely holds the answer or the next step.", false: "None of the linked notes is likely to help." } },
}
const f = (p: number) => p.toFixed(2)
for (const id of (process.argv[2] ?? "q-013,q-019,q-014,q-036,q-002,q-040,q-050").split(",")) {
  const q = all.find((x) => x.id === id)
  const sources = new Set<string>(q.sourceGroups.flat())
  const paths = [...new Set(index.searchBM25(q.question, 50).map((r) => r.chunk.notePath))]
  const t0 = performance.now()
  const rows = []
  let tokens = 0
  for (const path of paths) {
    const note = index.getNote(path)!
    const text = index.chunksOf(path).map((c) => (c.heading ? `## ${c.heading}\n` : "") + c.text).join("\n\n")
    const links = [...new Set(index.outgoingLinks(path).map((l) => l.targetPath))].map((t) => ({ title: index.getNote(t)?.title ?? t, folder: t.split("/")[0] }))
    const { a, tokens: tk } = await so({ question: q.question, note: { path, title: note.title, date: note.date ?? null, text, links_to: links } }, QS)
    tokens += tk
    rows.push({ path, src: sources.has(path), step: a.step.noul as number, points: a.points.noul as number })
  }
  const wall = (performance.now() - t0) / 1000
  console.log(`\n=== ${id} [${q.category}] ${q.question}`)
  console.log(`  ${paths.length} distinct notes from the top 50 chunks (sources among them: ${rows.filter((r) => r.src).length}/${sources.size}), ${wall.toFixed(1)}s, ~${Math.round(tokens / paths.length)} tokens/note`)
  for (const key of ["step", "points"] as const) {
    const kept = rows.filter((r) => r[key] >= 0.5)
    console.log(`  ${key.padEnd(6)}: sources [${rows.filter((r) => r.src).map((r) => f(r[key])).join(" ")}]  max non-source ${f(Math.max(0, ...rows.filter((r) => !r.src).map((r) => r[key])))}  kept>=0.5: ${kept.length} (${kept.filter((r) => r.src).length} sources)`)
  }
  for (const r of [...rows].sort((x, y) => Math.max(y.step, y.points) - Math.max(x.step, x.points)).slice(0, 5))
    console.log(`    step ${f(r.step)} points ${f(r.points)} ${r.src ? "SRC" : "   "} ${r.path}`)
}
