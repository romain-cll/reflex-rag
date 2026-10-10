import { describe, expect, test } from "bun:test"
import { JudgeCallsError, type NoteForJudge } from "../core/judge.ts"
import { LLMCallError } from "../core/llm.ts"
import type { Chunk, ModelCall, Note } from "../core/types.ts"
import { DEFAULT_POLICY, type PolicyConfig } from "../loop/policy.ts"
// A namespace import, for the same reason: `POLICIES` is not exported yet.
import * as policyModule from "../loop/policy.ts"
// A namespace import: a symbol that is not exported yet fails its own tests,
// not the whole file.
import * as evalCommand from "./eval.ts"
import * as llmModule from "../models/anthropic-llm.ts"

const HAIKU = "claude-haiku-5-5"

function chunk(notePath: string, id = `${notePath}#0`): Chunk {
  return { id, notePath, heading: "", text: `text of ${id}` }
}

describe("eval-run AC9 — topNotes", () => {
  test("AC9 — returns the distinct note paths in order of first appearance", () => {
    const chunks = [
      chunk("b.md", "b.md#0"),
      chunk("a.md", "a.md#0"),
      chunk("b.md", "b.md#1"),
      chunk("c.md", "c.md#0"),
      chunk("a.md", "a.md#1"),
    ]
    expect(evalCommand.topNotes(chunks, 10)).toEqual(["b.md", "a.md", "c.md"])
  })

  test("AC9 — returns at most k notes, the first ones", () => {
    const chunks = [
      chunk("b.md", "b.md#0"),
      chunk("b.md", "b.md#1"),
      chunk("a.md"),
      chunk("c.md"),
      chunk("d.md"),
    ]
    expect(evalCommand.topNotes(chunks, 2)).toEqual(["b.md", "a.md"])
    expect(evalCommand.topNotes(chunks, 1)).toEqual(["b.md"])
  })

  test("AC9 — k counts notes, not chunks", () => {
    const chunks = [
      chunk("a.md", "a.md#0"),
      chunk("a.md", "a.md#1"),
      chunk("a.md", "a.md#2"),
      chunk("b.md"),
    ]
    expect(evalCommand.topNotes(chunks, 2)).toEqual(["a.md", "b.md"])
  })

  test("AC9 — fewer notes than k returns all of them", () => {
    expect(evalCommand.topNotes([chunk("a.md"), chunk("b.md")], 5)).toEqual([
      "a.md",
      "b.md",
    ])
  })

  test("AC9 — no chunk gives no note", () => {
    expect(evalCommand.topNotes([], 5)).toEqual([])
  })
})

describe("eval-config-b AC10 — abstentionOutput", () => {
  test("AC10 — an abstained answer naming the rule, with no value and no citation", () => {
    expect(evalCommand.abstentionOutput("abstain-nothing-relevant")).toEqual({
      status: "abstained",
      value: "",
      answer: "The retrieval loop abstained (rule abstain-nothing-relevant).",
      citations: [],
    })
  })

  test("AC10 — the sentence follows the rule it is given", () => {
    const output = evalCommand.abstentionOutput("some-other-rule")
    expect(output.answer).toBe(
      "The retrieval loop abstained (rule some-other-rule)."
    )
    expect(output.status).toBe("abstained")
  })
})

/** A note of `size` characters of text, under a path of fixed length. */
function note(index: number, size: number): NoteForJudge {
  const name = String(index).padStart(2, "0")
  return {
    path: `Notes/note-${name}.md`,
    date: "2025-03-01",
    text: "x".repeat(size),
    links: [],
  }
}

function notes(count: number, size: number): NoteForJudge[] {
  return Array.from({ length: count }, (_, index) => note(index, size))
}

function policy(
  maxHops: number,
  maxRewrites: number,
  maxNotes: number
): PolicyConfig {
  return {
    thresholds: { answer: 0.5, step: 0.5 },
    budgets: { maxHops, maxRewrites, explore: 3, maxNotes },
  }
}

const QUESTION = "Who signed the Whitmore renewal?"

describe("eval-config-b AC10 — upperBoundCalls, number and order of the calls", () => {
  test("AC10 — default policy, llm rewriter: 4 judge calls, 1 rewriter call, 1 answerer call", async () => {
    // 1 + maxHops (2) + maxRewrites (1) = 4 judge calls.
    expect(DEFAULT_POLICY.budgets.maxHops).toBe(2)
    expect(DEFAULT_POLICY.budgets.maxRewrites).toBe(1)
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    expect(calls).toHaveLength(4 + 1 + 1)
  })

  test("AC10 — the code rewriter makes no rewriter call", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "code"
    )
    expect(calls).toHaveLength(4 + 0 + 1)
  })

  test("AC10 — the count follows the hop and rewrite budgets", async () => {
    // 1 + 3 + 2 = 6 judge calls, 2 rewriter calls, 1 answerer call.
    const llm = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(5, 300),
      policy(3, 2, 5),
      "llm"
    )
    expect(llm).toHaveLength(6 + 2 + 1)
    const code = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(5, 300),
      policy(3, 2, 5),
      "code"
    )
    expect(code).toHaveLength(6 + 0 + 1)
  })

  test("AC10 — no hop and no rewrite: one judge call, then the answerer", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(5, 300),
      policy(0, 0, 5),
      "llm"
    )
    expect(calls).toHaveLength(2)
  })

  test("AC10 — every call is a Haiku call", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    for (const call of calls) expect(call.model).toBe(HAIKU)
  })

  test("AC10 — every call is priced with its full maxTokens of output plus the thinking headroom", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    for (const call of calls) {
      expect(call.outputTokens).toBeGreaterThan(0)
      expect(call.inputTokens).toBeGreaterThan(0)
    }
  })

  test("AC10 — the smallest call's output is at least the thinking headroom", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    const smallest = Math.min(...calls.map((call) => call.outputTokens))
    expect(llmModule.THINKING_HEADROOM_TOKENS).toBe(4096)
    expect(smallest).toBeGreaterThanOrEqual(llmModule.THINKING_HEADROOM_TOKENS)
  })

  test("AC10 — a judge call's output is its token budget plus the thinking headroom", async () => {
    // The judge's token budget grows by 48 per note; the headroom is a
    // constant on top, so the gap between two sizes is unchanged by it.
    const few = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(4, 400),
      DEFAULT_POLICY,
      "code"
    )
    const many = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(12, 400),
      DEFAULT_POLICY,
      "code"
    )
    expect(many[0]!.outputTokens - few[0]!.outputTokens).toBe(8 * 48)
    expect(few[0]!.outputTokens).toBeGreaterThan(
      llmModule.THINKING_HEADROOM_TOKENS + 4 * 48
    )
  })

  test("AC10 — the judge calls come first, all sized as a call on all the candidate notes", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    const judgeCalls = calls.slice(0, 4)
    for (const call of judgeCalls) {
      expect(call.inputTokens).toBe(judgeCalls[0]!.inputTokens)
      expect(call.outputTokens).toBe(judgeCalls[0]!.outputTokens)
    }
  })
})

describe("eval-config-b AC10 — upperBoundCalls, sizes", () => {
  test("AC10 — a judge call grows with the number of candidate notes, in input and in output", async () => {
    const few = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(4, 400),
      DEFAULT_POLICY,
      "code"
    )
    const many = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(12, 400),
      DEFAULT_POLICY,
      "code"
    )
    for (let turn = 0; turn < 4; turn++) {
      expect(many[turn]!.inputTokens).toBeGreaterThan(few[turn]!.inputTokens)
      // The judge's token budget is 48 tokens per note, the headroom a constant.
      expect(many[turn]!.outputTokens - few[turn]!.outputTokens).toBe(8 * 48)
    }
  })

  test("AC10 — a judge call grows with the length of the candidate notes", async () => {
    const short = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(6, 200),
      DEFAULT_POLICY,
      "code"
    )
    const long = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(6, 2000),
      DEFAULT_POLICY,
      "code"
    )
    for (let turn = 0; turn < 4; turn++) {
      expect(long[turn]!.inputTokens).toBeGreaterThan(short[turn]!.inputTokens)
    }
  })

  test("AC10 — the judge sees all the candidates, the answerer only the longest within maxNotes", async () => {
    // Two long notes and six short ones. With a budget of 2 notes, the
    // answerer sees the two long notes: changing the short ones changes
    // the judge calls and leaves the answerer call untouched.
    const long = [note(0, 3000), note(1, 3000)]
    const shortA = [2, 3, 4, 5, 6, 7].map((index) => note(index, 10))
    const shortB = [2, 3, 4, 5, 6, 7].map((index) => note(index, 100))
    const a = await evalCommand.upperBoundCalls(
      QUESTION,
      [...long, ...shortA],
      policy(2, 1, 2),
      "code"
    )
    const b = await evalCommand.upperBoundCalls(
      QUESTION,
      [...long, ...shortB],
      policy(2, 1, 2),
      "code"
    )
    expect(b[0]!.inputTokens).toBeGreaterThan(a[0]!.inputTokens)
    expect(b.at(-1)!.inputTokens).toBe(a.at(-1)!.inputTokens)
  })

  test("AC10 — the answerer call picks the longest notes wherever they stand in the candidates", async () => {
    const long = [note(0, 3000), note(1, 3000)]
    const short = [2, 3, 4, 5, 6, 7].map((index) => note(index, 10))
    const first = await evalCommand.upperBoundCalls(
      QUESTION,
      [...long, ...short],
      policy(2, 1, 2),
      "code"
    )
    const last = await evalCommand.upperBoundCalls(
      QUESTION,
      [...short, ...long],
      policy(2, 1, 2),
      "code"
    )
    expect(last.at(-1)!.inputTokens).toBe(first.at(-1)!.inputTokens)
  })

  test("AC10 — the answerer call grows with the note budget", async () => {
    const candidates = notes(8, 1000)
    const small = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      policy(2, 1, 2),
      "code"
    )
    const large = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      policy(2, 1, 5),
      "code"
    )
    expect(large.at(-1)!.inputTokens).toBeGreaterThan(small.at(-1)!.inputTokens)
  })

  test("AC10 — with fewer candidates than the note budget, the answerer sees them all", async () => {
    const two = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(2, 1000),
      policy(2, 1, 5),
      "code"
    )
    const five = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(5, 1000),
      policy(2, 1, 5),
      "code"
    )
    expect(five.at(-1)!.inputTokens).toBeGreaterThan(two.at(-1)!.inputTokens)
  })
})

describe("eval-config-b AC10 — upperBoundCalls makes no network call", () => {
  test("AC10 — resolves without any API key and with the network unreachable", async () => {
    const keys = ["ANTHROPIC_API_KEY", "MISTRAL_API_KEY"] as const
    const saved = keys.map((key) => process.env[key])
    for (const key of keys) delete process.env[key]
    try {
      const calls = await evalCommand.upperBoundCalls(
        QUESTION,
        notes(3, 200),
        DEFAULT_POLICY,
        "llm"
      )
      expect(calls.length).toBeGreaterThan(0)
    } finally {
      keys.forEach((key, index) => {
        const value = saved[index]
        if (value !== undefined) process.env[key] = value
      })
    }
  })
})

describe("eval-config-b AC11 — loopPolicy", () => {
  test("AC11 — the default policy with the note budget set to k", () => {
    const policy = evalCommand.loopPolicy(7)
    expect(policy.budgets.maxNotes).toBe(7)
    expect(policy).toEqual({
      thresholds: DEFAULT_POLICY.thresholds,
      budgets: { ...DEFAULT_POLICY.budgets, maxNotes: 7 },
    })
  })

  test("AC11 — every other setting is the default one", () => {
    expect({
      ...evalCommand.loopPolicy(2).budgets,
      maxNotes: DEFAULT_POLICY.budgets.maxNotes,
    }).toEqual(DEFAULT_POLICY.budgets)
    expect(evalCommand.loopPolicy(2).thresholds).toEqual(
      DEFAULT_POLICY.thresholds
    )
  })

  test("AC11 — DEFAULT_POLICY is not mutated, and each call returns its own policy", () => {
    const before = structuredClone(DEFAULT_POLICY)
    const small = evalCommand.loopPolicy(1)
    const large = evalCommand.loopPolicy(9)
    expect(DEFAULT_POLICY).toEqual(before)
    expect(small.budgets.maxNotes).toBe(1)
    expect(large.budgets.maxNotes).toBe(9)
    expect(small).not.toBe(DEFAULT_POLICY)
    expect(small.budgets).not.toBe(DEFAULT_POLICY.budgets)
  })
})

describe("eval-config-b AC11 — notesContext", () => {
  const chunks: Record<string, Chunk[]> = {
    "a.md": [
      { id: "a1", notePath: "a.md", heading: "", text: "intro of a" },
      { id: "a2", notePath: "a.md", heading: "Owner", text: "owner of a" },
    ],
    "b.md": [{ id: "b1", notePath: "b.md", heading: "B", text: "text of b" }],
    "c.md": [{ id: "c1", notePath: "c.md", heading: "", text: "only c" }],
  }
  const dates: Record<string, string | null> = {
    "a.md": "2025-01-01",
    "b.md": null,
    "c.md": "2025-03-03",
  }
  const index = {
    getNote(path: string): Note | null {
      const date = dates[path]
      if (date === undefined) return null
      return { path, title: path, date, summary: "", frontmatter: {} }
    },
    chunksOf: (path: string): Chunk[] => chunks[path] ?? [],
  }

  test("AC11 — one item per path, in the order of the paths", () => {
    const context = evalCommand.notesContext(index, ["c.md", "a.md", "b.md"])
    expect(context.map((item) => item.notePath)).toEqual([
      "c.md",
      "a.md",
      "b.md",
    ])
  })

  test("AC11 — each item holds the note path, its date, an empty heading and the note text", () => {
    expect(evalCommand.notesContext(index, ["a.md", "c.md"])).toEqual([
      {
        notePath: "a.md",
        noteDate: "2025-01-01",
        heading: "",
        text: "intro of a\n\n## Owner\nowner of a",
      },
      {
        notePath: "c.md",
        noteDate: "2025-03-03",
        heading: "",
        text: "only c",
      },
    ])
  })

  test("AC11 — a note without a date, or unknown to the index, has a null date", () => {
    const context = evalCommand.notesContext(index, ["b.md", "missing.md"])
    expect(context[0]!.noteDate).toBeNull()
    expect(context[1]!.noteDate).toBeNull()
    expect(context[1]!.text).toBe("")
  })

  test("AC11 — no path gives an empty context", () => {
    expect(evalCommand.notesContext(index, [])).toEqual([])
  })
})

const JEV = "jev-1.13.0"

/** The strategy of B and C's policies (system-one-judge Revision 4, retrieval-loop AC16). */
const STRATEGY = { openSteps: "above-best-answer", contextSteps: "linked" }

describe("eval-config-c AC1 — POLICIES", () => {
  test("eval-config-c AC1 — POLICIES holds the policies of B and C", () => {
    expect(Object.keys(policyModule.POLICIES).sort()).toEqual(["B", "C"])
  })

  test("eval-config-c AC1 — B is DEFAULT_POLICY plus the strategy and the sufficient threshold, in value", () => {
    expect(policyModule.POLICIES.B as unknown).toEqual({
      ...DEFAULT_POLICY,
      thresholds: { ...DEFAULT_POLICY.thresholds, sufficient: 0.5 },
      strategy: STRATEGY,
    })
  })

  test("eval-config-c AC14 — C has the budgets of DEFAULT_POLICY, the thresholds answer 0.7, step 0.7, keep 0.9 and sufficient 0.5, and the strategy", () => {
    expect(policyModule.POLICIES.C as unknown).toEqual({
      thresholds: { answer: 0.7, step: 0.7, keep: 0.9, sufficient: 0.5 },
      budgets: DEFAULT_POLICY.budgets,
      strategy: STRATEGY,
    })
    expect(policyModule.POLICIES.C.budgets).toEqual({
      maxHops: 2,
      maxRewrites: 1,
      explore: 3,
      maxNotes: 5,
    })
  })

  test("eval-config-c AC14 — the policy of C is not the object of DEFAULT_POLICY, and DEFAULT_POLICY keeps its thresholds", () => {
    expect(policyModule.POLICIES.C).not.toBe(DEFAULT_POLICY)
    expect(policyModule.POLICIES.C.thresholds).not.toBe(
      DEFAULT_POLICY.thresholds
    )
    expect(DEFAULT_POLICY.thresholds).toEqual({ answer: 0.5, step: 0.5 })
  })

  test("eval-config-c AC14 — loopPolicy(k, POLICIES.C) carries the thresholds of C", () => {
    expect(
      evalCommand.loopPolicy(6, policyModule.POLICIES.C) as unknown
    ).toEqual({
      thresholds: { answer: 0.7, step: 0.7, keep: 0.9, sufficient: 0.5 },
      budgets: { maxHops: 2, maxRewrites: 1, explore: 3, maxNotes: 6 },
      strategy: STRATEGY,
    })
  })

  test("eval-config-c AC1 — DEFAULT_POLICY is left as it was", () => {
    expect(DEFAULT_POLICY).toEqual({
      thresholds: { answer: 0.5, step: 0.5 },
      budgets: { maxHops: 2, maxRewrites: 1, explore: 3, maxNotes: 5 },
    })
  })
})

describe("eval-config-c AC1 — loopPolicy with a policy", () => {
  const custom: PolicyConfig = {
    thresholds: { answer: 0.7, step: 0.3 },
    budgets: { maxHops: 4, maxRewrites: 3, explore: 6, maxNotes: 9 },
  }

  test("eval-config-c AC1 — the policy given, with the note budget set to k", () => {
    expect(evalCommand.loopPolicy(4, custom)).toEqual({
      thresholds: { answer: 0.7, step: 0.3 },
      budgets: { maxHops: 4, maxRewrites: 3, explore: 6, maxNotes: 4 },
    })
  })

  test("eval-config-c AC1 — the policy given is not mutated", () => {
    const before = structuredClone(custom)
    evalCommand.loopPolicy(2, custom)
    expect(custom).toEqual(before)
  })

  test("eval-config-c AC1 — without a second argument, the default policy as before", () => {
    expect(evalCommand.loopPolicy(7)).toEqual(
      evalCommand.loopPolicy(7, DEFAULT_POLICY)
    )
    expect(evalCommand.loopPolicy(7).budgets.maxHops).toBe(
      DEFAULT_POLICY.budgets.maxHops
    )
  })

  test("eval-config-c AC1 — the policy of config C, with k", () => {
    expect(evalCommand.loopPolicy(3, policyModule.POLICIES.C)).toEqual({
      thresholds: policyModule.POLICIES.C.thresholds,
      budgets: { ...policyModule.POLICIES.C.budgets, maxNotes: 3 },
      strategy: policyModule.POLICIES.C.strategy,
    })
  })
})

/** The calls of one question that go to the system one: the ones of Jev. */
function systemOneCalls(calls: ModelCall[]): ModelCall[] {
  return calls.filter((call) => call.model === JEV)
}

describe("eval-config-c AC16 — upperBoundCallsC, number and order of the calls", () => {
  test("eval-config-c AC16 — default policy, llm rewriter: one system-one call per turn (4), then the fallback, the rewriter and the answerer", async () => {
    // 4 turns (1 + maxHops 2 + maxRewrites 1), each one batch of 8 notes.
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "llm"
    )
    expect(calls).toHaveLength(4 + (4 + 1 + 1))
    expect(systemOneCalls(calls)).toHaveLength(4)
  })

  test("eval-config-c AC16 — the code rewriter makes no rewriter call", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(8, 400),
      DEFAULT_POLICY,
      "code"
    )
    expect(calls).toHaveLength(4 + (4 + 0 + 1))
  })

  test("eval-config-c AC16 — the count follows the hop and rewrite budgets, not the number of notes", async () => {
    // 1 + 3 + 2 = 6 turns, then 6 + 2 + 1 calls.
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(5, 300),
      policy(3, 2, 5),
      "llm"
    )
    expect(systemOneCalls(calls)).toHaveLength(6)
    expect(calls).toHaveLength(6 + (6 + 2 + 1))
  })

  test("eval-config-c AC16 — the number of system-one calls does not depend on the number of notes", async () => {
    for (const count of [1, 2, 12, 30]) {
      const calls = await evalCommand.upperBoundCallsC(
        QUESTION,
        notes(count, 200),
        DEFAULT_POLICY,
        "code"
      )
      expect(systemOneCalls(calls)).toHaveLength(4)
    }
  })

  test("eval-config-c AC16 — no hop and no rewrite: one turn, one call", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(5, 300),
      policy(0, 0, 5),
      "llm"
    )
    expect(systemOneCalls(calls)).toHaveLength(1)
    expect(calls).toHaveLength(1 + 2)
  })

  test("eval-config-c AC16 — the system-one calls come first", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(6, 400),
      DEFAULT_POLICY,
      "llm"
    )
    for (const call of calls.slice(0, 4)) expect(call.model).toBe(JEV)
    for (const call of calls.slice(4)) expect(call.model).toBe(HAIKU)
  })

  test("eval-config-c AC16 — after them, exactly the calls of the worst-case fallback, rewriter and answerer", async () => {
    for (const rewriter of ["llm", "code"] as const) {
      const candidates = notes(7, 600)
      const calls = await evalCommand.upperBoundCallsC(
        QUESTION,
        candidates,
        DEFAULT_POLICY,
        rewriter
      )
      const expected = await evalCommand.upperBoundCalls(
        QUESTION,
        candidates,
        DEFAULT_POLICY,
        rewriter
      )
      expect(calls.slice(4)).toEqual(expected)
    }
  })

  test("eval-config-c AC16 — no candidate note: no system-one call, only the rest", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      [],
      DEFAULT_POLICY,
      "llm"
    )
    expect(systemOneCalls(calls)).toHaveLength(0)
    expect(calls).toEqual(
      await evalCommand.upperBoundCalls(QUESTION, [], DEFAULT_POLICY, "llm")
    )
  })
})

describe("eval-config-c AC16 — upperBoundCallsC, sizes", () => {
  test("eval-config-c AC16 — a system-one call is a Jev call with no output and some input", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(6, 400),
      DEFAULT_POLICY,
      "llm"
    )
    const jev = systemOneCalls(calls)
    expect(jev).toHaveLength(4)
    for (const call of jev) {
      expect(call.model).toBe("jev-1.13.0")
      expect(call.outputTokens).toBe(0)
      expect(call.inputTokens).toBeGreaterThan(0)
    }
  })

  test("eval-config-c AC16 — a system-one call grows with the length of the notes", async () => {
    const short = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(6, 200),
      DEFAULT_POLICY,
      "code"
    )
    const long = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(6, 2000),
      DEFAULT_POLICY,
      "code"
    )
    const shortInputs = systemOneCalls(short).map((call) => call.inputTokens)
    const longInputs = systemOneCalls(long).map((call) => call.inputTokens)
    expect(shortInputs).toHaveLength(4)
    expect(longInputs).toHaveLength(4)
    expect(Math.min(...longInputs)).toBeGreaterThan(Math.max(...shortInputs))
  })

  test("eval-config-c AC16 — a system-one call grows with the number of notes: one batch holds them all", async () => {
    const few = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(2, 400),
      DEFAULT_POLICY,
      "code"
    )
    const many = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(10, 400),
      DEFAULT_POLICY,
      "code"
    )
    const fewInputs = systemOneCalls(few).map((call) => call.inputTokens)
    const manyInputs = systemOneCalls(many).map((call) => call.inputTokens)
    expect(fewInputs).toHaveLength(4)
    expect(manyInputs).toHaveLength(4)
    expect(Math.min(...manyInputs)).toBeGreaterThan(Math.max(...fewInputs))
  })

  test("eval-config-c AC16 — a batch of ten notes weighs about five times a batch of two (it is not one call per note)", async () => {
    const two = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(2, 4000),
      policy(0, 0, 5),
      "code"
    )
    const ten = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(10, 4000),
      policy(0, 0, 5),
      "code"
    )
    const [small] = systemOneCalls(two)
    const [large] = systemOneCalls(ten)
    expect(large!.inputTokens / small!.inputTokens).toBeGreaterThan(3.5)
    expect(large!.inputTokens / small!.inputTokens).toBeLessThan(5.5)
  })

  test("eval-config-c AC16 — the turns are alike: every system-one call has the size of the batch", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      [note(0, 100), note(1, 4000)],
      DEFAULT_POLICY,
      "code"
    )
    const inputs = systemOneCalls(calls).map((call) => call.inputTokens)
    expect(inputs).toHaveLength(4)
    // The batch holds the long note: far above one short note alone.
    expect(Math.min(...inputs)).toBeGreaterThan(1000)
  })
})

describe("eval-config-c AC16 — upperBoundCallsC makes no network call", () => {
  test("eval-config-c AC16 — resolves without any API key", async () => {
    const keys = [
      "ANTHROPIC_API_KEY",
      "MISTRAL_API_KEY",
      "TYPESAFE_API_KEY",
    ] as const
    const saved = keys.map((key) => process.env[key])
    for (const key of keys) delete process.env[key]
    try {
      const calls = await evalCommand.upperBoundCallsC(
        QUESTION,
        notes(3, 200),
        DEFAULT_POLICY,
        "llm"
      )
      expect(calls.length).toBeGreaterThan(0)
    } finally {
      keys.forEach((key, index) => {
        const value = saved[index]
        if (value !== undefined) process.env[key] = value
      })
    }
  })
})

// ---------------------------------------------------------------------------
// eval-config-c, revision 2
// ---------------------------------------------------------------------------

/** The settings a run is parsed into (`EvalSettings`, which is not exported). */
const SETTINGS = {
  split: "tuning",
  limit: null,
  k: 4,
  maxCostUsd: 1,
  dryRun: false,
  rewrite: "llm",
  candidates: 30,
  systemOne: "clef",
  fallback: 0.6,
  fallbackWhen: "uncertain",
} as const

describe("eval-config-c AC10 — loopSettings, config B", () => {
  test("eval-config-c AC10 — the models of B: the judge, the rewriter and the answerer are the Haiku client", () => {
    const { models } = evalCommand.loopSettings("B", SETTINGS)
    expect(models).toEqual({ judge: HAIKU, rewriter: HAIKU, answerer: HAIKU })
  })

  test("eval-config-c AC10 — the loop of B: the policy used with k, the rewriter and the candidates", () => {
    const { loop } = evalCommand.loopSettings("B", SETTINGS)
    expect(loop).toEqual({
      policy: evalCommand.loopPolicy(4, policyModule.POLICIES.B),
      rewriter: "llm",
      candidates: 30,
    })
    expect(loop.policy.budgets.maxNotes).toBe(4)
  })

  test("eval-config-c AC18 — B records the strategy of its policy and no veto", () => {
    const { loop } = evalCommand.loopSettings("B", SETTINGS)
    expect((loop.policy as unknown as { strategy: unknown }).strategy).toEqual(
      STRATEGY
    )
    expect("veto" in loop).toBe(false)
  })

  test("eval-config-c AC10 — B has no fallback model and no fallback or system-one setting, whatever the settings hold", () => {
    const { models, loop } = evalCommand.loopSettings("B", SETTINGS)
    expect(Object.keys(models).sort()).toEqual([
      "answerer",
      "judge",
      "rewriter",
    ])
    expect(Object.keys(loop).sort()).toEqual([
      "candidates",
      "policy",
      "rewriter",
    ])
  })

  test("eval-config-c AC10 — B ignores a system-one model if one is given", () => {
    const { models } = evalCommand.loopSettings("B", SETTINGS, "clef-flash")
    expect(models.judge).toBe(HAIKU)
    expect("fallback" in models).toBe(false)
  })

  test("eval-config-c AC10 — the code rewriter: no model, and the rewriter named in the loop", () => {
    const { models, loop } = evalCommand.loopSettings("B", {
      ...SETTINGS,
      rewrite: "code",
    })
    expect(models.rewriter).toBe("none")
    expect(loop.rewriter).toBe("code")
    expect(models.judge).toBe(HAIKU)
  })

  test("eval-config-c AC10 — k and the candidates come from the settings", () => {
    const { loop } = evalCommand.loopSettings("B", {
      ...SETTINGS,
      k: 9,
      candidates: 12,
    })
    expect(loop.policy.budgets.maxNotes).toBe(9)
    expect(loop.candidates).toBe(12)
  })
})

describe("eval-config-c AC10 — loopSettings, config C", () => {
  test("eval-config-c AC10 — the models of C: the judge is the system-one model, the fallback is the Haiku client", () => {
    const { models } = evalCommand.loopSettings("C", SETTINGS, "clef-flash")
    expect(models).toEqual({
      judge: "clef-flash",
      fallback: HAIKU,
      rewriter: HAIKU,
      answerer: HAIKU,
    })
  })

  test("eval-config-c AC10 — the judge follows the system-one model it is given", () => {
    const { models } = evalCommand.loopSettings(
      "C",
      { ...SETTINGS, systemOne: "jev" },
      JEV
    )
    expect(models.judge).toBe(JEV)
    expect(models.fallback).toBe(HAIKU)
  })

  test("eval-config-c AC15 — the loop of C: the policy of C with k, the rewriter, the candidates, the lower bound of the grey zone and the system one", () => {
    const { loop } = evalCommand.loopSettings("C", SETTINGS, "clef-flash")
    expect(loop as unknown).toEqual({
      policy: evalCommand.loopPolicy(4, policyModule.POLICIES.C),
      rewriter: "llm",
      candidates: 30,
      veto: { none: 0.7, best: 0.02 },
      fallbackLow: 0.6,
      fallbackWhen: "uncertain",
      systemOne: "clef",
    })
    expect("fallbackThreshold" in loop).toBe(false)
    expect({ ...loop.policy.thresholds }).toEqual({
      answer: 0.7,
      step: 0.7,
      keep: 0.9,
      sufficient: 0.5,
    })
  })

  test("eval-config-c AC18 — C records the veto { none: 0.7, best: 0.02 } and the strategy of its policy", () => {
    const { loop } = evalCommand.loopSettings("C", SETTINGS, "clef-flash")
    const recorded = loop as unknown as {
      veto: unknown
      policy: { strategy: unknown }
    }
    expect(recorded.veto).toEqual({ none: 0.7, best: 0.02 })
    expect(recorded.policy.strategy).toEqual(STRATEGY)
  })

  test("eval-config-c AC17 — the fallback scope follows the settings: fallbackLow and fallbackWhen are recorded", () => {
    const { loop } = evalCommand.loopSettings(
      "C",
      { ...SETTINGS, fallback: 0.8, fallbackWhen: "nothing-kept" },
      JEV
    )
    const recorded = loop as unknown as {
      fallbackLow: number
      fallbackWhen: string
    }
    expect(recorded.fallbackLow).toBe(0.8)
    expect(recorded.fallbackWhen).toBe("nothing-kept")
  })

  test("eval-config-c AC17 — B records no fallbackWhen, whatever the settings hold", () => {
    const { loop } = evalCommand.loopSettings("B", {
      ...SETTINGS,
      fallbackWhen: "nothing-kept",
    })
    expect("fallbackWhen" in loop).toBe(false)
    expect("fallbackLow" in loop).toBe(false)
  })

  test("eval-config-c AC15 — the lower bound of the grey zone and the system-one kind follow the settings", () => {
    const { loop } = evalCommand.loopSettings(
      "C",
      { ...SETTINGS, fallback: 0.25, systemOne: "jev" },
      JEV
    )
    expect((loop as unknown as { fallbackLow: number }).fallbackLow).toBe(0.25)
    expect(loop.systemOne).toBe("jev")
  })

  test("eval-config-c AC10 — the code rewriter in C", () => {
    const { models, loop } = evalCommand.loopSettings(
      "C",
      { ...SETTINGS, rewrite: "code" },
      "clef-flash"
    )
    expect(models.rewriter).toBe("none")
    expect(models.fallback).toBe(HAIKU)
    expect(loop.rewriter).toBe("code")
  })

  test("eval-config-c AC10 — the settings given are not mutated", () => {
    const before = structuredClone(SETTINGS)
    evalCommand.loopSettings("C", SETTINGS, "clef-flash")
    evalCommand.loopSettings("B", SETTINGS)
    expect(SETTINGS).toEqual(before)
  })
})

function modelCall(model: string, role?: ModelCall["role"]): ModelCall {
  return {
    model,
    inputTokens: 10,
    outputTokens: 5,
    latencyMs: 1,
    ...(role ? { role } : {}),
  }
}

/** The error a promise rejects with; fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("expected the promise to reject")
}

describe("eval-config-c AC11 — withRole", () => {
  test("eval-config-c AC11 — sets the role of the calls that have none", () => {
    const calls = [modelCall("a"), modelCall("b")]
    expect(evalCommand.withRole(calls, "judge")).toEqual([
      modelCall("a", "judge"),
      modelCall("b", "judge"),
    ])
  })

  test("eval-config-c AC11 — keeps the role a call already has", () => {
    const calls = [modelCall("a", "embed"), modelCall("b")]
    expect(evalCommand.withRole(calls, "rewrite")).toEqual([
      modelCall("a", "embed"),
      modelCall("b", "rewrite"),
    ])
  })

  test("eval-config-c AC11 — returns new objects and leaves its input as it was", () => {
    const calls = [modelCall("a"), modelCall("b", "fallback")]
    const before = structuredClone(calls)
    const tagged = evalCommand.withRole(calls, "answer")
    expect(calls).toEqual(before)
    expect(tagged).not.toBe(calls)
    tagged.forEach((call, index) => expect(call).not.toBe(calls[index]))
  })

  test("eval-config-c AC11 — no call gives no call", () => {
    expect(evalCommand.withRole([], "judge")).toEqual([])
  })
})

describe("eval-config-c AC11 — roleTagged, results", () => {
  test("eval-config-c AC11 — tags the calls of the result, keeps the rest of it", async () => {
    const result = await evalCommand.roleTagged("judge", () =>
      Promise.resolve({
        verdicts: ["v1"],
        calls: [modelCall("a"), modelCall("b", "embed")],
      })
    )
    expect(result).toEqual({
      verdicts: ["v1"],
      calls: [modelCall("a", "judge"), modelCall("b", "embed")],
    })
  })

  test("eval-config-c AC11 — tags the call of the result", async () => {
    const result = await evalCommand.roleTagged("answer", () =>
      Promise.resolve({ output: "text", call: modelCall("a") })
    )
    expect(result).toEqual({ output: "text", call: modelCall("a", "answer") })
  })

  test("eval-config-c AC11 — a result without a billed call (call null) stays as it is", async () => {
    const result = await evalCommand.roleTagged("answer", () =>
      Promise.resolve({ output: "abstained", call: null })
    )
    expect(result).toEqual({ output: "abstained", call: null })
  })

  test("eval-config-c AC11 — a result with a call and calls has both tagged", async () => {
    const result = await evalCommand.roleTagged("rewrite", () =>
      Promise.resolve({
        call: modelCall("a"),
        calls: [modelCall("b")],
      })
    )
    expect(result).toEqual({
      call: modelCall("a", "rewrite"),
      calls: [modelCall("b", "rewrite")],
    })
  })

  test("eval-config-c AC11 — runs fn once, and does not mutate the calls fn returned", async () => {
    const calls = [modelCall("a")]
    let runs = 0
    await evalCommand.roleTagged("judge", () => {
      runs++
      return Promise.resolve({ calls })
    })
    expect(runs).toBe(1)
    expect(calls).toEqual([modelCall("a")])
  })
})

describe("eval-config-c AC11 — roleTagged, failures", () => {
  test("eval-config-c AC11 — rethrows an LLMCallError with the same message, its billed call carrying the role", async () => {
    const error = await rejection(
      evalCommand.roleTagged("judge", () =>
        Promise.reject(new LLMCallError("invalid JSON", modelCall("a")))
      )
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect((error as LLMCallError).message).toBe("invalid JSON")
    expect((error as LLMCallError).call).toEqual(modelCall("a", "judge"))
  })

  test("eval-config-c AC11 — the billed call of an LLMCallError keeps the role it had", async () => {
    const error = await rejection(
      evalCommand.roleTagged("judge", () =>
        Promise.reject(new LLMCallError("refused", modelCall("a", "fallback")))
      )
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect((error as LLMCallError).call.role).toBe("fallback")
  })

  test("eval-config-c AC11 — tags the calls of an error that carries calls", async () => {
    const error = await rejection(
      evalCommand.roleTagged("rewrite", () =>
        Promise.reject(
          new JudgeCallsError("batch failed", [
            modelCall("a"),
            modelCall("b", "judge"),
          ])
        )
      )
    )
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("batch failed")
    expect((error as JudgeCallsError).calls).toEqual([
      modelCall("a", "rewrite"),
      modelCall("b", "judge"),
    ])
  })

  test("eval-config-c AC11 — another error is rethrown unchanged", async () => {
    const original = new Error("network down")
    const error = await rejection(
      evalCommand.roleTagged("answer", () => Promise.reject(original))
    )
    expect(error).toBe(original)
  })

  test("eval-config-c AC11 — a value that is not an Error is rethrown as it is", async () => {
    const error = await rejection(
      evalCommand.roleTagged("answer", () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        Promise.reject("plain string")
      )
    )
    expect(error).toBe("plain string")
  })
})

// ---------------------------------------------------------------------------
// eval-config-c, revision 6
// ---------------------------------------------------------------------------

/** `policy` with the sufficient threshold, which `PolicyConfig` does not know yet. */
function asking(base: PolicyConfig, sufficient = 0.5): PolicyConfig {
  const sufficiency = { sufficient }
  return { ...base, thresholds: { ...base.thresholds, ...sufficiency } }
}

/** The thresholds of a policy as a plain record. */
function thresholdsOf(config: PolicyConfig): Record<string, number> {
  return { ...config.thresholds }
}

describe("eval-config-c AC19 — the settings record the sufficient threshold", () => {
  test("eval-config-c AC19 — B records thresholds.sufficient 0.5 in its policy", () => {
    const { loop } = evalCommand.loopSettings("B", SETTINGS)
    expect(thresholdsOf(loop.policy)["sufficient"]).toBe(0.5)
  })

  test("eval-config-c AC19 — C records thresholds.sufficient 0.5 next to its keep threshold", () => {
    const { loop } = evalCommand.loopSettings("C", SETTINGS, "clef-flash")
    expect(thresholdsOf(loop.policy)).toEqual({
      answer: 0.7,
      step: 0.7,
      keep: 0.9,
      sufficient: 0.5,
    })
  })

  test("eval-config-c AC19 — the policy recorded is the one the run uses, with k", () => {
    for (const config of ["B", "C"] as const) {
      const { loop } = evalCommand.loopSettings(config, SETTINGS, JEV)
      expect(loop.policy).toEqual(
        evalCommand.loopPolicy(4, policyModule.POLICIES[config])
      )
    }
  })

  test("eval-config-c AC19 — DEFAULT_POLICY still has no sufficient threshold", () => {
    expect("sufficient" in DEFAULT_POLICY.thresholds).toBe(false)
    expect("sufficient" in evalCommand.loopPolicy(3).thresholds).toBe(false)
  })
})

describe("eval-config-c AC19 — upperBoundCalls sizes the judge asked for sufficiency", () => {
  const withSufficiency = asking(DEFAULT_POLICY)

  test("eval-config-c AC19 — resolves when the policy asks for sufficiency (the recording LLM accepts the judge's schema)", async () => {
    const calls = await evalCommand.upperBoundCalls(
      QUESTION,
      notes(6, 400),
      withSufficiency,
      "llm"
    )
    expect(calls).toHaveLength(4 + 1 + 1)
  })

  test("eval-config-c AC19 — each judge call has 16 more output tokens than without sufficiency", async () => {
    const candidates = notes(6, 400)
    const plain = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "code"
    )
    const asked = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      withSufficiency,
      "code"
    )
    expect(asked).toHaveLength(plain.length)
    for (let turn = 0; turn < 4; turn++) {
      expect(asked[turn]!.outputTokens - plain[turn]!.outputTokens).toBe(16)
    }
  })

  test("eval-config-c AC19 — each judge call has a longer prompt than without sufficiency", async () => {
    const candidates = notes(6, 400)
    const plain = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "code"
    )
    const asked = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      withSufficiency,
      "code"
    )
    for (let turn = 0; turn < 4; turn++) {
      expect(asked[turn]!.inputTokens).toBeGreaterThan(plain[turn]!.inputTokens)
    }
  })

  test("eval-config-c AC19 — the rewriter and the answerer calls are sized as before", async () => {
    const candidates = notes(6, 400)
    const plain = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "llm"
    )
    const asked = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      withSufficiency,
      "llm"
    )
    expect(asked.slice(4)).toEqual(plain.slice(4))
  })

  test("eval-config-c AC19 — the size follows the threshold being set, not its value", async () => {
    const candidates = notes(5, 300)
    const half = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      asking(DEFAULT_POLICY, 0.5),
      "code"
    )
    const other = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      asking(DEFAULT_POLICY, 0.3),
      "code"
    )
    expect(other).toEqual(half)
  })

  test("eval-config-c AC19 — the policy of B sizes its judge with sufficiency, the default policy does not", async () => {
    const candidates = notes(6, 400)
    const b = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      evalCommand.loopPolicy(5, policyModule.POLICIES.B),
      "code"
    )
    const plain = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      evalCommand.loopPolicy(5, DEFAULT_POLICY),
      "code"
    )
    expect(b[0]!.outputTokens - plain[0]!.outputTokens).toBe(16)
  })
})

describe("eval-config-c AC19 — upperBoundCallsC sizes the system-one request with the sufficient question", () => {
  const withSufficiency = asking(DEFAULT_POLICY)

  test("eval-config-c AC19 — every system-one call is larger than without sufficiency, by about the question", async () => {
    const candidates = notes(6, 400)
    const plain = await evalCommand.upperBoundCallsC(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "code"
    )
    const asked = await evalCommand.upperBoundCallsC(
      QUESTION,
      candidates,
      withSufficiency,
      "code"
    )
    const before = systemOneCalls(plain)
    const after = systemOneCalls(asked)
    expect(after).toHaveLength(before.length)
    expect(after).toHaveLength(4)
    for (let turn = 0; turn < 4; turn++) {
      // The instructions alone are 150 characters, 38 tokens at 4 per token.
      expect(
        after[turn]!.inputTokens - before[turn]!.inputTokens
      ).toBeGreaterThanOrEqual(38)
      expect(after[turn]!.outputTokens).toBe(0)
    }
  })

  test("eval-config-c AC19 — the number and the order of the calls are those of the policy without sufficiency", async () => {
    const calls = await evalCommand.upperBoundCallsC(
      QUESTION,
      notes(6, 400),
      withSufficiency,
      "llm"
    )
    expect(calls).toHaveLength(4 + (4 + 1 + 1))
    for (const call of calls.slice(0, 4)) expect(call.model).toBe(JEV)
    for (const call of calls.slice(4)) expect(call.model).toBe(HAIKU)
  })

  test("eval-config-c AC19 — C's fallback is not asked for sufficiency: its calls are those of the judge without it", async () => {
    const candidates = notes(6, 400)
    const asked = await evalCommand.upperBoundCallsC(
      QUESTION,
      candidates,
      withSufficiency,
      "llm"
    )
    const fallback = await evalCommand.upperBoundCalls(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "llm"
    )
    expect(asked.slice(4)).toEqual(fallback)
  })

  test("eval-config-c AC19 — without the threshold, the system-one calls are unchanged", async () => {
    const candidates = notes(6, 400)
    const first = await evalCommand.upperBoundCallsC(
      QUESTION,
      candidates,
      DEFAULT_POLICY,
      "code"
    )
    const second = await evalCommand.upperBoundCallsC(
      QUESTION,
      candidates,
      { ...DEFAULT_POLICY },
      "code"
    )
    expect(second).toEqual(first)
  })
})
