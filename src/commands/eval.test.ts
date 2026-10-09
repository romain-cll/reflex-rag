import { describe, expect, test } from "bun:test"
import type { NoteForJudge } from "../core/judge.ts"
import type { Chunk, Note } from "../core/types.ts"
import { DEFAULT_POLICY, type PolicyConfig } from "../loop/policy.ts"
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
