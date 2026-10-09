import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import { MistralEmbedder } from "/Users/romain/projects/reflex-rag/src/models/mistral-embedder.ts"
import { HybridRetriever } from "/Users/romain/projects/reflex-rag/src/retrieval/hybrid.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const retriever = new HybridRetriever(index, new MistralEmbedder({ apiKey: process.env.MISTRAL_API_KEY! }))
const all: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
const split = process.argv[2] ?? "tuning"
const K = [8, 15, 20, 30, 50]
const stats: Record<string, { groups: number; firstGroups: number; hit: Record<number, number>; firstHit: Record<number, number> }> = {}
let tokens = 0
for (const q of all.filter((x) => x.split === split && x.sourceGroups.length > 0)) {
  const r = await retriever.retrieve(q.question, 50)
  tokens += r.calls.reduce((a: number, c: any) => a + c.inputTokens, 0)
  const rankOf = (group: string[]) => { const i = r.chunks.findIndex((x) => group.includes(x.chunk.notePath)); return i < 0 ? Infinity : i + 1 }
  const s = (stats[q.category] ??= { groups: 0, firstGroups: 0, hit: {}, firstHit: {} })
  q.sourceGroups.forEach((g: string[], gi: number) => {
    const rank = rankOf(g)
    s.groups++
    if (gi === 0) s.firstGroups++
    for (const k of K) { if (rank <= k) { s.hit[k] = (s.hit[k] ?? 0) + 1; if (gi === 0) s.firstHit[k] = (s.firstHit[k] ?? 0) + 1 } }
  })
}
console.log(`split ${split}, embedding tokens ${tokens}`)
console.log(`source groups found among the top k candidates (all groups | first group = entry note):`)
console.log(`category        ${K.map((k) => `k=${k}`.padStart(12)).join("")}`)
for (const [c, s] of Object.entries(stats))
  console.log(`${c.padEnd(15)} ${K.map((k) => `${s.hit[k] ?? 0}/${s.groups}|${s.firstHit[k] ?? 0}/${s.firstGroups}`.padStart(12)).join("")}`)
