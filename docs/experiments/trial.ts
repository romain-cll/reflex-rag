import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import type { Chunk, Link } from "/Users/romain/projects/reflex-rag/src/core/types.ts"

const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const questions = (await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any
const all: any[] = Array.isArray(questions) ? questions : questions.questions
const IDS = (process.argv[2] ?? "q-002,q-014,q-036,q-040,q-050").split(",")
const CONCURRENCY = Number(process.argv[3] ?? 4)

type Q = Record<string, unknown>
async function systemone(state: unknown, qs: Record<string, Q>) {
  const t0 = performance.now()
  const res = await fetch("http://localhost:11434/v1/systemone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "clef-flash", state, questions: qs }),
  })
  const ms = performance.now() - t0
  const text = await res.text()
  if (!res.ok) return { ok: false as const, status: res.status, text, ms }
  return { ok: true as const, ms, ...(JSON.parse(text) as any) }
}

const dateOf = (c: Chunk) => index.getNote(c.notePath)?.date ?? null
const chunkState = (c: Chunk) => ({ note: c.notePath, date: dateOf(c), heading: c.heading, text: c.text })
const fmt = (p: number) => p.toFixed(3)

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const j = i++; out[j] = await fn(items[j]!) }
  }))
  return out
}

const MISSING = {
  detail_in_linked_note: "The chunks are on the right track but the answer is likely in a note one link away, a linked note that holds the detail.",
  newer_version: "The context may be outdated: a later note may change, update or replace what the chunks say (a decision, a date or an owner revised afterwards).",
  topic_not_found: "Nothing on the topic of the question was found: the chunks are about something else.",
  unidentified: "Something is missing, but none of the reasons above explains it.",
}

for (const id of IDS) {
  const q = all.find((x) => x.id === id)
  const sources = new Set<string>(q.sourceGroups.flat())
  console.log(`\n=== ${id} [${q.category}] ${q.question}`)
  console.log(`    sources: ${[...sources].join(" | ") || "(none)"}`)
  const cands = index.searchBM25(q.question, 50).map((r) => r.chunk)
  console.log(`    BM25 candidates: ${cands.length}, with a source note: ${cands.filter((c) => sources.has(c.notePath)).length}`)

  // A. relevance, one call per chunk
  const t0 = performance.now()
  const per = await pool(cands, CONCURRENCY, (c) =>
    systemone({ question: q.question, chunk: chunkState(c) }, {
      helps: {
        type: "noul",
        instructions: "Does this chunk of a company note help answer the question, by holding the answer or a necessary part of it?",
        criteria: { true: "The chunk holds the answer or a necessary part of it.", false: "The chunk does not help answer the question." },
      },
    }))
  const wallA = performance.now() - t0
  const bad = per.filter((r) => !r.ok)
  if (bad.length) console.log(`    per-chunk errors: ${bad.length}`, bad[0])
  const pA = per.map((r) => (r.ok ? r.answers.helps.noul as number : NaN))
  const msA = per.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b)
  const tokA = per.filter((r) => r.ok).map((r) => r.usage.input_tokens)
  console.log(`    [per-chunk] ${per.length} calls, wall ${(wallA / 1000).toFixed(1)}s (concurrency ${CONCURRENCY}), call p50 ${msA[Math.floor(msA.length / 2)]?.toFixed(0)}ms, max ${msA.at(-1)?.toFixed(0)}ms, input tokens/call ~${Math.round(tokA.reduce((a, b) => a + b, 0) / tokA.length)}`)

  // B. relevance, one batched call (aliases c1..cN)
  const batchState = { question: q.question, chunks: Object.fromEntries(cands.map((c, i) => [`c${i + 1}`, chunkState(c)])) }
  const batchQs = Object.fromEntries(cands.map((_, i) => [`c${i + 1}`, {
    type: "noul",
    instructions: `Does chunk c${i + 1} help answer the question, by holding the answer or a necessary part of it?`,
    criteria: { true: `Chunk c${i + 1} holds the answer or a necessary part of it.`, false: `Chunk c${i + 1} does not help answer the question.` },
  }]))
  const b = await systemone(batchState, batchQs)
  const pB = b.ok ? cands.map((_, i) => b.answers[`c${i + 1}`].noul as number) : []
  console.log(b.ok ? `    [batched]   1 call, ${(b.ms / 1000).toFixed(1)}s, input tokens ${b.usage.input_tokens}` : `    [batched]   error ${b.status}: ${b.text.slice(0, 300)}`)

  const rows = cands.map((c, i) => ({ c, src: sources.has(c.notePath), a: pA[i]!, b: pB[i] ?? NaN, rank: i + 1 }))
  const show = (label: string, key: "a" | "b") => {
    const s = rows.filter((r) => r.src).map((r) => r[key])
    const n = rows.filter((r) => !r.src).map((r) => r[key])
    const kept = rows.filter((r) => r[key] >= 0.5)
    console.log(`    ${label}: source chunks p=[${s.map(fmt).join(", ")}]  max non-source p=${n.length ? fmt(Math.max(...n)) : "-"}  kept(>=0.5): ${kept.length} (${kept.filter((r) => r.src).length} from sources)`)
  }
  show("per-chunk", "a")
  if (b.ok) show("batched  ", "b")
  console.log("    top 6 per-chunk:")
  for (const r of [...rows].sort((x, y) => y.a - x.a).slice(0, 6))
    console.log(`      ${fmt(r.a)} (batched ${Number.isNaN(r.b) ? "-" : fmt(r.b)}) bm25#${r.rank} ${r.src ? "SRC" : "   "} ${r.c.notePath} › ${r.c.heading}`)

  // C. assessment on the per-chunk kept set (top 8), with visible links
  const kept = rows.filter((r) => r.a >= 0.5).sort((x, y) => y.a - x.a).slice(0, 8).map((r) => r.c)
  const inCtx = new Set(kept.map((c) => c.notePath))
  const links: Link[] = [...new Map([...inCtx].flatMap((p) => index.outgoingLinks(p)).filter((l) => !inCtx.has(l.targetPath)).map((l) => [l.targetPath, l])).values()]
  const linkTitle = (l: Link) => index.getNote(l.targetPath)?.title ?? l.targetPath
  const assessState = {
    question: q.question,
    chunks: Object.fromEntries(kept.map((c, i) => [`c${i + 1}`, chunkState(c)])),
    links: Object.fromEntries(links.map((l, i) => [`l${i + 1}`, { target: linkTitle(l), label: l.label }])),
  }
  const assessQs: Record<string, Q> = {
    sufficient: { type: "noul", instructions: "Are the chunks enough to answer the question fully and correctly?", criteria: { true: "The chunks are enough to answer the question.", false: "Something needed to answer the question is missing from the chunks." } },
    missing: { type: "choice", instructions: "If something is missing to answer the question, what best explains it?", criteria: MISSING },
    ...Object.fromEntries(links.slice(0, 60).map((_, i) => [`l${i + 1}`, { type: "noul", instructions: `Judging only from its target title and its label, does link l${i + 1} likely lead to what is missing to answer the question?`, criteria: { true: `Link l${i + 1} likely leads to what is missing.`, false: `Link l${i + 1} does not lead to what is missing.` } }])),
  }
  const a = await systemone(assessState, assessQs)
  if (!a.ok) { console.log(`    [assess] error ${a.status}: ${a.text.slice(0, 300)}`); continue }
  const m = a.answers.missing
  console.log(`    [assess] ${kept.length} chunks, ${links.length} links, ${(a.ms / 1000).toFixed(1)}s, input tokens ${a.usage.input_tokens}`)
  console.log(`      sufficient=${fmt(a.answers.sufficient.noul)}  missing=${m.choice} (conf ${fmt(m.confidence)}) ${Object.entries(m.probabilities).map(([k, v]) => `${k}:${fmt(v as number)}`).join(" ")}`)
  const lp = links.map((l, i) => ({ l, p: a.answers[`l${i + 1}`]?.noul as number }))
  for (const { l, p } of lp.sort((x, y) => y.p - x.p).slice(0, 4))
    console.log(`      link ${fmt(p)} ${sources.has(l.targetPath) ? "SRC" : "   "} → ${l.targetPath} — "${l.label.slice(0, 90)}"`)
}
index.close()
