// Throwaway diagnostic: one Jev call per question with all first-turn notes in one state,
// compared with the per-note verdicts of the C run. Writes batched-results.json next to it.
import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import { noteText } from "/Users/romain/projects/reflex-rag/src/loop/loop.ts"
import { JUDGE_QUESTION } from "/Users/romain/projects/reflex-rag/src/judge/question.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const RUN = `${ROOT}/runs/2026-10-09T16-35-14-158Z-C-tuning/trace.jsonl`
const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error("TYPESAFE_API_KEY is not set (run from the repo root so that Bun loads .env)")
const index = openIndex(`${ROOT}/.reflex/index.db`)
const records = (await Bun.file(RUN).text()).split("\n").filter(Boolean).slice(1).map((l) => JSON.parse(l))
const note = (path: string) => ({ path, date: index.getNote(path)?.date ?? null, links: [...new Set(index.outgoingLinks(path).map((l) => l.targetPath))], text: noteText(index, path) })
async function batched(question: string, paths: string[]) {
  const notes = Object.fromEntries(paths.map((p, i) => [`n${i + 1}`, note(p)]))
  const questions = Object.fromEntries(paths.map((_, i) => [`n${i + 1}`, { type: "choice", instructions: `About note n${i + 1} of the state only. ${JUDGE_QUESTION.instructions}`, criteria: JUDGE_QUESTION.criteria }]))
  const t0 = performance.now()
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "jev-1.13.0", state: { question, notes }, questions }) })
    if (res.ok) {
      const body = (await res.json()) as any
      const verdicts = Object.fromEntries(paths.map((p, i) => [p, body.answers[`n${i + 1}`]?.probabilities ?? null]))
      return { verdicts, inputTokens: body.usage?.input_tokens ?? 0, latencyMs: performance.now() - t0 }
    }
    if (attempt >= 3 || ![429, 529, 500, 502, 503].includes(res.status)) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
    await Bun.sleep(1000 * 2 ** attempt)
  }
}
const out: any[] = []
let done = 0
const queue = [...records]
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let r = queue.shift(); r; r = queue.shift()) {
    const first = r.loop.steps[0]
    const paths = Object.keys(first.judged)
    const fallback = new Set(first.fallback ?? [])
    const perNoteTokens = r.calls.filter((c: any) => c.model === "jev-1.13.0").slice(0, paths.length).reduce((a: number, c: any) => a + c.inputTokens, 0)
    const b = await batched(r.id === undefined ? "" : (await Bun.file(`${ROOT}/evals/dev/questions.json`).json() as any).questions.find((q: any) => q.id === r.id).question, paths)
    out.push({ id: r.id, category: r.category, paths, perNote: first.judged, fallback: [...fallback], batched: b.verdicts, batchedTokens: b.inputTokens, perNoteTokens, batchedLatencyMs: b.latencyMs })
    console.log(`[${++done}/${records.length}] ${r.id} ${paths.length} notes, ${b.inputTokens} tokens, ${(b.latencyMs / 1000).toFixed(1)} s`)
  }
}))
await Bun.write("/private/tmp/claude-reflex-trial/batched-results.json", JSON.stringify(out))
const tokens = out.reduce((a, x) => a + x.batchedTokens, 0)
console.log(`done: ${out.length} calls, ${tokens} input tokens (~${(tokens * 0.042e-6).toFixed(4)} USD) vs ${out.reduce((a, x) => a + x.perNoteTokens, 0)} tokens per note`)
