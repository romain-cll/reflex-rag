import { describe, expect, test } from "bun:test"
import {
  LLMCallError,
  type LLM,
  type LLMJsonResponse,
  type LLMRequest,
  type LLMResponse,
} from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { CodeRewriter, LLMRewriter } from "./rewriter.ts"

const QUESTION = "Who owns the Borealis budget?"

function note(path: string, text: string): { path: string; text: string } {
  return { path, text }
}

/** "saw Zephyr and saw Zephyr": the term repeated `count` times, never first in a sentence. */
function mentions(term: string, count: number): string {
  return Array.from({ length: count }, () => `saw ${term}`).join(" and ")
}

describe("AC10 — CodeRewriter", () => {
  // Frequencies: Zephyr 8, Quokka 7, Marta 6, Pavel 5, Quartz 4, Lumen 3,
  // Harbor 2, Tundra 1. Borealis (9) is in the question.
  const notes = [
    note(
      "first.md",
      [
        mentions("Zephyr", 5),
        mentions("Quokka", 4),
        mentions("Marta", 3),
        mentions("Pavel", 2),
        mentions("Borealis", 9),
      ].join(" and ") + "."
    ),
    note(
      "second.md",
      [
        mentions("Zephyr", 3),
        mentions("Quokka", 3),
        mentions("Marta", 3),
        mentions("Pavel", 3),
        mentions("Quartz", 4),
        mentions("Lumen", 3),
        mentions("Harbor", 2),
        mentions("Tundra", 1),
      ].join(" and ") + ", all of it lowercase otherwise."
    ),
  ]

  test("AC10 — makes no model call", async () => {
    const { calls } = await new CodeRewriter().rewrite(QUESTION, notes)
    expect(calls).toEqual([])
  })

  test("AC10 — has a kind", () => {
    expect(new CodeRewriter().kind).toBeString()
    expect(new CodeRewriter().kind).not.toBe("")
  })

  test("AC10 — the query starts with the question", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, notes)
    expect(query.startsWith(QUESTION)).toBe(true)
  })

  test("AC10 — adds at most 6 terms, the most frequent ones across the notes", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, notes)
    const terms = query
      .slice(QUESTION.length)
      .split(/[\s,]+/)
      .filter((t) => t !== "")
    expect(terms).toEqual([
      "Zephyr",
      "Quokka",
      "Marta",
      "Pavel",
      "Quartz",
      "Lumen",
    ])
    expect(query).not.toContain("Harbor")
    expect(query).not.toContain("Tundra")
  })

  test("AC10 — skips the terms already in the question", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, notes)
    // Borealis is the most frequent capitalized word of the notes (9) but it
    // is in the question: it appears once, from the question itself.
    expect(query.split("Borealis")).toHaveLength(2)
  })

  test("AC10 — ties are broken by order of first appearance", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, [
      note("one.md", `${mentions("Orion", 2)} and ${mentions("Atlas", 2)}.`),
      note("two.md", `${mentions("Nova", 2)} and ${mentions("Cedar", 1)}.`),
    ])
    expect(
      query
        .slice(QUESTION.length)
        .trim()
        .split(/[\s,]+/)
    ).toEqual(["Orion", "Atlas", "Nova", "Cedar"])
  })

  test("AC10 — a capitalized phrase is one term", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, [
      note("people.md", `${mentions("Marta Keller", 2)}.`),
    ])
    expect(query).toBe(`${QUESTION} Marta Keller`)
  })

  test("AC10 — adds every term when there are fewer than 6", async () => {
    const { query } = await new CodeRewriter().rewrite(QUESTION, [
      note("small.md", `${mentions("Marta", 2)} and ${mentions("Pavel", 1)}.`),
    ])
    expect(query).toContain("Marta")
    expect(query).toContain("Pavel")
    expect(query.indexOf("Marta")).toBeLessThan(query.indexOf("Pavel"))
  })

  test("AC10 — adds nothing when the notes hold no capitalized term", async () => {
    const { query, calls } = await new CodeRewriter().rewrite(QUESTION, [
      note("plain.md", "nothing here starts with a capital letter."),
    ])
    expect(query.trim()).toBe(QUESTION)
    expect(calls).toEqual([])
  })

  test("AC10 — has no term to take when there is no note", async () => {
    const { query, calls } = await new CodeRewriter().rewrite(QUESTION, [])
    expect(query.trim()).toBe(QUESTION)
    expect(calls).toEqual([])
  })
})

describe("AC10 — LLMRewriter", () => {
  const CALL: ModelCall = {
    model: "fake-llm",
    inputTokens: 200,
    outputTokens: 9,
    latencyMs: 80,
  }

  /** A fake LLM that records its requests and returns a scripted text. */
  function fakeLLM(text = "budget owner Borealis 2025") {
    const requests: LLMRequest[] = []
    const llm: LLM = {
      model: "fake-llm",
      complete(request: LLMRequest): Promise<LLMResponse> {
        requests.push(request)
        return Promise.resolve({ text, call: CALL })
      },
      completeJson<T>(): Promise<LLMJsonResponse<T>> {
        return Promise.reject(new Error("LLMRewriter must use complete"))
      },
    }
    return { llm, requests }
  }

  const notes = [
    note("budget/owner.md", "ALPHA-TEXT the owner is named here."),
    note("planning/q3.md", "BRAVO-TEXT the Q3 plan."),
  ]

  test("AC10 — has a kind different from the code rewriter's", () => {
    const rewriter = new LLMRewriter(fakeLLM().llm)
    expect(rewriter.kind).toBeString()
    expect(rewriter.kind).not.toBe(new CodeRewriter().kind)
  })

  test("AC10 — makes one call whose prompt holds the question and the paths of the notes", async () => {
    const { llm, requests } = fakeLLM()
    await new LLMRewriter(llm).rewrite(QUESTION, notes)
    expect(requests).toHaveLength(1)
    const prompt = requests[0]!.prompt
    expect(prompt).toContain(QUESTION)
    expect(prompt).toContain("budget/owner.md")
    expect(prompt).toContain("planning/q3.md")
    expect(requests[0]!.maxTokens).toBeGreaterThan(0)
  })

  test("AC10 — returns the reformulated query, trimmed, and the call", async () => {
    const { llm } = fakeLLM("  budget owner Borealis 2025\n")
    const result = await new LLMRewriter(llm).rewrite(QUESTION, notes)
    expect(result).toEqual({
      query: "budget owner Borealis 2025",
      calls: [CALL],
    })
  })

  test("AC10 — still asks when no note was found", async () => {
    const { llm, requests } = fakeLLM("another phrasing")
    const result = await new LLMRewriter(llm).rewrite(QUESTION, [])
    expect(requests).toHaveLength(1)
    expect(requests[0]!.prompt).toContain(QUESTION)
    expect(result.query).toBe("another phrasing")
    expect(result.calls).toEqual([CALL])
  })

  test("AC10 — passes the errors of the LLM through unchanged", async () => {
    const error = new LLMCallError("bad output", CALL)
    const llm: LLM = {
      model: "fake-llm",
      complete: () => Promise.reject(error),
      completeJson: () => Promise.reject(error),
    }
    let thrown: unknown
    try {
      await new LLMRewriter(llm).rewrite(QUESTION, notes)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBe(error)
  })
})
