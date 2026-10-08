import { describe, expect, test } from "bun:test"
import type { Missing } from "../core/judge.ts"
import {
  LLMCallError,
  type LLM,
  type LLMJsonResponse,
  type LLMRequest,
  type LLMResponse,
} from "../core/llm.ts"
import type { Chunk, ModelCall } from "../core/types.ts"
import { CodeRewriter, LLMRewriter } from "./rewriter.ts"

const QUESTION = "Who owns the Borealis budget?"

function chunk(id: string, heading: string, text: string): Chunk {
  return { id, notePath: `${id}.md`, heading, text }
}

/** "saw Zephyr and saw Zephyr": the term repeated `count` times, never first in a sentence. */
function mentions(term: string, count: number): string {
  return Array.from({ length: count }, () => `saw ${term}`).join(" and ")
}

describe("AC9 — CodeRewriter", () => {
  // Frequencies: Zephyr 8, Quokka 7, Marta 6, Pavel 5, Quartz 4, Lumen 3,
  // Harbor 2, Tundra 1. Borealis (9) is in the question.
  const kept = [
    chunk(
      "c1",
      "notes > first",
      [
        mentions("Zephyr", 5),
        mentions("Quokka", 4),
        mentions("Marta", 3),
        mentions("Pavel", 2),
        mentions("Borealis", 9),
      ].join(" and ") + "."
    ),
    chunk(
      "c2",
      "notes > second",
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

  test("AC9 — makes no model call", async () => {
    const { calls } = await new CodeRewriter().rewrite(
      QUESTION,
      kept,
      "unidentified"
    )
    expect(calls).toEqual([])
  })

  test("AC9 — has a kind", () => {
    expect(new CodeRewriter().kind).toBeString()
    expect(new CodeRewriter().kind).not.toBe("")
  })

  test("AC9 — the query starts with the question", async () => {
    const { query } = await new CodeRewriter().rewrite(
      QUESTION,
      kept,
      "topic_not_found"
    )
    expect(query.startsWith(QUESTION)).toBe(true)
  })

  test("AC9 — adds at most 6 terms, the most frequent ones", async () => {
    const { query } = await new CodeRewriter().rewrite(
      QUESTION,
      kept,
      "unidentified"
    )
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

  test("AC9 — skips the terms already in the question", async () => {
    const { query } = await new CodeRewriter().rewrite(
      QUESTION,
      kept,
      "unidentified"
    )
    // Borealis is the most frequent capitalized word of the chunks (9) but it
    // is in the question: it appears once, from the question itself.
    expect(query.split("Borealis")).toHaveLength(2)
  })

  test("AC9 — adds every term when there are fewer than 6", async () => {
    const { query } = await new CodeRewriter().rewrite(
      QUESTION,
      [
        chunk(
          "c3",
          "x",
          `${mentions("Marta", 2)} and ${mentions("Pavel", 1)}.`
        ),
      ],
      "unidentified"
    )
    expect(query).toContain("Marta")
    expect(query).toContain("Pavel")
    expect(query.indexOf("Marta")).toBeLessThan(query.indexOf("Pavel"))
  })

  test("AC9 — adds nothing when the chunks hold no capitalized term", async () => {
    const { query, calls } = await new CodeRewriter().rewrite(
      QUESTION,
      [chunk("c4", "x", "nothing here starts with a capital letter.")],
      "unidentified"
    )
    expect(query.trim()).toBe(QUESTION)
    expect(calls).toEqual([])
  })

  test("AC9 — has no term to take when nothing was kept", async () => {
    const { query, calls } = await new CodeRewriter().rewrite(
      QUESTION,
      [],
      "topic_not_found"
    )
    expect(query.trim()).toBe(QUESTION)
    expect(calls).toEqual([])
  })
})

describe("AC9 — LLMRewriter", () => {
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

  const kept = [
    chunk("c1", "Budget > Owner", "ALPHA-TEXT the owner is named here."),
    chunk("c2", "Planning > Q3", "BRAVO-TEXT the Q3 plan."),
  ]

  test("AC9 — has a kind different from the code rewriter's", () => {
    const rewriter = new LLMRewriter(fakeLLM().llm)
    expect(rewriter.kind).toBeString()
    expect(rewriter.kind).not.toBe(new CodeRewriter().kind)
  })

  test("AC9 — makes one call whose prompt holds the question, the kept headings and the missing choice", async () => {
    const { llm, requests } = fakeLLM()
    await new LLMRewriter(llm).rewrite(QUESTION, kept, "newer_version")
    expect(requests).toHaveLength(1)
    const prompt = requests[0]!.prompt
    expect(prompt).toContain(QUESTION)
    expect(prompt).toContain("Budget > Owner")
    expect(prompt).toContain("Planning > Q3")
    expect(prompt).toContain("newer_version")
    expect(requests[0]!.maxTokens).toBeGreaterThan(0)
  })

  test("AC9 — states the missing choice it was given", async () => {
    for (const missing of [
      "detail_in_linked_note",
      "topic_not_found",
    ] satisfies Missing[]) {
      const { llm, requests } = fakeLLM()
      await new LLMRewriter(llm).rewrite(QUESTION, kept, missing)
      expect(requests[0]!.prompt).toContain(missing)
    }
  })

  test("AC9 — returns the reformulated query and the call", async () => {
    const { llm } = fakeLLM("  budget owner Borealis 2025\n")
    const result = await new LLMRewriter(llm).rewrite(
      QUESTION,
      kept,
      "topic_not_found"
    )
    expect(result).toEqual({
      query: "budget owner Borealis 2025",
      calls: [CALL],
    })
  })

  test("AC9 — still asks when nothing was kept", async () => {
    const { llm, requests } = fakeLLM("another phrasing")
    const result = await new LLMRewriter(llm).rewrite(
      QUESTION,
      [],
      "topic_not_found"
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]!.prompt).toContain(QUESTION)
    expect(result.query).toBe("another phrasing")
    expect(result.calls).toEqual([CALL])
  })

  test("AC9 — passes the errors of the LLM through unchanged", async () => {
    const error = new LLMCallError("bad output", CALL)
    const llm: LLM = {
      model: "fake-llm",
      complete: () => Promise.reject(error),
      completeJson: () => Promise.reject(error),
    }
    let thrown: unknown
    try {
      await new LLMRewriter(llm).rewrite(QUESTION, kept, "unidentified")
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBe(error)
  })
})
