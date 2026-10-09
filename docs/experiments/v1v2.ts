// Throwaway diagnostic: one Jev call per tuning question on the first-turn notes of the C run,
// asking three variants in the same call (questions are evaluated independently on one state):
//   v0_nK: the current per-note question; v1_nK: the generic "in the light of the other notes" question;
//   best: one choice over the notes. Writes v1v2-results.json next to this script.
import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import { noteText } from "/Users/romain/projects/reflex-rag/src/loop/loop.ts"
import { JUDGE_QUESTION } from "/Users/romain/projects/reflex-rag/src/judge/question.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const RUN = `${ROOT}/runs/2026-10-09T19-07-56-479Z-C-tuning/trace.jsonl`
const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error("TYPESAFE_API_KEY is not set (run from the repo root so that Bun loads .env)")
const index = openIndex(`${ROOT}/.reflex/index.db`)
const questions: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
const records = (await Bun.file(RUN).text()).split("\n").filter(Boolean).slice(1).map((l) => JSON.parse(l))
const note = (path: string) => ({ path, date: index.getNote(path)?.date ?? null, links: [...new Set(index.outgoingLinks(path).map((l) => l.targetPath))], text: noteText(index, path) })

const V1 = {
  instructions: (k: string) => `Read all the notes in the state. Taking into account what the other notes say, what does note ${k} give for answering the question?`,
  criteria: (k: string) => ({
    answer: `Note ${k} states the answer, and no other note shows that this information is outdated or superseded.`,
    step: `Note ${k} does not state the answer, but it identifies something the answer depends on, or links to a note likely to hold it.`,
    none: `Note ${k} does not help: it is off topic, about another entity than the one the question asks about, or outdated according to other notes.`,
  }),
}

async function decide(question: string, paths: string[]) {
  const aliases = paths.map((_, i) => `n${i + 1}`)
  const notes = Object.fromEntries(paths.map((p, i) => [aliases[i], note(p)]))
  const qs: Record<string, unknown> = {}
  for (const k of aliases) {
    qs[`v0_${k}`] = { type: "choice", instructions: `About note ${k} of the state only. ${JUDGE_QUESTION.instructions}`, criteria: JUDGE_QUESTION.criteria }
    qs[`v1_${k}`] = { type: "choice", instructions: V1.instructions(k), criteria: V1.criteria(k) }
  }
  qs.best = { type: "choice", instructions: "According to all the notes, which note states the answer to the question as it stands?", criteria: { ...Object.fromEntries(aliases.map((k) => [k, `Note ${k}`])), none: "No note states the answer." } }
  const t0 = performance.now()
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "jev-1.13.0", state: { question, notes }, questions: qs }) })
    if (res.ok) {
      const body = (await res.json()) as any
      const per = (v: string) => Object.fromEntries(paths.map((p, i) => [p, body.answers[`${v}_${aliases[i]}`]?.probabilities ?? null]))
      const bestP = body.answers.best?.probabilities ?? {}
      const best = Object.fromEntries([...paths.map((p, i) => [p, bestP[aliases[i]] ?? 0]), ["none", bestP.none ?? 0]])
      return { v0: per("v0"), v1: per("v1"), best, inputTokens: body.usage?.input_tokens ?? 0, latencyMs: performance.now() - t0 }
    }
    if (attempt >= 3 || ![429, 529, 500, 502, 503].includes(res.status)) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`)
    await Bun.sleep(1000 * 2 ** attempt)
  }
}

const out: any[] = []
let done = 0
const queue = [...records]
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let r = queue.shift(); r; r = queue.shift()) {
    const paths = Object.keys(r.loop.steps[0].judged)
    const q = questions.find((x) => x.id === r.id)
    const res = await decide(q.question, paths)
    out.push({ id: r.id, category: r.category, paths, ...res })
    console.log(`[${++done}/${records.length}] ${r.id} ${paths.length} notes, ${res.inputTokens} tokens, ${(res.latencyMs / 1000).toFixed(1)} s`)
  }
}))
await Bun.write("/private/tmp/claude-reflex-trial/v1v2-results.json", JSON.stringify(out))
const tokens = out.reduce((a, x) => a + x.inputTokens, 0)
console.log(`done: ${out.length} calls, ${tokens} input tokens (~${(tokens * 0.042e-6).toFixed(4)} USD)`)
