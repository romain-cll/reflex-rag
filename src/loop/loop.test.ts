import { describe, expect, test } from "bun:test"
import type { Judge, NoteForJudge, Verdict } from "../core/judge.ts"
import { LLMCallError } from "../core/llm.ts"
import type { Chunk, Link, ModelCall, Note } from "../core/types.ts"
import type { Retrieval } from "../retrieval/hybrid.ts"
import { LoopError, noteText, runLoop, type LoopDeps } from "./loop.ts"
import type { PolicyConfig } from "./policy.ts"
import type { Rewriter } from "./rewriter.ts"

// The loop runs the real `decide`. The fakes below sit at the boundaries only:
// the retriever, the index, the judge and the rewriter. The judge's scripted
// verdicts drive the policy down each path.

const QUESTION = "Who owns the Borealis budget?"

const BASE_POLICY: PolicyConfig = {
  thresholds: { answer: 0.5, step: 0.5 },
  budgets: { maxHops: 2, maxRewrites: 1, explore: 3, maxNotes: 5 },
}

function policyWith(
  budgets: Partial<PolicyConfig["budgets"]> = {},
  thresholds: Partial<PolicyConfig["thresholds"]> = {}
): PolicyConfig {
  return {
    thresholds: { ...BASE_POLICY.thresholds, ...thresholds },
    budgets: { ...BASE_POLICY.budgets, ...budgets },
  }
}

function call(model: string): ModelCall {
  return { model, inputTokens: 10, outputTokens: 2, latencyMs: 5 }
}

type Probabilities = Partial<Record<Verdict, number>>

/** The verdicts of a note as the fake judge returns them. */
function verdict(p: Probabilities): Record<Verdict, number> {
  return { answer: 0, step: 0, none: 0, ...p }
}

const NONE = verdict({ none: 1 })

interface World {
  /** Note path to note date. A path absent from the map is not a note. */
  notes: Record<string, string | null>
  chunks: Chunk[]
  links: Link[]
}

/** The id of the only chunk of a generated note. */
function hit(stem: string): string {
  return `${stem}#1`
}

function hits(...stems: string[]): string[] {
  return stems.map(hit)
}

/**
 * A world of notes `<stem>.md`, each with one preamble chunk
 * `text of <stem>`, linked as given. `extra` adds notes without links.
 */
function worldOf(
  links: Array<[string, string]>,
  options: { extra?: string[]; dates?: Record<string, string | null> } = {}
): World {
  const stems = [...new Set([...links.flat(), ...(options.extra ?? [])])]
  return {
    notes: Object.fromEntries(
      stems.map((s) => [`${s}.md`, options.dates?.[s] ?? null])
    ),
    chunks: stems.map((s) => ({
      id: hit(s),
      notePath: `${s}.md`,
      heading: "",
      text: `text of ${s}`,
    })),
    links: links.map(([source, target], i) => ({
      id: `l${i}`,
      sourcePath: `${source}.md`,
      targetPath: `${target}.md`,
      label: `${source} to ${target}`,
    })),
  }
}

/** a -> b, a -> c, b -> d, d -> a. */
const GRAPH = worldOf(
  [
    ["a", "b"],
    ["a", "c"],
    ["b", "d"],
    ["d", "a"],
  ],
  { dates: { a: "2025-01-01", b: "2025-02-02", d: "2025-04-04" } }
)

/** Notes with several sections, a preamble, a duplicate link and no date. */
const SECTIONS: World = {
  notes: {
    "a.md": "2025-01-01",
    "b.md": "2025-02-02",
    "c.md": null,
    "d.md": "2025-04-04",
  },
  chunks: [
    { id: "a1", notePath: "a.md", heading: "", text: "intro of a" },
    { id: "a2", notePath: "a.md", heading: "Owner", text: "owner of a" },
    { id: "b1", notePath: "b.md", heading: "B one", text: "first of b" },
    { id: "b2", notePath: "b.md", heading: "B two", text: "second of b" },
    { id: "c1", notePath: "c.md", heading: "", text: "only c" },
    { id: "d1", notePath: "d.md", heading: "Plan > D", text: "text of d" },
  ],
  links: [
    { id: "l1", sourcePath: "a.md", targetPath: "b.md", label: "a to b" },
    { id: "l2", sourcePath: "a.md", targetPath: "c.md", label: "a to c" },
    { id: "l3", sourcePath: "a.md", targetPath: "b.md", label: "a to b again" },
    { id: "l4", sourcePath: "b.md", targetPath: "d.md", label: "b to d" },
  ],
}

function fakeIndex(world: World): LoopDeps["index"] {
  return {
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
}

interface Scenario {
  question?: string
  world?: World
  /** Chunk ids returned by the retriever, by query, best first. */
  search?: Record<string, string[]>
  /** Verdicts by note path. A note not listed is `none`. */
  verdicts?: Record<string, Probabilities>
  policy?: PolicyConfig
  candidates?: number
  /** Queries returned by the rewriter, in order. */
  rewrites?: string[]
  /** The nth call (from 0) of `judge.judge` rejects with this error. */
  judgeFailure?: { onCall: number; error: Error }
  rewriterFailure?: Error
  /** The nth call (from 0) of `retrieve` rejects with this error. */
  retrieveFailure?: { onCall: number; error: Error }
}

function setup(scenario: Scenario) {
  const world = scenario.world ?? GRAPH
  const question = scenario.question ?? QUESTION
  const byId = new Map(world.chunks.map((c) => [c.id, c]))

  const retrieveCalls: Array<[string, number]> = []
  const retrieve: LoopDeps["retrieve"] = (query, k) => {
    const n = retrieveCalls.length
    retrieveCalls.push([query, k])
    if (scenario.retrieveFailure?.onCall === n) {
      return Promise.reject(scenario.retrieveFailure.error)
    }
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

  const judgeCalls: Array<{ question: string; notes: NoteForJudge[] }> = []
  const judge: Judge = {
    judge(q, notes) {
      const n = judgeCalls.length
      judgeCalls.push({ question: q, notes: structuredClone(notes) })
      if (scenario.judgeFailure?.onCall === n) {
        return Promise.reject(scenario.judgeFailure.error)
      }
      return Promise.resolve({
        notes: Object.fromEntries(
          notes.map((note) => {
            const scripted = scenario.verdicts?.[note.path]
            return [note.path, scripted ? verdict(scripted) : { ...NONE }]
          })
        ),
        // Like the real judges, no call when there is nothing to judge.
        calls: notes.length === 0 ? [] : [call("judge")],
      })
    },
  }

  const rewriterCalls: Array<{
    question: string
    notes: Array<{ path: string; text: string }>
  }> = []
  const rewriter: Rewriter = {
    kind: "fake",
    rewrite(q, notes) {
      const n = rewriterCalls.length
      rewriterCalls.push({ question: q, notes: structuredClone(notes) })
      if (scenario.rewriterFailure)
        return Promise.reject(scenario.rewriterFailure)
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
    policy: scenario.policy ?? BASE_POLICY,
    ...(scenario.candidates === undefined
      ? {}
      : { candidates: scenario.candidates }),
  }
  return { question, deps, retrieveCalls, judgeCalls, rewriterCalls }
}

async function run(scenario: Scenario) {
  const t = setup(scenario)
  const result = await runLoop(t.question, t.deps)
  return { ...t, result }
}

async function fail(scenario: Scenario) {
  const t = setup(scenario)
  const error = await runLoop(t.question, t.deps).then(
    () => {
      throw new Error("expected runLoop to throw")
    },
    (e: unknown) => e
  )
  return { ...t, error }
}

function paths(items: Array<{ path: string }>): string[] {
  return items.map((item) => item.path)
}

function models(calls: ModelCall[]): string[] {
  return calls.map((c) => c.model)
}

function contextPaths(result: { context: Array<{ notePath: string }> }) {
  return result.context.map((c) => c.notePath)
}

function sorted(values: string[]): string[] {
  return [...values].sort()
}

describe("AC1 — noteText", () => {
  const index = fakeIndex(SECTIONS)

  test("AC1 — a preamble chunk is its text alone, a section gets a `## ` heading line", () => {
    expect(noteText(index, "a.md")).toBe("intro of a\n\n## Owner\nowner of a")
  })

  test("AC1 — sections are joined in the order of the chunks", () => {
    expect(noteText(index, "b.md")).toBe(
      "## B one\nfirst of b\n\n## B two\nsecond of b"
    )
  })

  test("AC1 — a note of one preamble chunk is that text", () => {
    expect(noteText(index, "c.md")).toBe("only c")
  })

  test("AC1 — a nested heading path is kept whole after `## `", () => {
    expect(noteText(index, "d.md")).toBe("## Plan > D\ntext of d")
  })
})

describe("AC1 — search", () => {
  test("AC1 — retrieves 50 candidates for the question by default", async () => {
    const { retrieveCalls } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9 } },
    })
    expect(retrieveCalls).toEqual([[QUESTION, 50]])
  })

  test("AC1 — retrieves the configured number of candidates", async () => {
    const { retrieveCalls } = await run({
      candidates: 7,
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9 } },
    })
    expect(retrieveCalls).toEqual([[QUESTION, 7]])
  })

  test("AC1 — lists the notes in order of first appearance of their chunks, in one judge call", async () => {
    const { judgeCalls } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["b2", "a1", "b1", "c1", "a2"] },
      verdicts: { "b.md": { answer: 0.9 } },
    })
    expect(judgeCalls).toHaveLength(1)
    expect(judgeCalls[0]!.question).toBe(QUESTION)
    expect(paths(judgeCalls[0]!.notes)).toEqual(["b.md", "a.md", "c.md"])
  })

  test("AC1 — sends each note with its path, date, text and distinct link targets", async () => {
    const { judgeCalls } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["a2", "c1"] },
      verdicts: { "a.md": { answer: 0.9 } },
    })
    const [a, c] = judgeCalls[0]!.notes
    // a links to b twice: the target is listed once.
    expect({ ...a!, links: sorted(a!.links) }).toEqual({
      path: "a.md",
      date: "2025-01-01",
      text: "intro of a\n\n## Owner\nowner of a",
      links: ["b.md", "c.md"],
    })
    expect(c).toEqual({
      path: "c.md",
      date: null,
      text: "only c",
      links: [],
    })
  })

  test("AC1 — the text holds all the sections of the note, even those not retrieved", async () => {
    const { judgeCalls } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["b2"] },
      verdicts: { "b.md": { answer: 0.9 } },
    })
    expect(judgeCalls[0]!.notes[0]!.text).toBe(
      "## B one\nfirst of b\n\n## B two\nsecond of b"
    )
  })

  test("AC1 — a new search skips the notes already judged", async () => {
    const { judgeCalls, retrieveCalls } = await run({
      world: worldOf([], { extra: ["a", "b", "c"] }),
      search: {
        [QUESTION]: hits("a", "b"),
        "new query": hits("a", "c", "b"),
      },
      rewrites: ["new query"],
    })
    expect(retrieveCalls.map(([query]) => query)).toEqual([
      QUESTION,
      "new query",
    ])
    expect(paths(judgeCalls[0]!.notes)).toEqual(["a.md", "b.md"])
    expect(paths(judgeCalls[1]!.notes)).toEqual(["c.md"])
  })
})

describe("AC2 — decide", () => {
  test("AC2 — a note with a step verdict and unjudged links is opened even when another is kept", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9, step: 0.9 } },
    })
    expect(result.steps[0]!.action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC2 — answers a kept note once the hops are used", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 0 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9, step: 0.9 } },
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(result.hops).toBe(0)
  })

  test("AC2 — a note without outgoing links is not openable", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("c") },
      verdicts: { "c.md": { answer: 0.9, step: 0.9 } },
      world: GRAPH,
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(result.hops).toBe(0)
  })

  test("AC2 — a note whose link targets are all judged is not openable (a step note is then kept: answers)", async () => {
    const { result } = await run({
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
      ]),
      search: { [QUESTION]: hits("a", "b", "c") },
      verdicts: { "a.md": { step: 0.9 } },
    })
    expect(result.steps[0]!.action).toEqual({ type: "answer", rule: "answer" })
    expect(result.hops).toBe(0)
    expect(contextPaths(result)).toEqual(["a.md"])
  })

  test("AC2 — a note whose link targets are all judged is not openable (not kept: rewrites)", async () => {
    const { result } = await run({
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
      ]),
      search: { [QUESTION]: hits("a", "b", "c") },
      verdicts: { "a.md": { step: 0.49 } },
    })
    expect(result.steps[0]!.action.rule).toBe("rewrite")
    expect(result.hops).toBe(0)
  })

  test("AC2 — explore opens the notes with unjudged links, not those already opened or without links", async () => {
    // a opened first; then b (links to d) is the only openable note, c has no
    // link and a has all its targets judged. a stays under both thresholds:
    // a step note would be kept and the policy would answer.
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.3, step: 0.4 } },
    })
    expect(result.steps[0]!.action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
    expect(result.steps[1]!.action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["b.md"],
    })
  })

  test("AC2 — passes the hops used: none left after the budget", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 1 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.3, step: 0.4 } },
    })
    expect(result.steps[0]!.action.rule).toBe("explore")
    expect(result.steps[1]!.action.rule).toBe("rewrite")
  })

  test("AC2 — a step note opened with the last hop is kept: answers with it", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 1 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 1 } },
    })
    expect(result.steps[0]!.action.rule).toBe("follow-steps")
    expect(result.steps[1]!.action).toEqual({ type: "answer", rule: "answer" })
    expect(result.hops).toBe(1)
    expect(result.rewrites).toBe(0)
    expect(contextPaths(result)).toEqual(["a.md"])
  })

  test("AC2 — passes the rewrites used: none left after the budget", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.steps.map((s) => s.action.rule)).toEqual([
      "rewrite",
      "abstain",
    ])
  })

  test("AC2 — abstains when there is no rewrite budget and nothing to open", async () => {
    const { result } = await run({
      policy: policyWith({ maxRewrites: 0 }),
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.outcome).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC2 — a note at the answer threshold is kept", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a", "b") },
      verdicts: { "a.md": { answer: 0.5 }, "b.md": { answer: 0.49 } },
    })
    expect(result.outcome.type).toBe("answer")
    expect(contextPaths(result)).toEqual(["a.md"])
  })

  test("AC2 — uses the answer threshold of the policy", async () => {
    const { result } = await run({
      policy: policyWith({}, { answer: 0.8 }),
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a", "b") },
      verdicts: { "a.md": { answer: 0.79 }, "b.md": { answer: 0.8 } },
    })
    expect(contextPaths(result)).toEqual(["b.md"])
  })

  test("AC2 — uses the step threshold of the policy", async () => {
    const lowStep = await run({
      policy: policyWith({}, { step: 0.4 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.4 } },
    })
    expect(lowStep.result.steps[0]!.action.rule).toBe("follow-steps")
    const defaultStep = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.4 } },
    })
    expect(defaultStep.result.steps[0]!.action.rule).toBe("explore")
  })
})

describe("AC3 — expand", () => {
  test("AC3 — judges the never-judged link targets of the opened note in one call and counts a hop", async () => {
    const { result, judgeCalls } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 }, "b.md": { answer: 0.9 } },
    })
    expect(judgeCalls).toHaveLength(2)
    expect(judgeCalls[1]!.question).toBe(QUESTION)
    expect(paths(judgeCalls[1]!.notes)).toEqual(["b.md", "c.md"])
    expect(result.hops).toBe(1)
    expect(result.steps[1]!.expanded).toEqual(["a.md"])
  })

  test("AC3 — sends the reached notes like the searched ones", async () => {
    const { judgeCalls } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["a1"] },
      verdicts: { "a.md": { step: 0.9 }, "b.md": { answer: 0.9 } },
    })
    const [b, c] = judgeCalls[1]!.notes
    expect(b).toEqual({
      path: "b.md",
      date: "2025-02-02",
      text: "## B one\nfirst of b\n\n## B two\nsecond of b",
      links: ["d.md"],
    })
    expect(c).toEqual({ path: "c.md", date: null, text: "only c", links: [] })
  })

  test("AC3 — does not judge a target again", async () => {
    const { result, judgeCalls } = await run({
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
      ]),
      search: { [QUESTION]: hits("a", "b") },
      verdicts: { "a.md": { step: 0.9 } },
    })
    expect(paths(judgeCalls[1]!.notes)).toEqual(["c.md"])
    expect(result.steps[1]!.parents).toEqual({ "c.md": "a.md" })
  })

  test("AC3 — a target linked by two opened notes is judged once, its parent the first note of the action", async () => {
    // e has the higher step probability, so the action lists e before a, even
    // though a was judged first.
    const { result, judgeCalls } = await run({
      world: worldOf([
        ["a", "x"],
        ["e", "x"],
      ]),
      search: { [QUESTION]: hits("a", "e") },
      verdicts: { "a.md": { step: 0.6 }, "e.md": { step: 0.9 } },
    })
    expect(result.steps[0]!.action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["e.md", "a.md"],
    })
    expect(
      judgeCalls.flatMap((c) => paths(c.notes)).filter((p) => p === "x.md")
    ).toHaveLength(1)
    expect(paths(judgeCalls[1]!.notes)).toEqual(["x.md"])
    expect(result.steps[1]!.expanded).toEqual(["e.md", "a.md"])
    expect(result.steps[1]!.parents).toEqual({ "x.md": "e.md" })
    expect(result.hops).toBe(1)
  })

  test("AC3 — an explore expand works the same way", async () => {
    const { result, judgeCalls } = await run({
      search: { [QUESTION]: hits("a") },
    })
    expect(result.steps[0]!.action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
    expect(paths(judgeCalls[1]!.notes)).toEqual(["b.md", "c.md"])
    expect(result.steps[1]!.kind).toBe("expand")
    expect(result.hops).toBeGreaterThanOrEqual(1)
  })
})

describe("AC4 — rewrite", () => {
  // Seven isolated notes judged in one turn. Score = answer + step (exact
  // binary fractions); none is kept and none is openable, so the loop rewrites.
  const isolated = worldOf([], {
    extra: ["n1", "n2", "n3", "n4", "n5", "n6", "n7"],
  })
  const verdicts = {
    "n1.md": { answer: 0.0625, step: 0.0625 }, // 0.125
    "n2.md": { answer: 0.25, step: 0.125 }, // 0.375
    "n3.md": { answer: 0.125, step: 0.25 }, // 0.375, judged after n2
    "n4.md": { answer: 0.375, step: 0.375 }, // 0.75
    "n5.md": { answer: 0.03125 }, // 0.03125
    "n6.md": { answer: 0.25, step: 0.375 }, // 0.625
    "n7.md": {}, // 0
  }

  test("AC4 — gives the rewriter the question and the 5 best notes, ties by order of judgement", async () => {
    const { rewriterCalls } = await run({
      world: isolated,
      search: { [QUESTION]: hits("n1", "n2", "n3", "n4", "n5", "n6", "n7") },
      verdicts,
    })
    expect(rewriterCalls).toHaveLength(1)
    expect(rewriterCalls[0]!.question).toBe(QUESTION)
    expect(rewriterCalls[0]!.notes).toEqual(
      ["n4", "n6", "n2", "n3", "n1"].map((stem) => ({
        path: `${stem}.md`,
        text: `text of ${stem}`,
      }))
    )
  })

  test("AC4 — gives the rewriter fewer notes when fewer were judged", async () => {
    const { rewriterCalls } = await run({
      world: isolated,
      search: { [QUESTION]: hits("n1", "n7") },
      verdicts,
    })
    expect(rewriterCalls[0]!.notes.map((n) => n.path)).toEqual([
      "n1.md",
      "n7.md",
    ])
  })

  test("AC4 — gives the note text of AC1, with its sections", async () => {
    const { rewriterCalls } = await run({
      world: SECTIONS,
      policy: policyWith({ maxHops: 0 }),
      search: { [QUESTION]: ["a1"] },
    })
    expect(rewriterCalls[0]!.notes).toEqual([
      { path: "a.md", text: "intro of a\n\n## Owner\nowner of a" },
    ])
  })

  test("AC4 — searches again with the query the rewriter returns and counts a rewrite", async () => {
    const { result, retrieveCalls } = await run({
      world: isolated,
      candidates: 9,
      search: {
        [QUESTION]: hits("n1"),
        "better query": hits("n2"),
      },
      rewrites: ["better query"],
      verdicts: { "n2.md": { answer: 0.9 } },
    })
    expect(retrieveCalls).toEqual([
      [QUESTION, 9],
      ["better query", 9],
    ])
    expect(result.rewrites).toBe(1)
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(["n2.md"])
  })

  test("AC4 — the rewritten search finds notes judged for the first time only", async () => {
    const { rewriterCalls, judgeCalls } = await run({
      world: isolated,
      search: {
        [QUESTION]: hits("n1", "n2"),
        "better query": hits("n2", "n3"),
      },
      rewrites: ["better query"],
    })
    expect(rewriterCalls).toHaveLength(1)
    expect(paths(judgeCalls[1]!.notes)).toEqual(["n3.md"])
  })
})

describe("AC5 — answer", () => {
  test("AC5 — the context item holds the note path, its date, an empty heading and the note text", async () => {
    const { result } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["a2", "c1"] },
      verdicts: { "a.md": { answer: 0.9 }, "c.md": { answer: 0.6 } },
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(result.context).toEqual([
      {
        notePath: "a.md",
        noteDate: "2025-01-01",
        heading: "",
        text: "intro of a\n\n## Owner\nowner of a",
      },
      { notePath: "c.md", noteDate: null, heading: "", text: "only c" },
    ])
  })

  test("AC5 — keeps the notes at or above the threshold, by decreasing answer probability, ties by order of judgement", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["n1", "n2", "n3", "n4", "n5"] }),
      search: { [QUESTION]: hits("n1", "n2", "n3", "n4", "n5") },
      verdicts: {
        "n1.md": { answer: 0.9 },
        "n2.md": { answer: 0.9 },
        "n3.md": { answer: 0.95 },
        "n4.md": { answer: 0.5 },
        "n5.md": { answer: 0.49 },
      },
    })
    expect(contextPaths(result)).toEqual(["n3.md", "n1.md", "n2.md", "n4.md"])
  })

  test("AC5 — a kept note is followed by its ancestors, parent first, then the parent's parent", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 3 }),
      world: worldOf([
        ["p", "q"],
        ["q", "r"],
        ["r", "s"],
      ]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { step: 0.9 },
        "q.md": { step: 0.9 },
        "r.md": { step: 0.9 },
        "s.md": { answer: 0.9 },
      },
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(result.hops).toBe(3)
    expect(contextPaths(result)).toEqual(["s.md", "r.md", "q.md", "p.md"])
  })

  test("AC5 — an ancestor already in the context is not added again", async () => {
    const { result } = await run({
      world: worldOf([
        ["p", "q"],
        ["p", "r"],
      ]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { step: 0.9 },
        "q.md": { answer: 0.9 },
        "r.md": { answer: 0.8 },
      },
    })
    expect(contextPaths(result)).toEqual(["q.md", "p.md", "r.md"])
  })

  test("AC5 — an ancestor that is itself kept appears once, at its place after its child", async () => {
    const { result } = await run({
      world: worldOf([["p", "q"]]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { answer: 0.6, step: 0.9 },
        "q.md": { answer: 0.9 },
      },
    })
    expect(contextPaths(result)).toEqual(["q.md", "p.md"])
  })

  test("AC5 — a note found by search has no ancestor", async () => {
    const { result } = await run({
      world: worldOf([["p", "q"]]),
      search: { [QUESTION]: hits("q") },
      verdicts: { "q.md": { answer: 0.9 } },
    })
    expect(contextPaths(result)).toEqual(["q.md"])
  })

  test("AC5 — cuts the context to the note budget", async () => {
    const { result } = await run({
      policy: policyWith({ maxNotes: 2 }),
      world: worldOf([], { extra: ["n1", "n2", "n3"] }),
      search: { [QUESTION]: hits("n1", "n2", "n3") },
      verdicts: {
        "n1.md": { answer: 0.7 },
        "n2.md": { answer: 0.9 },
        "n3.md": { answer: 0.8 },
      },
    })
    expect(contextPaths(result)).toEqual(["n2.md", "n3.md"])
  })

  test("AC5 — the cut applies after the ancestors are added", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 3, maxNotes: 2 }),
      world: worldOf([
        ["p", "q"],
        ["q", "r"],
        ["r", "s"],
      ]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { step: 0.9 },
        "q.md": { step: 0.9 },
        "r.md": { step: 0.9 },
        "s.md": { answer: 0.9 },
      },
    })
    expect(contextPaths(result)).toEqual(["s.md", "r.md"])
  })

  test("AC5 — the default budget keeps 5 notes", async () => {
    const stems = ["n1", "n2", "n3", "n4", "n5", "n6", "n7"]
    const { result } = await run({
      world: worldOf([], { extra: stems }),
      search: { [QUESTION]: hits(...stems) },
      verdicts: Object.fromEntries(
        stems.map((s, i) => [`${s}.md`, { answer: 0.9 - i * 0.05 }])
      ),
    })
    expect(contextPaths(result)).toEqual(
      ["n1", "n2", "n3", "n4", "n5"].map((s) => `${s}.md`)
    )
  })

  test("AC5 — abstain gives an empty context and the abstain action as outcome", async () => {
    const { result } = await run({
      policy: policyWith({ maxRewrites: 0 }),
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.context).toEqual([])
    expect(result.outcome).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — the outcome is the action of the last step", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.outcome).toEqual({ type: "abstain", rule: "abstain" })
    expect(result.outcome).toEqual(result.steps.at(-1)!.action)
  })
})

describe("AC6 — result fields", () => {
  test("AC6 — judged maps every judged note, from every turn, to its verdict probabilities", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: {
        "a.md": { step: 0.9, none: 0.1 },
        "b.md": { answer: 0.8, none: 0.2 },
      },
    })
    expect(result.judged).toEqual({
      "a.md": verdict({ step: 0.9, none: 0.1 }),
      "b.md": verdict({ answer: 0.8, none: 0.2 }),
      "c.md": NONE,
    })
  })

  test("AC6 — judged also holds the notes of a rewritten search", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a"), "rewritten 1": hits("b") },
      verdicts: { "b.md": { answer: 0.7, none: 0.3 } },
    })
    expect(Object.keys(result.judged)).toEqual(["a.md", "b.md"])
    expect(result.judged["b.md"]).toEqual(verdict({ answer: 0.7, none: 0.3 }))
  })

  test("AC6 — kept lists the kept notes in context order", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["n1", "n2", "n3"] }),
      search: { [QUESTION]: hits("n1", "n2", "n3") },
      verdicts: {
        "n1.md": { answer: 0.6 },
        "n2.md": { answer: 0.9 },
        "n3.md": { answer: 0.2 },
      },
    })
    expect(result.kept).toEqual(["n2.md", "n1.md"])
    expect(result.kept).toEqual(contextPaths(result))
  })

  test("AC6 — kept holds the ancestors and is not cut to the note budget", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 3, maxNotes: 2 }),
      world: worldOf([
        ["p", "q"],
        ["q", "r"],
        ["r", "s"],
      ]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { step: 0.9 },
        "q.md": { step: 0.9 },
        "r.md": { step: 0.9 },
        "s.md": { answer: 0.9 },
      },
    })
    expect(contextPaths(result)).toEqual(["s.md", "r.md"])
    expect(result.kept).toEqual(["s.md", "r.md", "q.md", "p.md"])
  })

  test("AC6 — kept is empty when nothing is kept", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.kept).toEqual([])
  })

  test("AC6 — frontier lists the link targets of judged notes that were never judged", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 0, maxRewrites: 0 }),
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
        ["d", "c"],
        ["d", "e"],
      ]),
      search: { [QUESTION]: hits("a", "d") },
    })
    expect(result.outcome.type).toBe("abstain")
    expect(sorted(result.frontier)).toEqual(["b.md", "c.md", "e.md"])
  })

  test("AC6 — frontier does not hold a target judged in the meantime", async () => {
    const { result } = await run({
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
        ["c", "d"],
      ]),
      search: { [QUESTION]: hits("a", "b") },
      verdicts: { "a.md": { step: 0.9 }, "c.md": { answer: 0.9 } },
    })
    // b was found by the search, c was reached through a: only d is left.
    expect(result.frontier).toEqual(["d.md"])
  })

  test("AC6 — frontier is empty when every link target was judged", async () => {
    const { result } = await run({
      world: worldOf([["a", "b"]]),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 }, "b.md": { answer: 0.9 } },
    })
    expect(result.frontier).toEqual([])
  })

  test("AC6 — frontier counts the link targets of every judged note, kept or not", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 0 }),
      world: worldOf([["a", "b"]]),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9 } },
    })
    expect(result.outcome.type).toBe("answer")
    expect(result.frontier).toEqual(["b.md"])
  })
})

describe("AC7 — trace", () => {
  test("AC7 — one step per turn with its kind, query or expanded notes, judged, parents, kept and action", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: {
        "a.md": { answer: 0.6, step: 0.9 },
        "b.md": { answer: 0.9 },
      },
    })
    expect(result.steps).toEqual([
      {
        kind: "search",
        query: QUESTION,
        judged: { "a.md": verdict({ answer: 0.6, step: 0.9 }) },
        parents: {},
        kept: ["a.md"],
        action: { type: "expand", rule: "follow-steps", paths: ["a.md"] },
      },
      {
        kind: "expand",
        expanded: ["a.md"],
        judged: { "b.md": verdict({ answer: 0.9 }), "c.md": NONE },
        parents: { "b.md": "a.md", "c.md": "a.md" },
        kept: ["b.md"],
        action: { type: "answer", rule: "answer" },
      },
    ])
  })

  test("AC7 — a rewrite turn has the kind rewrite and the new query", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a"), "new query": hits("b") },
      rewrites: ["new query"],
      verdicts: { "b.md": { answer: 0.9 } },
    })
    expect(result.steps).toEqual([
      {
        kind: "search",
        query: QUESTION,
        judged: { "a.md": NONE },
        parents: {},
        kept: [],
        action: { type: "rewrite", rule: "rewrite" },
      },
      {
        kind: "rewrite",
        query: "new query",
        judged: { "b.md": verdict({ answer: 0.9 }) },
        parents: {},
        kept: ["b.md"],
        action: { type: "answer", rule: "answer" },
      },
    ])
  })

  test("AC7 — the steps of an abstention end with the abstain action", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.steps.map((s) => s.kind)).toEqual(["search", "rewrite"])
    expect(result.steps.map((s) => s.action.rule)).toEqual([
      "rewrite",
      "abstain",
    ])
    expect(result.steps[1]!.judged).toEqual({})
  })

  test("AC7 — the kept notes of a step are those judged this turn", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: {
        "a.md": { answer: 0.6, step: 0.9 },
        "b.md": { answer: 0.9 },
      },
    })
    expect(result.steps[0]!.kept).toEqual(["a.md"])
    expect(result.steps[1]!.kept).toEqual(["b.md"])
  })

  test("AC7 — a step of an expand lists the parent of each note reached, searched notes have none", async () => {
    const { result } = await run({
      world: worldOf([
        ["a", "b"],
        ["a", "c"],
      ]),
      search: { [QUESTION]: hits("a", "b") },
      verdicts: { "a.md": { step: 0.9 } },
    })
    expect(result.steps[0]!.parents).toEqual({})
    expect(result.steps[1]!.parents).toEqual({ "c.md": "a.md" })
  })

  test("AC7 — calls holds the retrieval, judge and rewriter calls in order", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a"), "new query": hits("b") },
      rewrites: ["new query"],
      verdicts: { "b.md": { answer: 0.9 } },
    })
    expect(models(result.calls)).toEqual([
      "embed",
      "judge",
      "rewriter",
      "embed",
      "judge",
    ])
  })

  test("AC7 — calls holds the judge call of every expand", async () => {
    const { result } = await run({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 }, "b.md": { answer: 0.9 } },
    })
    expect(models(result.calls)).toEqual(["embed", "judge", "judge"])
  })
})

describe("AC11 — context with steps", () => {
  test("AC11 — the answer note and the step note that links to it, both found by the search: answer first, then step", async () => {
    const { result } = await run({
      world: worldOf([["s", "a"]]),
      // s is judged before a: the order of judgement is not the context order.
      search: { [QUESTION]: hits("s", "a") },
      verdicts: { "s.md": { step: 0.8 }, "a.md": { answer: 0.9 } },
    })
    expect(result.steps).toHaveLength(1)
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(["a.md", "s.md"])
    expect(result.kept).toEqual(["a.md", "s.md"])
  })

  test("AC11 — a context item of a step note is built like any other (path, date, empty heading, note text)", async () => {
    const { result } = await run({
      world: SECTIONS,
      search: { [QUESTION]: ["b2", "d1"] },
      verdicts: { "d.md": { answer: 0.9 }, "b.md": { step: 0.8 } },
    })
    expect(result.context).toEqual([
      {
        notePath: "d.md",
        noteDate: "2025-04-04",
        heading: "",
        text: "## Plan > D\ntext of d",
      },
      {
        notePath: "b.md",
        noteDate: "2025-02-02",
        heading: "",
        text: "## B one\nfirst of b\n\n## B two\nsecond of b",
      },
    ])
  })

  test("AC11 — a step note that links to no kept note goes after the step notes that do", async () => {
    // t (step 0.6) links to the answer note a; s (step 0.9) links to n, which
    // is not kept. s has the higher step probability but comes last.
    const { result } = await run({
      world: worldOf([
        ["s", "n"],
        ["t", "a"],
      ]),
      search: { [QUESTION]: hits("s", "t", "a", "n") },
      verdicts: {
        "s.md": { step: 0.9 },
        "t.md": { step: 0.6 },
        "a.md": { answer: 0.9 },
      },
    })
    expect(contextPaths(result)).toEqual(["a.md", "t.md", "s.md"])
    expect(result.kept).toEqual(["a.md", "t.md", "s.md"])
  })

  test("AC11 — the step notes that link to an answer note go by decreasing step probability, ties by order of judgement", async () => {
    const { result } = await run({
      world: worldOf([
        ["s1", "a"],
        ["s2", "a"],
        ["s3", "a"],
      ]),
      search: { [QUESTION]: hits("s1", "s2", "s3", "a") },
      verdicts: {
        "s1.md": { step: 0.6 },
        "s2.md": { step: 0.9 },
        "s3.md": { step: 0.6 },
        "a.md": { answer: 0.9 },
      },
    })
    expect(contextPaths(result)).toEqual(["a.md", "s2.md", "s1.md", "s3.md"])
  })

  test("AC11 — each answer note brings its own step notes, answer notes by decreasing answer then judgement order", async () => {
    // a2 and a1 tie on answer: a2 was judged first. Their step notes follow
    // them, whatever their step probability relative to each other.
    const { result } = await run({
      world: worldOf([
        ["t1", "a1"],
        ["t2", "a2"],
      ]),
      search: { [QUESTION]: hits("a2", "t1", "a1", "t2") },
      verdicts: {
        "a1.md": { answer: 0.9 },
        "a2.md": { answer: 0.9 },
        "t1.md": { step: 0.8 },
        "t2.md": { step: 0.6 },
      },
    })
    expect(contextPaths(result)).toEqual(["a2.md", "t2.md", "a1.md", "t1.md"])
  })

  test("AC11 — an ancestor comes before the step notes of the answer note; a step note that is an ancestor appears once", async () => {
    // p (step 0.9) and t (step 0.6) are found by the search and both link to
    // q. The follow-steps action lists p first, so p is q's parent.
    const { result } = await run({
      world: worldOf([
        ["p", "q"],
        ["t", "q"],
      ]),
      search: { [QUESTION]: hits("p", "t") },
      verdicts: {
        "p.md": { step: 0.9 },
        "t.md": { step: 0.6 },
        "q.md": { answer: 0.9 },
      },
    })
    expect(result.steps[0]!.action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["p.md", "t.md"],
    })
    expect(result.steps[1]!.parents).toEqual({ "q.md": "p.md" })
    expect(contextPaths(result)).toEqual(["q.md", "p.md", "t.md"])
    expect(result.kept).toEqual(["q.md", "p.md", "t.md"])
  })

  test("AC11 — a note both an answer note and a step note appears once, with the answer notes", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["r", "n", "m"] }),
      search: { [QUESTION]: hits("r", "n", "m") },
      verdicts: {
        "r.md": { step: 0.6 },
        "n.md": { answer: 0.6, step: 0.9 },
        "m.md": { answer: 0.55 },
      },
    })
    expect(contextPaths(result)).toEqual(["n.md", "m.md", "r.md"])
    expect(result.kept).toEqual(["n.md", "m.md", "r.md"])
  })

  // Isolated notes and linked pairs, judged in a scrambled order. Answer notes:
  // a1 (0.9), a2 (0.7). Step notes linked to them: u (0.5) to a1, t (0.55) to
  // a2. Free step notes: r1 (0.6), r2 (0.8), r3 (0.6). Under the thresholds:
  // v (step 0.49), w (answer 0.49).
  const full: Scenario = {
    world: worldOf(
      [
        ["u", "a1"],
        ["t", "a2"],
      ],
      { extra: ["r1", "r2", "r3", "v", "w"] }
    ),
    search: {
      [QUESTION]: hits("r1", "u", "v", "r2", "a2", "t", "w", "r3", "a1"),
    },
    verdicts: {
      "a1.md": { answer: 0.9 },
      "a2.md": { answer: 0.7 },
      "u.md": { step: 0.5 },
      "t.md": { step: 0.55 },
      "r1.md": { step: 0.6 },
      "r2.md": { step: 0.8 },
      "r3.md": { step: 0.6 },
      "v.md": { step: 0.49 },
      "w.md": { answer: 0.49 },
    },
  }
  const fullOrder = [
    "a1.md",
    "u.md",
    "a2.md",
    "t.md",
    "r2.md",
    "r1.md",
    "r3.md",
  ]

  test("AC11 — full order: answer notes each with their step notes, then the remaining step notes; notes under both thresholds left out", async () => {
    const { result } = await run({
      ...full,
      policy: policyWith({ maxNotes: 10 }),
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(fullOrder)
    expect(result.kept).toEqual(fullOrder)
  })

  test("AC11 — the cut applies after all of this, and kept is not cut", async () => {
    const { result } = await run({
      ...full,
      policy: policyWith({ maxNotes: 3 }),
    })
    expect(contextPaths(result)).toEqual(["a1.md", "u.md", "a2.md"])
    expect(result.kept).toEqual(fullOrder)
  })

  test("AC11 — the cut can fall among the remaining step notes", async () => {
    const { result } = await run({
      ...full,
      policy: policyWith({ maxNotes: 5 }),
    })
    expect(contextPaths(result)).toEqual(fullOrder.slice(0, 5))
  })

  test("AC11 — the default budget keeps 5 notes of that order", async () => {
    const { result } = await run(full)
    expect(contextPaths(result)).toEqual(fullOrder.slice(0, 5))
    expect(result.kept).toEqual(fullOrder)
  })

  test("AC11 — a loop that answers with step notes only returns them by decreasing step probability, ties by order of judgement", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["r1", "r2", "r3"] }),
      search: { [QUESTION]: hits("r1", "r2", "r3") },
      verdicts: {
        "r1.md": { step: 0.6 },
        "r2.md": { step: 0.8 },
        "r3.md": { step: 0.6 },
      },
    })
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(["r2.md", "r1.md", "r3.md"])
    expect(result.kept).toEqual(["r2.md", "r1.md", "r3.md"])
  })

  test("AC11 — step notes reached by a hop are ordered by step probability like the others", async () => {
    const { result } = await run({
      world: worldOf([["p", "q"]]),
      search: { [QUESTION]: hits("p") },
      verdicts: { "p.md": { step: 0.9 }, "q.md": { step: 0.7 } },
    })
    expect(contextPaths(result)).toEqual(["p.md", "q.md"])
  })

  test("AC11 — uses the step threshold of the policy", async () => {
    const { result } = await run({
      policy: policyWith({}, { step: 0.8 }),
      world: worldOf([], { extra: ["x", "y"] }),
      search: { [QUESTION]: hits("x", "y") },
      verdicts: { "x.md": { step: 0.79 }, "y.md": { step: 0.8 } },
    })
    expect(contextPaths(result)).toEqual(["y.md"])
    expect(result.steps[0]!.kept).toEqual(["y.md"])
  })

  test("AC11 — a step note just under the step threshold is not kept: the loop abstains", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.49, step: 0.49 } },
    })
    expect(result.outcome).toEqual({ type: "abstain", rule: "abstain" })
    expect(result.context).toEqual([])
    expect(result.kept).toEqual([])
    expect(result.steps[0]!.kept).toEqual([])
  })

  test("AC11 — a step's kept lists the answer notes and the step notes judged that turn, in order of judgement", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["n1", "s", "a", "m"] }),
      search: { [QUESTION]: hits("n1", "s", "a", "m") },
      verdicts: {
        "s.md": { step: 0.6 },
        "a.md": { answer: 0.9 },
        "m.md": { answer: 0.3, step: 0.4 },
      },
    })
    expect(result.steps[0]!.kept).toEqual(["s.md", "a.md"])
  })

  test("AC11 — a step's kept holds only the notes judged that turn", async () => {
    const { result } = await run({
      world: worldOf([
        ["p", "q"],
        ["p", "z"],
      ]),
      search: { [QUESTION]: hits("p") },
      verdicts: {
        "p.md": { step: 0.9 },
        "q.md": { step: 0.6 },
        "z.md": { answer: 0.2 },
      },
    })
    expect(result.steps[0]!.kept).toEqual(["p.md"])
    expect(result.steps[1]!.kept).toEqual(["q.md"])
    expect(result.steps[1]!.judged).toEqual({
      "q.md": verdict({ step: 0.6 }),
      "z.md": verdict({ answer: 0.2 }),
    })
  })

  test("AC11 — the kept of a rewrite turn counts its step notes", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a", "b"] }),
      search: { [QUESTION]: hits("a"), "new query": hits("b") },
      rewrites: ["new query"],
      verdicts: { "b.md": { step: 0.7 } },
    })
    expect(result.steps[0]!.kept).toEqual([])
    expect(result.steps[1]!.kept).toEqual(["b.md"])
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(["b.md"])
  })
})

describe("AC8 — termination", () => {
  test("AC8 — never opens more notes than the hop budget allows", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 1 }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.hops).toBe(1)
    expect(result.rewrites).toBe(1)
    expect(result.steps.map((s) => s.kind)).toEqual([
      "search",
      "expand",
      "rewrite",
    ])
    expect(result.outcome.type).toBe("abstain")
  })

  test("AC8 — no hop budget and nothing kept goes straight to a rewrite", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 0 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.3, step: 0.49 } },
    })
    expect(result.hops).toBe(0)
    expect(result.steps[0]!.action.rule).toBe("rewrite")
  })

  test("AC8 — no hop budget with a step note kept answers with it, without opening it", async () => {
    const { result } = await run({
      policy: policyWith({ maxHops: 0 }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 } },
    })
    expect(result.hops).toBe(0)
    expect(result.rewrites).toBe(0)
    expect(result.steps).toHaveLength(1)
    expect(result.outcome).toEqual({ type: "answer", rule: "answer" })
    expect(contextPaths(result)).toEqual(["a.md"])
  })

  test("AC8 — uses every turn the budgets allow and stops there", async () => {
    // search a, open a, open b, rewrite: 1 + 2 hops + 1 rewrite = 4 turns.
    const { result, rewriterCalls } = await run({
      search: { [QUESTION]: hits("a") },
    })
    expect(result.steps.map((s) => s.kind)).toEqual([
      "search",
      "expand",
      "expand",
      "rewrite",
    ])
    expect(result.steps.length).toBeLessThanOrEqual(1 + 2 + 1)
    expect(result.hops).toBe(2)
    expect(result.rewrites).toBe(1)
    expect(rewriterCalls).toHaveLength(1)
    expect(result.outcome).toEqual({ type: "abstain", rule: "abstain" })
    expect(result.context).toEqual([])
  })

  test("AC8 — rewrites stop at the rewrite budget", async () => {
    const { result, rewriterCalls, retrieveCalls } = await run({
      policy: policyWith({ maxRewrites: 3 }),
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
    })
    expect(result.rewrites).toBe(3)
    expect(rewriterCalls).toHaveLength(3)
    expect(retrieveCalls).toHaveLength(4)
    expect(result.steps).toHaveLength(1 + 0 + 3)
    expect(result.outcome.type).toBe("abstain")
  })

  test("AC8 — answers as soon as a note is kept, without using the remaining budget", async () => {
    const { result } = await run({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { answer: 0.9 } },
    })
    expect(result.steps).toHaveLength(1)
    expect(result.hops).toBe(0)
    expect(result.rewrites).toBe(0)
  })
})

describe("AC9 — failures keep their cost", () => {
  test("AC9 — a judge error becomes a LoopError with the message, the calls made and the steps completed", async () => {
    const { error } = await fail({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 } },
      judgeFailure: { onCall: 1, error: new Error("judge down") },
    })
    expect(error).toBeInstanceOf(LoopError)
    expect(error).toBeInstanceOf(Error)
    const loopError = error as LoopError
    expect(loopError.message).toBe("judge down")
    expect(models(loopError.calls)).toEqual(["embed", "judge"])
    expect(loopError.steps).toHaveLength(1)
    expect(loopError.steps[0]!.kind).toBe("search")
    expect(loopError.steps[0]!.action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC9 — a judge error on the first turn leaves no step and the retrieval call", async () => {
    const { error } = await fail({
      search: { [QUESTION]: hits("a") },
      judgeFailure: { onCall: 0, error: new Error("judge down") },
    })
    expect(error).toBeInstanceOf(LoopError)
    const loopError = error as LoopError
    expect(loopError.message).toBe("judge down")
    expect(models(loopError.calls)).toEqual(["embed"])
    expect(loopError.steps).toEqual([])
  })

  test("AC9 — the billed call carried by a judge error is added to the calls", async () => {
    const { error } = await fail({
      search: { [QUESTION]: hits("a") },
      verdicts: { "a.md": { step: 0.9 } },
      judgeFailure: {
        onCall: 1,
        error: new LLMCallError("bad output", call("billed")),
      },
    })
    expect(error).toBeInstanceOf(LoopError)
    const loopError = error as LoopError
    expect(loopError.message).toBe("bad output")
    expect(models(loopError.calls)).toEqual(["embed", "judge", "billed"])
    expect(loopError.steps).toHaveLength(1)
  })

  test("AC9 — a rewriter error becomes a LoopError with the calls made and the steps completed", async () => {
    const { error } = await fail({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
      rewriterFailure: new Error("rewriter down"),
    })
    expect(error).toBeInstanceOf(LoopError)
    const loopError = error as LoopError
    expect(loopError.message).toBe("rewriter down")
    expect(models(loopError.calls)).toEqual(["embed", "judge"])
    expect(loopError.steps).toHaveLength(1)
    expect(loopError.steps[0]!.action).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
  })

  test("AC9 — the billed call carried by a rewriter error is added to the calls", async () => {
    const { error } = await fail({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
      rewriterFailure: new LLMCallError("empty query", call("billed")),
    })
    expect(error).toBeInstanceOf(LoopError)
    const loopError = error as LoopError
    expect(loopError.message).toBe("empty query")
    expect(models(loopError.calls)).toEqual(["embed", "judge", "billed"])
  })

  test("AC9 — an error thrown by retrieve on the first search propagates unchanged", async () => {
    const failure = new LLMCallError("embedder down", call("billed"))
    const { error } = await fail({
      search: { [QUESTION]: hits("a") },
      retrieveFailure: { onCall: 0, error: failure },
    })
    expect(error).toBe(failure)
    expect(error).not.toBeInstanceOf(LoopError)
  })

  test("AC9 — an error thrown by retrieve on a rewrite search propagates unchanged", async () => {
    const failure = new Error("retrieve down")
    const { error, retrieveCalls, rewriterCalls } = await fail({
      world: worldOf([], { extra: ["a"] }),
      search: { [QUESTION]: hits("a") },
      rewrites: ["a better query"],
      retrieveFailure: { onCall: 1, error: failure },
    })
    expect(retrieveCalls.map(([query]) => query)).toEqual([
      QUESTION,
      "a better query",
    ])
    expect(rewriterCalls).toHaveLength(1)
    expect(error).toBe(failure)
    expect(error).not.toBeInstanceOf(LoopError)
  })
})
