import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import type { Chunk } from "/Users/romain/projects/reflex-rag/src/core/types.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const all: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
async function so(state: unknown, questions: unknown) {
  const r = await fetch("http://localhost:11434/v1/systemone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "clef-flash", state, questions }) })
  return ((await r.json()) as any).answers
}
const V: Record<string, (q: string) => any> = {
  v1_answer: () => ({ type: "noul", instructions: "Does this chunk of a company note help answer the question, by holding the answer or a necessary part of it?", criteria: { true: "The chunk holds the answer or a necessary part of it.", false: "The chunk does not help answer the question." } }),
  v2_step: () => ({ type: "noul", instructions: "Answering the question may need several notes, read one after the other. Does this chunk give the answer, or a fact that is a step toward it, such as which person, supplier, customer, meeting or decision the question depends on?", criteria: { true: "The chunk gives the answer or a step toward it.", false: "The chunk gives neither the answer nor a step toward it." } }),
  v3_choice: () => ({ type: "choice", instructions: "What does this chunk of a company note give for the question?", criteria: { answer: "The answer to the question, or part of it.", step: "Not the answer itself, but a fact needed to find it, such as which person, supplier, customer, meeting or decision the question depends on.", related: "Something on a related topic that does not help find the answer.", unrelated: "Nothing related to the question." } }),
}
for (const id of ["q-013", "q-019", "q-014", "q-036", "q-002", "q-050"]) {
  const q = all.find((x) => x.id === id)
  const sources = new Set<string>(q.sourceGroups.flat())
  const cands = index.searchBM25(q.question, 50).map((r) => r.chunk)
  const pick: Chunk[] = [...cands.filter((c) => sources.has(c.notePath)), ...cands.filter((c) => !sources.has(c.notePath)).slice(0, 10)]
  const rows: { src: boolean; c: Chunk; v: Record<string, number> }[] = []
  for (const c of pick) {
    const state = { question: q.question, chunk: { note: c.notePath, date: index.getNote(c.notePath)?.date ?? null, heading: c.heading, text: c.text } }
    const a = await so(state, Object.fromEntries(Object.entries(V).map(([k, f]) => [k, f(q.question)])))
    rows.push({ src: sources.has(c.notePath), c, v: { v1: a.v1_answer.noul, v2: a.v2_step.noul, v3: a.v3_choice.probabilities.answer + a.v3_choice.probabilities.step } })
  }
  console.log(`\n=== ${id} [${q.category}] ${q.question}`)
  for (const key of ["v1", "v2", "v3"]) {
    const s = rows.filter((r) => r.src).map((r) => r.v[key]!)
    const n = rows.filter((r) => !r.src).map((r) => r.v[key]!)
    console.log(`  ${key}: sources [${s.map((p) => p.toFixed(2)).join(" ")}]  top-10 non-sources max ${n.length ? Math.max(...n).toFixed(2) : "-"}, >=0.5: ${n.filter((p) => p >= 0.5).length}/${n.length}`)
  }
  for (const r of rows.filter((r) => r.src)) console.log(`    SRC ${r.c.notePath} › ${r.c.heading}: ${r.c.text.replace(/\s+/g, " ").slice(0, 110)}`)
}
