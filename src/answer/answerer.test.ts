import { describe, expect, test } from "bun:test"
import type { z } from "zod"
import type { LLM, LLMRequest, LLMResponse } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { AnswerSchema, answerQuestion, type ContextChunk } from "./answerer.ts"

const CALL: ModelCall = {
  model: "fake-llm",
  inputTokens: 321,
  outputTokens: 12,
  latencyMs: 456,
}

interface JsonCall {
  request: LLMRequest
  schema: z.ZodType
}

/** A fake LLM that records its requests and returns a scripted value. */
function fakeLLM(value: unknown = answered()) {
  const calls: JsonCall[] = []
  const llm: LLM = {
    model: "fake-llm",
    complete(): Promise<LLMResponse> {
      return Promise.reject(new Error("answerQuestion must use completeJson"))
    },
    completeJson<T>(request: LLMRequest, schema: z.ZodType<T>) {
      calls.push({ request, schema })
      return Promise.resolve({ value: value as T, call: CALL })
    },
  }
  return { llm, calls }
}

function answered(citations: string[] = ["people/alice.md"]) {
  return { status: "answered", answer: "Alice leads Atlas.", citations }
}

const CONTEXT: ContextChunk[] = [
  {
    notePath: "people/alice.md",
    noteDate: "2025-03-14",
    heading: "Alice > Role",
    text: "ALPHA-TEXT Alice leads the Atlas project.",
  },
  {
    notePath: "projects/atlas.md",
    noteDate: "2024-11-02",
    heading: "Atlas > Status",
    text: "BRAVO-TEXT Atlas ships in June.",
  },
  {
    notePath: "meetings/2025-01-10.md",
    noteDate: null,
    heading: "Weekly sync",
    text: "CHARLIE-TEXT The team discussed the roadmap.",
  },
]

const QUESTION = "Who leads the Atlas project?"

async function userMessageFor(
  context: ContextChunk[] = CONTEXT,
  question = QUESTION
) {
  const { llm, calls } = fakeLLM()
  await answerQuestion(question, context, llm)
  return (calls[0] as JsonCall).request.prompt
}

/** The error a promise rejects with; fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error("rejected with a non-Error value", { cause: error })
  }
  throw new Error("expected the promise to reject")
}

describe("AnswerSchema", () => {
  test("AC3 — accepts the three statuses with an answer and citations", () => {
    for (const status of ["answered", "conflict", "abstained"]) {
      const parsed = AnswerSchema.safeParse({
        status,
        answer: "Short text.",
        citations: ["people/alice.md"],
      })
      expect(parsed.success).toBe(true)
    }
  })

  test("AC3 — accepts an empty citation list", () => {
    const parsed = AnswerSchema.safeParse({
      status: "abstained",
      answer: "The excerpts do not say.",
      citations: [],
    })
    expect(parsed.success).toBe(true)
  })

  test("AC3 — rejects an unknown status", () => {
    const parsed = AnswerSchema.safeParse({
      status: "maybe",
      answer: "Short text.",
      citations: [],
    })
    expect(parsed.success).toBe(false)
  })

  test("AC3 — rejects a missing answer or missing citations", () => {
    expect(
      AnswerSchema.safeParse({ status: "answered", citations: [] }).success
    ).toBe(false)
    expect(
      AnswerSchema.safeParse({ status: "answered", answer: "Text." }).success
    ).toBe(false)
  })

  test("AC3 — rejects citations that are not strings", () => {
    const parsed = AnswerSchema.safeParse({
      status: "answered",
      answer: "Text.",
      citations: [42],
    })
    expect(parsed.success).toBe(false)
  })
})

describe("answerQuestion", () => {
  test("AC3 — returns the output of the LLM and the call it reports", async () => {
    const { llm } = fakeLLM(answered(["people/alice.md", "projects/atlas.md"]))

    const result = await answerQuestion(QUESTION, CONTEXT, llm)

    expect(result.output).toEqual({
      status: "answered",
      answer: "Alice leads Atlas.",
      citations: ["people/alice.md", "projects/atlas.md"],
    })
    expect(result.call).toEqual(CALL)
  })

  test("AC3 — keeps the conflict and abstained statuses", async () => {
    const conflict = {
      status: "conflict",
      answer: "The notes disagree: June (atlas.md), July (roadmap.md).",
      citations: ["projects/atlas.md"],
    }
    const abstained = {
      status: "abstained",
      answer: "The excerpts do not say.",
      citations: [],
    }

    const first = await answerQuestion(QUESTION, CONTEXT, fakeLLM(conflict).llm)
    const second = await answerQuestion(
      QUESTION,
      CONTEXT,
      fakeLLM(abstained).llm
    )

    expect(first.output).toEqual(conflict)
    expect(second.output).toEqual(abstained)
  })

  test("AC3 — asks the LLM for structured output validated by the answer schema, with a token budget", async () => {
    const { llm, calls } = fakeLLM()

    await answerQuestion(QUESTION, CONTEXT, llm)

    expect(calls).toHaveLength(1)
    const { request, schema } = calls[0] as JsonCall
    expect(request.maxTokens).toBeGreaterThan(0)
    expect(
      schema.safeParse({ status: "answered", answer: "A.", citations: [] })
        .success
    ).toBe(true)
    expect(
      schema.safeParse({ status: "maybe", answer: "A.", citations: [] }).success
    ).toBe(false)
    expect(schema.safeParse({ status: "answered" }).success).toBe(false)
  })

  test("AC3 — an error of the LLM propagates", async () => {
    const llm: LLM = {
      model: "fake-llm",
      complete: () => Promise.reject(new Error("unused")),
      completeJson: () => Promise.reject(new Error("refusal from the model")),
    }

    const error = await rejection(answerQuestion(QUESTION, CONTEXT, llm))

    expect(error.message).toContain("refusal from the model")
  })

  test("AC4 — sends a fixed, non-empty system prompt", async () => {
    const first = fakeLLM()
    const second = fakeLLM()

    await answerQuestion(QUESTION, CONTEXT, first.llm)
    await answerQuestion("When does Atlas ship?", CONTEXT.slice(1), second.llm)

    const system = (first.calls[0] as JsonCall).request.system
    expect(typeof system).toBe("string")
    expect((system ?? "").length).toBeGreaterThan(50)
    expect((second.calls[0] as JsonCall).request.system).toBe(system)
  })

  test("AC4 — the system prompt restricts the answer to the excerpts", async () => {
    const { llm, calls } = fakeLLM()
    await answerQuestion(QUESTION, CONTEXT, llm)
    const system = (calls[0] as JsonCall).request.system ?? ""

    expect(system).toMatch(/only[^.]*excerpts/i)
  })

  test("AC4 — the system prompt tells the model to set abstained when the excerpts lack the answer", async () => {
    const { llm, calls } = fakeLLM()
    await answerQuestion(QUESTION, CONTEXT, llm)
    const system = (calls[0] as JsonCall).request.system ?? ""

    const sentence = system
      .split(/(?<=[.!?:])\s+|\n+/)
      .find((part) => part.includes("abstained"))
    expect(sentence).toBeDefined()
    expect(sentence).toMatch(/\b(not|n't|no)\b/i)
  })

  test("AC4 — the system prompt tells the model to set conflict and give each value with its source", async () => {
    const { llm, calls } = fakeLLM()
    await answerQuestion(QUESTION, CONTEXT, llm)
    const system = (calls[0] as JsonCall).request.system ?? ""

    expect(system).toContain("conflict")
    expect(system).toMatch(/disagree|contradict|differ/i)
    expect(system).toMatch(/supersed|replace|outdated|newer/i)
    expect(system).toMatch(/each value/i)
    expect(system).toMatch(/source/i)
  })

  test("AC4 — the system prompt tells the model to cite the note paths it used", async () => {
    const { llm, calls } = fakeLLM()
    await answerQuestion(QUESTION, CONTEXT, llm)
    const system = (calls[0] as JsonCall).request.system ?? ""

    expect(system).toMatch(/cit(e|ations)/i)
    expect(system).toMatch(/note paths?/i)
    expect(system).toContain("answered")
  })

  test("AC4 — the system prompt tells the model to keep the answer short", async () => {
    const { llm, calls } = fakeLLM()
    await answerQuestion(QUESTION, CONTEXT, llm)
    const system = (calls[0] as JsonCall).request.system ?? ""

    expect(system).toMatch(/short|concise|brief/i)
  })

  test("AC4 — the user message holds the question", async () => {
    const prompt = await userMessageFor()

    expect(prompt).toContain(QUESTION)
  })

  test("AC4 — the user message holds every chunk in rank order", async () => {
    const prompt = await userMessageFor()

    const positions = CONTEXT.map((chunk) => prompt.indexOf(chunk.text))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test("AC4 — each chunk carries its note path, date, heading and text", async () => {
    const prompt = await userMessageFor()

    let start = 0
    for (const chunk of CONTEXT) {
      const end = prompt.indexOf(chunk.text, start) + chunk.text.length
      const segment = prompt.slice(start, end)
      expect(segment).toContain(chunk.notePath)
      expect(segment).toContain(chunk.heading)
      if (chunk.noteDate !== null) expect(segment).toContain(chunk.noteDate)
      start = end
    }
  })

  test("AC4 — a chunk without a note date is still sent, without a null date", async () => {
    const prompt = await userMessageFor()

    expect(prompt).toContain("CHARLIE-TEXT")
    expect(prompt).not.toMatch(/null|undefined/)
  })

  test("AC4 — keeps the rank order when the chunks come from the same note", async () => {
    const context: ContextChunk[] = [
      {
        notePath: "projects/atlas.md",
        noteDate: "2024-11-02",
        heading: "Atlas > Status",
        text: "SECOND-SECTION ships in June.",
      },
      {
        notePath: "projects/atlas.md",
        noteDate: "2024-11-02",
        heading: "Atlas > Budget",
        text: "FIRST-SECTION costs 10k.",
      },
    ]

    const prompt = await userMessageFor(context)

    expect(prompt.indexOf("SECOND-SECTION")).toBeGreaterThanOrEqual(0)
    expect(prompt.indexOf("SECOND-SECTION")).toBeLessThan(
      prompt.indexOf("FIRST-SECTION")
    )
    expect(prompt.indexOf("Atlas > Status")).toBeLessThan(
      prompt.indexOf("Atlas > Budget")
    )
  })

  test("AC5 — removes citations that are not note paths of the context", async () => {
    const { llm } = fakeLLM(
      answered(["people/alice.md", "people/invented.md", "projects/atlas.md"])
    )

    const result = await answerQuestion(QUESTION, CONTEXT, llm)

    expect(result.output.citations).toEqual([
      "people/alice.md",
      "projects/atlas.md",
    ])
  })

  test("AC5 — matches note paths exactly", async () => {
    const { llm } = fakeLLM(
      answered([
        "people/alice",
        "People/Alice.md",
        "alice.md",
        "people/alice.md",
      ])
    )

    const result = await answerQuestion(QUESTION, CONTEXT, llm)

    expect(result.output.citations).toEqual(["people/alice.md"])
  })

  test("AC5 — keeps the citations of a note whose chunks are in the context", async () => {
    const { llm } = fakeLLM(answered(["meetings/2025-01-10.md"]))

    const result = await answerQuestion(QUESTION, CONTEXT, llm)

    expect(result.output.citations).toEqual(["meetings/2025-01-10.md"])
  })

  test("AC5 — leaves status and answer untouched when citations are removed", async () => {
    const { llm } = fakeLLM({
      status: "conflict",
      answer: "June versus July.",
      citations: ["nowhere.md"],
    })

    const result = await answerQuestion(QUESTION, CONTEXT, llm)

    expect(result.output.status).toBe("conflict")
    expect(result.output.answer).toBe("June versus July.")
    expect(result.output.citations).toEqual([])
  })

  test("AC5 — removes every citation when the context is empty", async () => {
    const { llm } = fakeLLM(answered(["people/alice.md"]))

    const result = await answerQuestion(QUESTION, [], llm)

    expect(result.output.citations).toEqual([])
  })
})
