import { describe, expect, test } from "bun:test"
import type { Assessment, Judge, Missing, Relevance } from "../core/judge.ts"
import type { Chunk, DatedChunk, Link, ModelCall, Note } from "../core/types.ts"
import type { Index } from "../index/read.ts"
import type { Retrieval } from "../retrieval/hybrid.ts"
import { runLoop, type LoopDeps } from "./loop.ts"
import { DEFAULT_POLICY, type PolicyConfig } from "./policy.ts"
import type { Rewriter } from "./rewriter.ts"

// The loop runs the real `decide`. The fakes below sit at the boundaries only:
// the retriever, the index, the judge and the rewriter. The judge's scripted
// probabilities drive the policy down each path.

const QUESTION = "Who owns the Borealis budget?"

function call(model: string): ModelCall {
  return { model, inputTokens: 10, outputTokens: 2, latencyMs: 5 }
}

function chunk(id: string, notePath: string): Chunk {
  return {
    id,
    notePath,
    heading: `heading of ${id}`,
    text: `text of ${id}`,
  }
}

function link(id: string, sourcePath: string, targetPath: string): Link {
  return { id, sourcePath, targetPath, label: `label of ${id}` }
}

interface World {
  /** Note path to note date. A path absent from the map is not a note. */
  notes: Record<string, string | null>
  chunks: Chunk[]
  links: Link[]
}

/**
 * a -> b, a -> c, b -> d, d -> a. Chunks a1 a2 (a), b1 b2 (b), c1 (c), d1 (d).
 */
const WORLD: World = {
  notes: {
    "a.md": "2025-01-01",
    "b.md": "2025-02-02",
    "c.md": null,
    "d.md": "2025-04-04",
  },
  chunks: [
    chunk("a1", "a.md"),
    chunk("a2", "a.md"),
    chunk("b1", "b.md"),
    chunk("b2", "b.md"),
    chunk("c1", "c.md"),
    chunk("d1", "d.md"),
  ],
  links: [
    link("l1", "a.md", "b.md"),
    link("l2", "a.md", "c.md"),
    link("l3", "b.md", "d.md"),
    link("l4", "d.md", "a.md"),
  ],
}

function fakeIndex(world: World): LoopDeps["index"] {
  const index: Pick<Index, "chunksOf" | "getNote" | "outgoingLinks"> = {
    chunksOf: (path) => world.chunks.filter((c) => c.notePath === path),
    getNote(pathOrTitle) {
      const date = world.notes[pathOrTitle]
      if (date === undefined) return null
      const note: Note = {
        path: pathOrTitle,
        title: pathOrTitle,
        date,
        summary: "",
        frontmatter: {},
      }
      return note
    },
    outgoingLinks: (path) => world.links.filter((l) => l.sourcePath === path),
  }
  return index
}

interface AssessSpec {
  sufficient?: number
  missing?: Missing
  /** Probability by link id. */
  links?: Record<string, number>
  /** Probability of every link not listed in `links`. Default 0. */
  linkProbability?: number
}

interface Scenario {
  question?: string
  world?: World
  /** Chunk ids returned by the retriever, by query, best first. */
  search?: Record<string, string[]>
  /**
   * Probability by chunk id. An array is consumed one value per judgement of
   * that chunk, the last value repeating. A chunk not listed gets 0.
   */
  relevance?: Record<string, number | number[]>
  /** One per assessment, the last repeating. */
  assessments?: AssessSpec[]
  policy?: PolicyConfig
  candidates?: number
  /** Queries returned by the rewriter, in order. */
  rewrites?: string[]
}

function policyWith(
  budgets: Partial<PolicyConfig["budgets"]> = {},
  thresholds: Partial<PolicyConfig["thresholds"]> = {}
): PolicyConfig {
  return {
    thresholds: { ...DEFAULT_POLICY.thresholds, ...thresholds },
    budgets: { ...DEFAULT_POLICY.budgets, ...budgets },
  }
}

async function run(scenario: Scenario) {
  const world = scenario.world ?? WORLD
  const question = scenario.question ?? QUESTION
  const byId = new Map(world.chunks.map((c) => [c.id, c]))

  const retrieveCalls: Array<[string, number]> = []
  const retrieve: LoopDeps["retrieve"] = (query, k) => {
    retrieveCalls.push([query, k])
    const ids = scenario.search?.[query] ?? []
    const retrieval: Retrieval = {
      chunks: ids.map((id, i) => ({
        chunk: byId.get(id)!,
        score: 1 / (i + 1),
        bm25Rank: i + 1,
        vectorRank: null,
      })),
      calls: [call("embed")],
    }
    return Promise.resolve(retrieval)
  }

  const relevanceCalls: Array<{ question: string; chunks: DatedChunk[] }> = []
  const assessCalls: Array<{
    question: string
    chunks: DatedChunk[]
    links: Link[]
  }> = []
  const consumed = new Map<string, number>()
  const specs = scenario.assessments ?? [{}]
  const judge: Judge = {
    relevance(q, chunks) {
      relevanceCalls.push({ question: q, chunks: [...chunks] })
      const probabilities: Record<string, number> = {}
      for (const c of chunks) {
        const scripted = scenario.relevance?.[c.id] ?? 0
        const n = consumed.get(c.id) ?? 0
        consumed.set(c.id, n + 1)
        probabilities[c.id] =
          typeof scripted === "number"
            ? scripted
            : scripted[Math.min(n, scripted.length - 1)]!
      }
      // Like the real judges, no call when there is nothing to judge.
      const relevance: Relevance = {
        chunks: probabilities,
        calls: chunks.length === 0 ? [] : [call("relevance")],
      }
      return Promise.resolve(relevance)
    },
    assess(q, chunks, links) {
      const spec: AssessSpec =
        specs[Math.min(assessCalls.length, specs.length - 1)] ?? {}
      assessCalls.push({ question: q, chunks: [...chunks], links: [...links] })
      const choice = spec.missing ?? "unidentified"
      const probabilities = {
        detail_in_linked_note: 0,
        newer_version: 0,
        topic_not_found: 0,
        unidentified: 0,
        [choice]: 1,
      } as Record<Missing, number>
      const assessment: Assessment = {
        sufficient: spec.sufficient ?? 0,
        missing: { choice, probabilities },
        links: Object.fromEntries(
          links.map((l) => [
            l.id,
            spec.links?.[l.id] ?? spec.linkProbability ?? 0,
          ])
        ),
        calls: [call("assess")],
      }
      return Promise.resolve(assessment)
    },
  }

  const rewriterCalls: Array<{
    question: string
    keptIds: string[]
    missing: Missing
  }> = []
  const rewriter: Rewriter = {
    kind: "fake",
    rewrite(q, kept, missing) {
      const n = rewriterCalls.length
      rewriterCalls.push({
        question: q,
        keptIds: kept.map((c) => c.id),
        missing,
      })
      return Promise.resolve({
        query: scenario.rewrites?.[n] ?? `rewritten ${n + 1}`,
        calls: [call("rewriter")],
      })
    },
  }

  const deps: LoopDeps = {
    retrieve,
    index: fakeIndex(world),
    judge,
    rewriter,
    policy: scenario.policy ?? DEFAULT_POLICY,
    ...(scenario.candidates === undefined
      ? {}
      : { candidates: scenario.candidates }),
  }
  const result = await runLoop(question, deps)
  return { result, retrieveCalls, relevanceCalls, assessCalls, rewriterCalls }
}

function ids(chunks: Array<{ id: string }>): string[] {
  return chunks.map((c) => c.id)
}

function sorted(values: string[]): string[] {
  return [...values].sort()
}

describe("AC1 — first turn", () => {
  test("AC1 — retrieves 50 candidates for the question by default", async () => {
    const { retrieveCalls } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(retrieveCalls).toEqual([[QUESTION, 50]])
  })

  test("AC1 — retrieves the configured number of candidates", async () => {
    const { retrieveCalls } = await run({
      candidates: 7,
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(retrieveCalls).toEqual([[QUESTION, 7]])
  })

  test("AC1 — asks the judge about every candidate, dated from its note", async () => {
    const { relevanceCalls } = await run({
      search: { [QUESTION]: ["a1", "c1", "b1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(relevanceCalls).toHaveLength(1)
    expect(relevanceCalls[0]!.question).toBe(QUESTION)
    expect(relevanceCalls[0]!.chunks).toEqual([
      { ...chunk("a1", "a.md"), noteDate: "2025-01-01" },
      { ...chunk("c1", "c.md"), noteDate: null },
      { ...chunk("b1", "b.md"), noteDate: "2025-02-02" },
    ])
  })

  test("AC1 — keeps the chunks at or above the relevance threshold", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1", "a2", "b1"] },
      relevance: { a1: 0.5, a2: 0.49, b1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(sorted(result.steps[0]!.kept)).toEqual(["a1", "b1"])
    expect(result.context.map((c) => c.text)).toEqual([
      "text of b1",
      "text of a1",
    ])
  })

  test("AC1 — uses the relevance threshold of the policy", async () => {
    const { result } = await run({
      policy: policyWith({}, { relevance: 0.8 }),
      search: { [QUESTION]: ["a1", "b1"] },
      relevance: { a1: 0.79, b1: 0.8 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(result.steps[0]!.kept).toEqual(["b1"])
    expect(result.context.map((c) => c.text)).toEqual(["text of b1"])
  })
})

describe("AC2 — assessment", () => {
  test("AC2 — assesses the kept chunks best first, dated", async () => {
    const { assessCalls } = await run({
      search: { [QUESTION]: ["a1", "a2", "b1"] },
      relevance: { a1: 0.9, a2: 0.6, b1: 0.7 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(assessCalls).toHaveLength(1)
    expect(assessCalls[0]!.question).toBe(QUESTION)
    expect(assessCalls[0]!.chunks).toEqual([
      { ...chunk("a1", "a.md"), noteDate: "2025-01-01" },
      { ...chunk("b1", "b.md"), noteDate: "2025-02-02" },
      { ...chunk("a2", "a.md"), noteDate: "2025-01-01" },
    ])
  })

  test("AC2 — assesses at most the chunk budget", async () => {
    const { assessCalls } = await run({
      policy: policyWith({ maxChunks: 2 }),
      search: { [QUESTION]: ["a1", "a2", "b1"] },
      relevance: { a1: 0.9, a2: 0.6, b1: 0.7 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(ids(assessCalls[0]!.chunks)).toEqual(["a1", "b1"])
  })

  test("AC2 — lists the links out of the notes of the kept chunks, to notes not in the context", async () => {
    // a and b are in the context: l1 (a -> b) leads to a note already there.
    // d only has an unkept chunk: l4 (d -> a) is not visible.
    const { assessCalls } = await run({
      search: { [QUESTION]: ["a1", "b1", "d1"] },
      relevance: { a1: 0.9, b1: 0.8, d1: 0.1 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(sorted(ids(assessCalls[0]!.links))).toEqual(["l2", "l3"])
    expect(assessCalls[0]!.links.find((l) => l.id === "l2")).toEqual(
      WORLD.links[1]
    )
  })

  test("AC2 — assesses once per turn and lists no link when nothing is kept", async () => {
    const { assessCalls, result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.1 },
      policy: policyWith({ maxRewrites: 0 }),
    })
    expect(assessCalls).toHaveLength(result.steps.length)
    expect(assessCalls[0]!.chunks).toEqual([])
    expect(assessCalls[0]!.links).toEqual([])
  })

  test("AC2 — decides with the real policy: a sufficient context is answered", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.7, linkProbability: 1 }],
    })
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "sufficient",
    })
    expect(result.hops).toBe(0)
  })

  test("AC2 — decides with the policy it is given", async () => {
    const { result } = await run({
      policy: policyWith({}, { sufficient: 0.95 }),
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })
})

describe("AC3 — follow a link", () => {
  const hop: Scenario = {
    search: { [QUESTION]: ["a1", "a2"] },
    relevance: { a1: 0.9, a2: 0.1, b1: 0.8, b2: 0.2 },
    assessments: [
      { sufficient: 0.2, links: { l1: 0.9, l2: 0.1 } },
      { sufficient: 0.9 },
    ],
  }

  test("AC3 — follows the promising link, then answers", async () => {
    const { result, retrieveCalls } = await run(hop)
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]!.action).toMatchObject({
      type: "follow",
      rule: "follow-link",
      probability: 0.9,
      link: { id: "l1" },
    })
    expect(result.steps[1]!.kind).toBe("follow")
    expect(result.outcome).toMatchObject({ type: "answer", rule: "sufficient" })
    expect(result.hops).toBe(1)
    expect(result.rewrites).toBe(0)
    expect(result.context.map((c) => c.notePath)).toEqual(["a.md", "b.md"])
    // Following a link does not search again.
    expect(retrieveCalls).toHaveLength(1)
  })

  test("AC3 — judges the chunks of the target note, dated, and keeps the relevant ones", async () => {
    const { result, relevanceCalls } = await run(hop)
    expect(relevanceCalls).toHaveLength(2)
    expect(relevanceCalls[1]!.question).toBe(QUESTION)
    expect(relevanceCalls[1]!.chunks).toEqual([
      { ...chunk("b1", "b.md"), noteDate: "2025-02-02" },
      { ...chunk("b2", "b.md"), noteDate: "2025-02-02" },
    ])
    expect(result.steps[1]!.kept).toEqual(["b1"])
  })

  test("AC3 — assesses again with the links of the new context", async () => {
    // b is in the context now: l1 is gone; l3 (b -> d) appears.
    const { assessCalls } = await run(hop)
    expect(assessCalls).toHaveLength(2)
    expect(sorted(ids(assessCalls[1]!.links))).toEqual(["l2", "l3"])
    expect(ids(assessCalls[1]!.chunks)).toEqual(["a1", "b1"])
  })

  test("AC3 — marks the target as followed when nothing was kept there", async () => {
    const { result, assessCalls } = await run({
      ...hop,
      relevance: { a1: 0.9, a2: 0.1, b1: 0.1, b2: 0.2 },
      assessments: [{ sufficient: 0.2, links: { l1: 0.9, l2: 0.1 } }, {}],
    })
    expect(result.steps[1]!.kind).toBe("follow")
    expect(result.steps[1]!.kept).toEqual([])
    expect(result.hops).toBe(1)
    // l1 is not offered again, l2 still is.
    expect(ids(assessCalls[1]!.links)).toEqual(["l2"])
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
    expect(result.context.map((c) => c.notePath)).toEqual(["a.md"])
  })

  test("AC3 — counts a hop for a target note without chunks", async () => {
    const world: World = {
      ...WORLD,
      notes: { ...WORLD.notes, "e.md": null },
      links: [...WORLD.links, link("l5", "a.md", "e.md")],
    }
    const { result, assessCalls } = await run({
      world,
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.2, links: { l5: 0.9 } }, {}],
    })
    expect(result.hops).toBe(1)
    expect(result.steps.map((s) => s.kind)).toEqual(["search", "follow"])
    expect(ids(assessCalls[1]!.links)).not.toContain("l5")
  })

  test("AC3 — follows the best of several links, the smallest id on a tie", async () => {
    const { result } = await run({
      ...hop,
      assessments: [
        { sufficient: 0.2, links: { l1: 0.6, l2: 0.6 } },
        { sufficient: 0.9 },
      ],
    })
    expect(result.steps[0]!.action).toMatchObject({
      type: "follow",
      link: { id: "l1" },
    })
  })
})

describe("AC4 — search again", () => {
  test("AC4 — rewrites when nothing relevant was kept, then answers", async () => {
    const { result, retrieveCalls, relevanceCalls, rewriterCalls } = await run({
      rewrites: ["better query"],
      search: {
        [QUESTION]: ["d1"],
        "better query": ["d1", "b1", "b2"],
      },
      relevance: { d1: 0.1, b1: 0.8, b2: 0.6 },
      assessments: [{ missing: "unidentified" }, { sufficient: 0.9 }],
    })
    expect(result.steps[0]!.action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-nothing-relevant",
    })
    expect(rewriterCalls).toEqual([
      { question: QUESTION, keptIds: [], missing: "unidentified" },
    ])
    expect(retrieveCalls).toEqual([
      [QUESTION, 50],
      ["better query", 50],
    ])
    // d1 was already judged: only the new chunks go to the judge.
    expect(relevanceCalls).toHaveLength(2)
    expect(ids(relevanceCalls[1]!.chunks)).toEqual(["b1", "b2"])
    expect(relevanceCalls[1]!.question).toBe(QUESTION)
    expect(result.steps.map((s) => s.kind)).toEqual(["search", "rewrite"])
    expect(result.steps[1]!.query).toBe("better query")
    expect(result.rewrites).toBe(1)
    expect(result.hops).toBe(0)
    expect(result.outcome).toMatchObject({ type: "answer", rule: "sufficient" })
    expect(result.context.map((c) => c.text)).toEqual([
      "text of b1",
      "text of b2",
    ])
  })

  test("AC4 — retrieves the configured number of candidates for the new query", async () => {
    const { retrieveCalls } = await run({
      candidates: 9,
      rewrites: ["q2"],
      search: { q2: ["b1"] },
      relevance: { b1: 0.8 },
      assessments: [{}, { sufficient: 0.9 }],
    })
    expect(retrieveCalls).toEqual([
      [QUESTION, 9],
      ["q2", 9],
    ])
  })

  test("AC4 — gives the rewriter the kept chunks and the missing choice", async () => {
    const { result, rewriterCalls } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["a1", "b1"], q2: ["a1", "c1"] },
      relevance: { a1: 0.8, b1: 0.9, c1: 0.95 },
      assessments: [
        { sufficient: 0.2, missing: "topic_not_found" },
        { sufficient: 0.9 },
      ],
    })
    expect(result.steps[0]!.action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-topic-not-found",
    })
    expect(rewriterCalls).toEqual([
      { question: QUESTION, keptIds: ["b1", "a1"], missing: "topic_not_found" },
    ])
  })

  test("AC4 — merges the new relevant chunks with the kept ones", async () => {
    const { result, relevanceCalls } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["a1", "d1"], q2: ["a1", "c1", "d1"] },
      relevance: { a1: 0.8, c1: 0.9, d1: 0.1 },
      assessments: [
        { sufficient: 0.2, missing: "topic_not_found" },
        { sufficient: 0.9 },
      ],
    })
    expect(ids(relevanceCalls[1]!.chunks)).toEqual(["c1"])
    expect(result.steps[1]!.judged).toEqual({ c1: 0.9 })
    expect(result.context.map((c) => c.text)).toEqual([
      "text of c1",
      "text of a1",
    ])
  })

  test("AC4 — the next decision knows a rewrite happened: nothing relevant after it abstains", async () => {
    const { result, retrieveCalls, rewriterCalls } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["d1"], q2: ["d1"] },
      relevance: { d1: 0.1 },
    })
    expect(rewriterCalls).toHaveLength(1)
    expect(retrieveCalls).toHaveLength(2)
    expect(result.rewrites).toBe(1)
    expect(result.steps).toHaveLength(2)
    expect(result.outcome).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC4 — the next decision knows a rewrite happened: topic not found again answers with what was found", async () => {
    const { result, rewriterCalls } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["a1"], q2: ["d1"] },
      relevance: { a1: 0.8, d1: 0.1 },
      assessments: [{ missing: "topic_not_found" }],
    })
    expect(rewriterCalls).toHaveLength(1)
    expect(result.rewrites).toBe(1)
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
    expect(result.context.map((c) => c.text)).toEqual(["text of a1"])
  })
})

describe("AC5 — end", () => {
  test("AC5 — answers with the kept chunks by relevance, ties by retrieval rank, cut to the budget", async () => {
    const { result } = await run({
      policy: policyWith({ maxChunks: 3 }),
      search: { [QUESTION]: ["a1", "b1", "c1", "d1", "a2"] },
      relevance: { a1: 0.8, b1: 0.9, c1: 0.8, d1: 0.8, a2: 0.6 },
      assessments: [{ sufficient: 0.9 }],
    })
    // b1 first; a1, c1 and d1 tie and keep their retrieval order; a2 is cut.
    expect(result.context).toEqual([
      {
        notePath: "b.md",
        noteDate: "2025-02-02",
        heading: "heading of b1",
        text: "text of b1",
      },
      {
        notePath: "a.md",
        noteDate: "2025-01-01",
        heading: "heading of a1",
        text: "text of a1",
      },
      {
        notePath: "c.md",
        noteDate: null,
        heading: "heading of c1",
        text: "text of c1",
      },
    ])
  })

  test("AC5 — the default chunk budget is 12", async () => {
    const notes = { "n.md": "2025-05-05" }
    const chunks = Array.from({ length: 15 }, (_, i) =>
      chunk(`n${String(i + 1).padStart(2, "0")}`, "n.md")
    )
    const { result } = await run({
      world: { notes, chunks, links: [] },
      search: { [QUESTION]: ids(chunks) },
      relevance: Object.fromEntries(
        chunks.map((c, i) => [c.id, 0.95 - i * 0.01])
      ),
      assessments: [{ sufficient: 0.9 }],
    })
    expect(result.context).toHaveLength(12)
    expect(result.context[0]!.text).toBe("text of n01")
    expect(result.context[11]!.text).toBe("text of n12")
  })

  test("AC5 — sorts chunks found by following a link with the others", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.6, b1: 0.9 },
      assessments: [
        { sufficient: 0.2, links: { l1: 0.9 } },
        { sufficient: 0.9 },
      ],
    })
    expect(result.context.map((c) => c.text)).toEqual([
      "text of b1",
      "text of a1",
    ])
  })

  test("AC5 — answers with what was found when no link is promising", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.8 },
      assessments: [{ sufficient: 0.2, links: { l1: 0.4, l2: 0.1 } }],
    })
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
    expect(result.context.map((c) => c.text)).toEqual(["text of a1"])
  })

  test("AC5 — abstains with an empty context when nothing is relevant and no search is left", async () => {
    const { result, retrieveCalls, rewriterCalls } = await run({
      policy: policyWith({ maxRewrites: 0 }),
      search: { [QUESTION]: ["a1", "b1"] },
      relevance: { a1: 0.2, b1: 0.3 },
    })
    expect(result.context).toEqual([])
    expect(result.outcome).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
    expect(result.steps).toHaveLength(1)
    expect(result.hops).toBe(0)
    expect(result.rewrites).toBe(0)
    expect(retrieveCalls).toHaveLength(1)
    expect(rewriterCalls).toEqual([])
  })

  test("AC5 — the outcome is the final action", async () => {
    const answered = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.8 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(answered.result.outcome).toEqual(
      answered.result.steps.at(-1)!.action
    )
    const abstained = await run({
      policy: policyWith({ maxRewrites: 0 }),
      search: {},
    })
    expect(abstained.result.outcome).toEqual(
      abstained.result.steps.at(-1)!.action
    )
  })
})

describe("AC6 — kept chunks", () => {
  test("AC6 — a chunk judged twice keeps its highest probability", async () => {
    // b2 is judged irrelevant (0.3) in the search, then relevant (0.8) when
    // its note is followed; b1 is 0.6 there.
    const { result } = await run({
      search: { [QUESTION]: ["a1", "b2"] },
      relevance: { a1: 0.9, b2: [0.3, 0.8], b1: 0.6 },
      assessments: [
        { sufficient: 0.2, links: { l1: 0.9 } },
        { sufficient: 0.9 },
      ],
    })
    expect(result.steps[0]!.judged["b2"]).toBe(0.3)
    expect(result.steps[0]!.kept).toEqual(["a1"])
    expect(result.steps[1]!.judged["b2"]).toBe(0.8)
    expect(sorted(result.steps[1]!.kept)).toEqual(["b1", "b2"])
    // Ranked by the 0.8 of the second judgement: above b1 (0.6).
    expect(result.context.map((c) => c.text)).toEqual([
      "text of a1",
      "text of b2",
      "text of b1",
    ])
  })

  test("AC6 — the kept set has no duplicates", async () => {
    const { result, assessCalls } = await run({
      search: { [QUESTION]: ["a1", "a1", "b1"] },
      relevance: { a1: 0.9, b1: 0.8 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(result.context.map((c) => c.text)).toEqual([
      "text of a1",
      "text of b1",
    ])
    expect(ids(assessCalls[0]!.chunks)).toEqual(["a1", "b1"])
    expect(sorted(result.steps[0]!.kept)).toEqual(["a1", "b1"])
  })
})

describe("AC7 — trace", () => {
  test("AC7 — one entry per turn, with what was judged, kept, assessed and decided", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1", "a2"] },
      relevance: { a1: 0.9, a2: 0.1, b1: 0.8, b2: 0.2 },
      assessments: [
        {
          sufficient: 0.2,
          missing: "detail_in_linked_note",
          links: { l1: 0.9 },
        },
        { sufficient: 0.9 },
      ],
    })
    expect(result.steps).toHaveLength(2)
    const [search, follow] = result.steps as [
      (typeof result.steps)[number],
      (typeof result.steps)[number],
    ]

    expect(search.kind).toBe("search")
    expect(search.query).toBe(QUESTION)
    expect(search.judged).toEqual({ a1: 0.9, a2: 0.1 })
    expect(search.kept).toEqual(["a1"])
    expect(search.assessment.sufficient).toBe(0.2)
    expect(search.assessment.missing.choice).toBe("detail_in_linked_note")
    expect(search.assessment.links).toEqual({ l1: 0.9, l2: 0 })
    expect(search.action).toMatchObject({ type: "follow", rule: "follow-link" })

    expect(follow.kind).toBe("follow")
    expect(follow).toMatchObject({ link: WORLD.links[0] })
    expect(follow.judged).toEqual({ b1: 0.8, b2: 0.2 })
    expect(follow.kept).toEqual(["b1"])
    expect(follow.assessment.sufficient).toBe(0.9)
    expect(follow.action).toMatchObject({ type: "answer", rule: "sufficient" })
  })

  test("AC7 — a rewrite turn holds the new query and only the chunks judged for it", async () => {
    const { result } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["d1"], q2: ["d1", "b1"] },
      relevance: { d1: 0.1, b1: 0.8 },
      assessments: [{}, { sufficient: 0.9 }],
    })
    const [first, second] = result.steps
    expect(first).toMatchObject({ kind: "search", query: QUESTION })
    expect(first!.judged).toEqual({ d1: 0.1 })
    expect(first!.kept).toEqual([])
    expect(second).toMatchObject({ kind: "rewrite", query: "q2" })
    expect(second!.judged).toEqual({ b1: 0.8 })
    expect(second!.kept).toEqual(["b1"])
    expect(second!.action).toMatchObject({ type: "answer", rule: "sufficient" })
  })

  test("AC7 — an abstaining run ends its last entry on the abstain rule", async () => {
    const { result } = await run({
      policy: policyWith({ maxRewrites: 0 }),
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.1 },
    })
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.kept).toEqual([])
    expect(result.steps[0]!.action).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC7 — calls lists every model call in order: one hop", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9, b1: 0.8 },
      assessments: [
        { sufficient: 0.2, links: { l1: 0.9 } },
        { sufficient: 0.9 },
      ],
    })
    expect(result.calls.map((c) => c.model)).toEqual([
      "embed",
      "relevance",
      "assess",
      "relevance",
      "assess",
    ])
  })

  test("AC7 — calls lists every model call in order: one rewrite", async () => {
    const { result } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["d1"], q2: ["b1"] },
      relevance: { d1: 0.1, b1: 0.8 },
      assessments: [{}, { sufficient: 0.9 }],
    })
    expect(result.calls.map((c) => c.model)).toEqual([
      "embed",
      "relevance",
      "assess",
      "rewriter",
      "embed",
      "relevance",
      "assess",
    ])
  })

  test("AC7 — calls holds the calls themselves", async () => {
    const { result } = await run({
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9 },
      assessments: [{ sufficient: 0.9 }],
    })
    expect(result.calls).toEqual([
      call("embed"),
      call("relevance"),
      call("assess"),
    ])
  })
})

describe("AC8 — termination", () => {
  /** n0 -> n1 -> ... -> n5, one chunk per note. */
  const chain: World = {
    notes: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`n${i}.md`, null])
    ),
    chunks: Array.from({ length: 6 }, (_, i) => chunk(`c${i}`, `n${i}.md`)),
    links: Array.from({ length: 5 }, (_, i) =>
      link(`k${i}`, `n${i}.md`, `n${i + 1}.md`)
    ),
  }
  const chainRun: Scenario = {
    world: chain,
    search: { [QUESTION]: ["c0"] },
    relevance: Object.fromEntries(chain.chunks.map((c) => [c.id, 0.9])),
    assessments: [{ sufficient: 0, linkProbability: 1 }],
  }

  test("AC8 — the hop budget bounds the hops (3 by default)", async () => {
    const { result } = await run(chainRun)
    expect(result.hops).toBe(3)
    expect(result.steps.map((s) => s.kind)).toEqual([
      "search",
      "follow",
      "follow",
      "follow",
    ])
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
    expect(result.context).toHaveLength(4)
  })

  test("AC8 — the hop budget of the policy is used", async () => {
    const { result } = await run({
      ...chainRun,
      policy: policyWith({ maxHops: 1 }),
    })
    expect(result.hops).toBe(1)
    expect(result.steps).toHaveLength(2)
  })

  test("AC8 — no hop and no rewrite budget: one turn", async () => {
    const { result, retrieveCalls } = await run({
      ...chainRun,
      policy: policyWith({ maxHops: 0, maxRewrites: 0 }),
    })
    expect(result.steps).toHaveLength(1)
    expect(result.hops).toBe(0)
    expect(result.rewrites).toBe(0)
    expect(retrieveCalls).toHaveLength(1)
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC8 — the rewrite budget bounds the rewrites", async () => {
    const { result, retrieveCalls, rewriterCalls } = await run({
      policy: policyWith({ maxRewrites: 2 }),
      search: { [QUESTION]: ["d1"] },
      relevance: { d1: 0.1 },
    })
    expect(result.rewrites).toBe(2)
    expect(rewriterCalls).toHaveLength(2)
    expect(retrieveCalls).toHaveLength(3)
    expect(result.steps.map((s) => s.kind)).toEqual([
      "search",
      "rewrite",
      "rewrite",
    ])
    expect(result.outcome).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC8 — links that form a cycle are followed once each, even with large budgets", async () => {
    // a -> b, a -> c, b -> d, d -> a: b, c and d can each be followed once.
    const { result } = await run({
      policy: policyWith({ maxHops: 100, maxRewrites: 100 }),
      search: { [QUESTION]: ["a1"] },
      relevance: { a1: 0.9, b1: 0.9, c1: 0.9, d1: 0.9 },
      assessments: [{ sufficient: 0, linkProbability: 1 }],
    })
    expect(result.hops).toBe(3)
    expect(result.steps).toHaveLength(4)
    expect(result.outcome).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC8 — there is one turn more than there are hops and rewrites", async () => {
    const { result } = await run({
      rewrites: ["q2"],
      search: { [QUESTION]: ["d1"], q2: ["a1"] },
      relevance: { d1: 0.1, a1: 0.9, b1: 0.9 },
      assessments: [{}, { sufficient: 0, links: { l1: 0.9 } }, {}],
    })
    expect(result.hops).toBe(1)
    expect(result.rewrites).toBe(1)
    expect(result.steps).toHaveLength(result.hops + result.rewrites + 1)
  })
})
