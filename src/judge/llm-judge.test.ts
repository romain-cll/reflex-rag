import { describe, expect, test } from "bun:test"
import type { z } from "zod"
import { MISSING, type Judge, type Missing } from "../core/judge.ts"
import { LLMCallError, type LLM, type LLMRequest } from "../core/llm.ts"
import type { DatedChunk, Link, ModelCall } from "../core/types.ts"
import { LLMJudge } from "./llm-judge.ts"

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

/**
 * A fake LLM that records each `completeJson` request with its schema and
 * returns the scripted values in order. Each value goes through the received
 * schema, which checks that the schema accepts the shape the tests script.
 */
function fakeLLM(...scripted: unknown[]) {
  const calls: JsonCall[] = []
  const queue = [...scripted]
  const llm: LLM = {
    model: "fake-llm",
    complete: () =>
      Promise.reject(new Error("the judge must use completeJson")),
    completeJson<T>(request: LLMRequest, schema: z.ZodType<T>) {
      calls.push({ request, schema })
      return Promise.resolve({ value: schema.parse(queue.shift()), call: CALL })
    },
  }
  return { llm, calls }
}

function failingLLM(error: Error): LLM {
  return {
    model: "fake-llm",
    complete: () => Promise.reject(new Error("unused")),
    completeJson: () => Promise.reject(error),
  }
}

/** Scripted output of the relevance call: `{ chunks: [{ id, probability }] }`. */
function relevanceOutput(scores: Record<string, number>) {
  return {
    chunks: Object.entries(scores).map(([id, probability]) => ({
      id,
      probability,
    })),
  }
}

/**
 * Scripted output of the assess call:
 * `{ sufficient, missing: { <value>: number }, links: [{ id, probability }] }`.
 */
function assessOutput(
  options: {
    sufficient?: number
    missing?: Partial<Record<Missing, number>>
    links?: Record<string, number>
  } = {}
) {
  return {
    sufficient: options.sufficient ?? 0.5,
    missing: {
      detail_in_linked_note: 0.25,
      newer_version: 0.25,
      topic_not_found: 0.25,
      unidentified: 0.25,
      ...options.missing,
    },
    links: Object.entries(options.links ?? {}).map(([id, probability]) => ({
      id,
      probability,
    })),
  }
}

const QUESTION = "Who leads the Atlas project?"

const CHUNKS: DatedChunk[] = [
  {
    id: "chunk-alpha",
    notePath: "people/alice.md",
    noteDate: "2025-03-14",
    heading: "Alice > Role",
    text: "ALPHA-TEXT Alice leads the Atlas project.",
  },
  {
    id: "chunk-bravo",
    notePath: "projects/atlas.md",
    noteDate: "2024-11-02",
    heading: "Atlas > Status",
    text: "BRAVO-TEXT Atlas ships in June.",
  },
  {
    id: "chunk-charlie",
    notePath: "meetings/2025-01-10.md",
    noteDate: null,
    heading: "Weekly sync",
    text: "CHARLIE-TEXT The team discussed the roadmap.",
  },
]

const LINKS: Link[] = [
  {
    id: "link-one",
    sourcePath: "projects/atlas.md",
    targetPath: "projects/Atlas Roadmap.md",
    label: "LABEL-ONE The full schedule is kept in a separate note.",
  },
  {
    id: "link-two",
    sourcePath: "people/alice.md",
    targetPath: "people/Alice Martin.md",
    label: "LABEL-TWO Ask the lead for the final figures.",
  },
]

/** `count` chunks with ids `c0`, `c1`, … */
function manyChunks(count: number): DatedChunk[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    notePath: `notes/n${index}.md`,
    noteDate: "2025-01-01",
    heading: `Heading ${index}`,
    text: `Text ${index}.`,
  }))
}

/** `count` links with ids `l0`, `l1`, … */
function manyLinks(count: number): Link[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `l${index}`,
    sourcePath: "notes/source.md",
    targetPath: `notes/Target ${index}.md`,
    label: `Label ${index}.`,
  }))
}

const IDENTITY_SCORES = { "chunk-alpha": 0.9, "chunk-bravo": 0.5 }

async function relevancePrompt(chunks = CHUNKS, question = QUESTION) {
  const { llm, calls } = fakeLLM(relevanceOutput({}))
  await new LLMJudge(llm).relevance(question, chunks)
  return (calls[0] as JsonCall).request
}

async function assessPrompt(
  chunks = CHUNKS,
  links = LINKS,
  question = QUESTION
) {
  const { llm, calls } = fakeLLM(assessOutput())
  await new LLMJudge(llm).assess(question, chunks, links)
  return (calls[0] as JsonCall).request
}

/**
 * The part of a prompt that belongs to each id: from its first occurrence to
 * the next id's occurrence. Fails if an id is missing or out of order.
 */
function segmentsOf(prompt: string, ids: string[]): Record<string, string> {
  const positions = ids.map((id) => prompt.indexOf(id))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  const segments: Record<string, string> = {}
  ids.forEach((id, index) => {
    segments[id] = prompt.slice(positions[index], positions[index + 1])
  })
  return segments
}

/** The sentences and lines of a prompt (colons do not split). */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/)
}

/**
 * The explanation of a `missing` value in a system prompt: from its first
 * mention to the next value's mention, within 300 characters.
 */
function explanationOf(system: string, value: Missing): string {
  const start = system.indexOf(value)
  expect(start).toBeGreaterThanOrEqual(0)
  const others = MISSING.filter((other) => other !== value)
    .map((other) => system.indexOf(other, start + value.length))
    .filter((position) => position >= 0)
  const end = Math.min(start + 300, ...others)
  return system.slice(start, end)
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

describe("LLMJudge interface", () => {
  test("AC1 — implements Judge on top of an LLM", () => {
    const judge: Judge = new LLMJudge(fakeLLM().llm)

    expect(typeof judge.relevance).toBe("function")
    expect(typeof judge.assess).toBe("function")
  })

  test("AC1 — judges chunks that carry their note date, null or not", async () => {
    const { llm } = fakeLLM(relevanceOutput({ "chunk-charlie": 0.3 }))

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(result.chunks["chunk-charlie"]).toBe(0.3)
  })
})

describe("LLMJudge.relevance", () => {
  test("AC2 — makes one completeJson call and returns its call", async () => {
    const { llm, calls } = fakeLLM(relevanceOutput(IDENTITY_SCORES))

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(calls).toHaveLength(1)
    expect(result.calls).toEqual([CALL])
  })

  test("AC2 — the prompt holds the question", async () => {
    const request = await relevancePrompt()

    expect(request.prompt).toContain(QUESTION)
  })

  test("AC2 — the prompt holds every chunk with its id, note path, date, heading and text, in input order", async () => {
    const request = await relevancePrompt()

    const segments = segmentsOf(
      request.prompt,
      CHUNKS.map((chunk) => chunk.id)
    )
    for (const chunk of CHUNKS) {
      const segment = segments[chunk.id] as string
      expect(segment).toContain(chunk.notePath)
      expect(segment).toContain(chunk.heading)
      expect(segment).toContain(chunk.text)
      if (chunk.noteDate !== null) expect(segment).toContain(chunk.noteDate)
    }
  })

  test("AC2 — a chunk without a note date is still sent, without a null date", async () => {
    const request = await relevancePrompt()

    expect(request.prompt).toContain("CHARLIE-TEXT")
    expect(request.prompt).not.toMatch(/null|undefined/)
  })

  test("AC2 — the instructions ask for the probability of each chunk id", async () => {
    const request = await relevancePrompt()

    const instructions = `${request.system ?? ""}\n${request.prompt}`
    expect(instructions).toMatch(/probabilit/i)
    expect(instructions).toMatch(/\bids?\b/i)
  })

  test("AC2 — returns the probability of every input chunk id", async () => {
    const { llm } = fakeLLM(
      relevanceOutput({
        "chunk-alpha": 0.9,
        "chunk-bravo": 0.25,
        "chunk-charlie": 0,
      })
    )

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(result.chunks).toEqual({
      "chunk-alpha": 0.9,
      "chunk-bravo": 0.25,
      "chunk-charlie": 0,
    })
  })

  test("AC2 — an id the model left out gets 0", async () => {
    const { llm } = fakeLLM(relevanceOutput(IDENTITY_SCORES))

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(result.chunks).toEqual({
      "chunk-alpha": 0.9,
      "chunk-bravo": 0.5,
      "chunk-charlie": 0,
    })
  })

  test("AC2 — an id the model invented is ignored", async () => {
    const { llm } = fakeLLM(
      relevanceOutput({ ...IDENTITY_SCORES, "chunk-ghost": 0.8 })
    )

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(Object.keys(result.chunks).sort()).toEqual([
      "chunk-alpha",
      "chunk-bravo",
      "chunk-charlie",
    ])
    expect(result.chunks).not.toHaveProperty("chunk-ghost")
  })

  test("AC2 — values are clamped to [0, 1]", async () => {
    const { llm } = fakeLLM(
      relevanceOutput({
        "chunk-alpha": 1.7,
        "chunk-bravo": -0.3,
        "chunk-charlie": 0.4,
      })
    )

    const result = await new LLMJudge(llm).relevance(QUESTION, CHUNKS)

    expect(result.chunks).toEqual({
      "chunk-alpha": 1,
      "chunk-bravo": 0,
      "chunk-charlie": 0.4,
    })
  })

  test("AC2 — with no chunk, makes no call and returns empty results", async () => {
    const { llm, calls } = fakeLLM()

    const result = await new LLMJudge(llm).relevance(QUESTION, [])

    expect(calls).toHaveLength(0)
    expect(result).toEqual({ chunks: {}, calls: [] })
  })
})

describe("LLMJudge.assess", () => {
  test("AC3 — makes one completeJson call and returns its call", async () => {
    const { llm, calls } = fakeLLM(assessOutput())

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(calls).toHaveLength(1)
    expect(result.calls).toEqual([CALL])
  })

  test("AC3 — the prompt holds the question", async () => {
    const request = await assessPrompt()

    expect(request.prompt).toContain(QUESTION)
  })

  test("AC3 — the prompt holds every chunk with its id, note path, date, heading and text, in input order", async () => {
    const request = await assessPrompt()

    const segments = segmentsOf(request.prompt, [
      ...CHUNKS.map((chunk) => chunk.id),
      ...LINKS.map((link) => link.id),
    ])
    for (const chunk of CHUNKS) {
      const segment = segments[chunk.id] as string
      expect(segment).toContain(chunk.notePath)
      expect(segment).toContain(chunk.heading)
      expect(segment).toContain(chunk.text)
      if (chunk.noteDate !== null) expect(segment).toContain(chunk.noteDate)
    }
  })

  test("AC3 — a chunk without a note date is still sent, without a null date", async () => {
    const request = await assessPrompt()

    expect(request.prompt).toContain("CHARLIE-TEXT")
    expect(request.prompt).not.toMatch(/null|undefined/)
  })

  test("AC3 — the prompt holds every link with its id, the title of its target note and its label, in input order", async () => {
    const request = await assessPrompt()

    const segments = segmentsOf(
      request.prompt,
      LINKS.map((link) => link.id)
    )
    expect(segments["link-one"]).toContain("Atlas Roadmap")
    expect(segments["link-one"]).toContain(LINKS[0]?.label)
    expect(segments["link-two"]).toContain("Alice Martin")
    expect(segments["link-two"]).toContain(LINKS[1]?.label)
  })

  test("AC3 — the links come after the chunks in the prompt", async () => {
    const request = await assessPrompt()

    const lastChunk = request.prompt.indexOf("CHARLIE-TEXT")
    expect(lastChunk).toBeGreaterThanOrEqual(0)
    expect(request.prompt.indexOf("link-one")).toBeGreaterThan(lastChunk)
  })

  test("AC3 — with chunks and no link, still makes one call and returns no link", async () => {
    const { llm, calls } = fakeLLM(assessOutput())

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, [])

    expect(calls).toHaveLength(1)
    expect(result.links).toEqual({})
  })

  test("AC3 — sufficient is returned as scripted and clamped to [0, 1]", async () => {
    const results = []
    for (const sufficient of [0.35, 1.4, -0.2]) {
      const { llm } = fakeLLM(assessOutput({ sufficient }))
      results.push(await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS))
    }

    expect(results.map((result) => result.sufficient)).toEqual([0.35, 1, 0])
  })

  test("AC3 — missing probabilities that already sum to 1 are kept", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        missing: {
          detail_in_linked_note: 0.5,
          newer_version: 0.25,
          topic_not_found: 0.125,
          unidentified: 0.125,
        },
      })
    )

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(result.missing.probabilities).toEqual({
      detail_in_linked_note: 0.5,
      newer_version: 0.25,
      topic_not_found: 0.125,
      unidentified: 0.125,
    })
  })

  test("AC3 — missing probabilities are normalized to sum to 1", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        missing: {
          detail_in_linked_note: 0.1,
          newer_version: 0.1,
          topic_not_found: 0.2,
          unidentified: 0,
        },
      })
    )

    const { missing } = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    const probabilities = missing.probabilities
    expect(probabilities.detail_in_linked_note).toBeCloseTo(0.25, 10)
    expect(probabilities.newer_version).toBeCloseTo(0.25, 10)
    expect(probabilities.topic_not_found).toBeCloseTo(0.5, 10)
    expect(probabilities.unidentified).toBe(0)
    const sum = MISSING.reduce((total, key) => total + probabilities[key], 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  test("AC3 — missing probabilities are uniform when all are 0", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        missing: {
          detail_in_linked_note: 0,
          newer_version: 0,
          topic_not_found: 0,
          unidentified: 0,
        },
      })
    )

    const { missing } = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    for (const key of MISSING) {
      expect(missing.probabilities[key]).toBeCloseTo(0.25, 10)
    }
    expect(missing.choice).toBe("detail_in_linked_note")
  })

  test("AC3 — the choice is the most probable missing value", async () => {
    for (const expected of MISSING) {
      const { llm } = fakeLLM(
        assessOutput({
          missing: {
            detail_in_linked_note: 0.1,
            newer_version: 0.1,
            topic_not_found: 0.1,
            unidentified: 0.1,
            [expected]: 0.7,
          },
        })
      )

      const { missing } = await new LLMJudge(llm).assess(
        QUESTION,
        CHUNKS,
        LINKS
      )

      expect(missing.choice).toBe(expected)
    }
  })

  test("AC3 — a tie goes to the first value in MISSING order", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        missing: {
          detail_in_linked_note: 0.1,
          newer_version: 0.3,
          topic_not_found: 0.3,
          unidentified: 0.3,
        },
      })
    )

    const { missing } = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(missing.choice).toBe("newer_version")
  })

  test("AC3 — a tie between the last two values goes to topic_not_found", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        missing: {
          detail_in_linked_note: 0,
          newer_version: 0.2,
          topic_not_found: 0.4,
          unidentified: 0.4,
        },
      })
    )

    const { missing } = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(missing.choice).toBe("topic_not_found")
  })

  test("AC3 — returns the probability of every input link id", async () => {
    const { llm } = fakeLLM(
      assessOutput({ links: { "link-one": 0.8, "link-two": 0.1 } })
    )

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(result.links).toEqual({ "link-one": 0.8, "link-two": 0.1 })
  })

  test("AC3 — a link id the model left out gets 0", async () => {
    const { llm } = fakeLLM(assessOutput({ links: { "link-two": 0.6 } }))

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(result.links).toEqual({ "link-one": 0, "link-two": 0.6 })
  })

  test("AC3 — a link id the model invented is ignored", async () => {
    const { llm } = fakeLLM(
      assessOutput({
        links: { "link-one": 0.8, "link-two": 0.1, "link-ghost": 0.9 },
      })
    )

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(Object.keys(result.links).sort()).toEqual(["link-one", "link-two"])
  })

  test("AC3 — link values are clamped to [0, 1]", async () => {
    const { llm } = fakeLLM(
      assessOutput({ links: { "link-one": 2, "link-two": -1 } })
    )

    const result = await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)

    expect(result.links).toEqual({ "link-one": 1, "link-two": 0 })
  })

  test("AC3 — the instructions ask for the sufficiency, the missing values and the links", async () => {
    const request = await assessPrompt()

    const instructions = `${request.system ?? ""}\n${request.prompt}`
    expect(instructions).toMatch(/probabilit/i)
    expect(instructions).toMatch(/sufficient|enough/i)
    expect(instructions).toMatch(/\bids?\b/i)
    for (const value of MISSING) expect(instructions).toContain(value)
  })
})

describe("LLMJudge prompts", () => {
  test("AC4 — each call sends a fixed, non-empty system prompt", async () => {
    const first = await relevancePrompt()
    const second = await relevancePrompt(
      CHUNKS.slice(1),
      "When does Atlas ship?"
    )
    const third = await assessPrompt()
    const fourth = await assessPrompt(
      CHUNKS.slice(1),
      LINKS.slice(1),
      "When does Atlas ship?"
    )

    expect((first.system ?? "").length).toBeGreaterThan(50)
    expect((third.system ?? "").length).toBeGreaterThan(50)
    expect(second.system).toBe(first.system)
    expect(fourth.system).toBe(third.system)
    expect(third.system).not.toBe(first.system)
  })

  test("AC4 — the question and the chunks stay out of the system prompt", async () => {
    const relevance = await relevancePrompt()
    const assess = await assessPrompt()

    for (const system of [relevance.system ?? "", assess.system ?? ""]) {
      expect(system).not.toContain(QUESTION)
      expect(system).not.toContain("ALPHA-TEXT")
    }
  })

  test("AC4 — the relevance prompt defines the probability that a chunk helps answer the question", async () => {
    const { system } = await relevancePrompt()

    const sentence = sentencesOf(system ?? "").find(
      (part) => /probabilit/i.test(part) && /\bchunk/i.test(part)
    )
    expect(sentence).toBeDefined()
    expect(sentence).toMatch(/help|useful|relevan/i)
    expect(sentence).toMatch(/answer/i)
  })

  test("AC4 — the assess prompt defines the probability that the chunks are enough to answer", async () => {
    const { system } = await assessPrompt()

    const sentence = sentencesOf(system ?? "").find(
      (part) => /sufficient|enough/i.test(part) && /answer/i.test(part)
    )
    expect(sentence).toBeDefined()
    expect(sentence).toMatch(/probabilit/i)
  })

  test("AC4 — the assess prompt defines the link probability as judged from the label and the title only", async () => {
    const { system } = await assessPrompt()

    const sentence = sentencesOf(system ?? "").find(
      (part) =>
        /label/i.test(part) && /title/i.test(part) && /\bonly\b/i.test(part)
    )
    expect(sentence).toBeDefined()
    expect(sentence).toMatch(/link/i)
    expect(sentence).toMatch(/missing|holds|leads|contains/i)
  })

  test("AC4 — both prompts ask for calibrated estimates rather than certainties", async () => {
    const relevance = await relevancePrompt()
    const assess = await assessPrompt()

    for (const system of [relevance.system ?? "", assess.system ?? ""]) {
      const sentence = sentencesOf(system).find((part) =>
        /calibrat/i.test(part)
      )
      expect(sentence).toBeDefined()
      expect(sentence).toMatch(/certain|0 or 1|extreme/i)
      expect(sentence).toMatch(/\b(not|never|avoid|rather than|instead)\b/i)
    }
  })

  test("AC4 — both prompts tell the model to use only the given text", async () => {
    const relevance = await relevancePrompt()
    const assess = await assessPrompt()

    for (const system of [relevance.system ?? "", assess.system ?? ""]) {
      const sentence = sentencesOf(system).find(
        (part) =>
          /\bonly\b/i.test(part) &&
          /\b(given|provided|text|excerpts)\b/i.test(part)
      )
      expect(sentence).toBeDefined()
    }
  })

  test("AC4 — the assess prompt explains detail_in_linked_note as an answer likely one link away", async () => {
    const { system } = await assessPrompt()

    const explanation = explanationOf(system ?? "", "detail_in_linked_note")
    expect(explanation).toMatch(/link/i)
    expect(explanation).toMatch(/one link|linked note|a note/i)
    expect(explanation).toMatch(/answer/i)
  })

  test("AC4 — the assess prompt explains newer_version as an outdated context a later note may change", async () => {
    const { system } = await assessPrompt()

    const explanation = explanationOf(system ?? "", "newer_version")
    expect(explanation).toMatch(/outdated|out of date|stale|superseded/i)
    expect(explanation).toMatch(/later|newer/i)
    expect(explanation).toMatch(/change|update|replace|supersed/i)
  })

  test("AC4 — the assess prompt explains topic_not_found as nothing found on the topic", async () => {
    const { system } = await assessPrompt()

    const explanation = explanationOf(system ?? "", "topic_not_found")
    expect(explanation).toMatch(/nothing|no (note|text|chunk|information)/i)
    expect(explanation).toMatch(/topic/i)
  })

  test("AC4 — the assess prompt names unidentified", async () => {
    const { system } = await assessPrompt()

    const explanation = explanationOf(system ?? "", "unidentified")
    expect(explanation.length).toBeGreaterThan("unidentified".length + 10)
  })
})

describe("LLMJudge budget and errors", () => {
  test("AC5 — relevance sets a positive integer maxTokens that grows with the number of chunks", async () => {
    const budgets: number[] = []
    for (const count of [1, 5, 20, 50]) {
      const { llm, calls } = fakeLLM(relevanceOutput({}))
      await new LLMJudge(llm).relevance(QUESTION, manyChunks(count))
      budgets.push((calls[0] as JsonCall).request.maxTokens)
    }

    expect(budgets.every((budget) => Number.isInteger(budget))).toBe(true)
    expect(budgets[0]).toBeGreaterThan(0)
    expect(budgets[1]).toBeGreaterThan(budgets[0] as number)
    expect(budgets[2]).toBeGreaterThan(budgets[1] as number)
    expect(budgets[3]).toBeGreaterThan(budgets[2] as number)
  })

  test("AC5 — the relevance budget leaves room for one JSON entry per chunk", async () => {
    const { llm, calls } = fakeLLM(relevanceOutput({}))

    await new LLMJudge(llm).relevance(QUESTION, manyChunks(50))

    expect((calls[0] as JsonCall).request.maxTokens).toBeGreaterThanOrEqual(
      50 * 10
    )
  })

  test("AC5 — assess sets a positive integer maxTokens that grows with the number of links", async () => {
    const budgets: number[] = []
    for (const count of [0, 1, 5, 20]) {
      const { llm, calls } = fakeLLM(assessOutput())
      await new LLMJudge(llm).assess(QUESTION, CHUNKS, manyLinks(count))
      budgets.push((calls[0] as JsonCall).request.maxTokens)
    }

    expect(budgets.every((budget) => Number.isInteger(budget))).toBe(true)
    expect(budgets[0]).toBeGreaterThan(0)
    expect(budgets[1]).toBeGreaterThan(budgets[0] as number)
    expect(budgets[2]).toBeGreaterThan(budgets[1] as number)
    expect(budgets[3]).toBeGreaterThan(budgets[2] as number)
  })

  test("AC5 — the assess budget leaves room for one JSON entry per link", async () => {
    const { llm, calls } = fakeLLM(assessOutput())

    await new LLMJudge(llm).assess(QUESTION, CHUNKS, manyLinks(20))

    expect((calls[0] as JsonCall).request.maxTokens).toBeGreaterThanOrEqual(
      20 * 10
    )
  })

  test("AC5 — the schema of the relevance call accepts the scripted shape and rejects a malformed one", async () => {
    const { llm, calls } = fakeLLM(relevanceOutput({ "chunk-alpha": 0.5 }))
    await new LLMJudge(llm).relevance(QUESTION, CHUNKS)
    const { schema } = calls[0] as JsonCall

    expect(schema.safeParse(relevanceOutput({ a: 0.5 })).success).toBe(true)
    expect(schema.safeParse({ chunks: "high" }).success).toBe(false)
    expect(schema.safeParse({ chunks: [{ id: "a" }] }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
  })

  test("AC5 — the schema of the assess call accepts the scripted shape and rejects a malformed one", async () => {
    const { llm, calls } = fakeLLM(assessOutput())
    await new LLMJudge(llm).assess(QUESTION, CHUNKS, LINKS)
    const { schema } = calls[0] as JsonCall

    expect(schema.safeParse(assessOutput({ links: { a: 0.5 } })).success).toBe(
      true
    )
    expect(
      schema.safeParse({ ...assessOutput(), sufficient: "yes" }).success
    ).toBe(false)
    expect(schema.safeParse({ ...assessOutput(), links: 3 }).success).toBe(
      false
    )
    expect(schema.safeParse({}).success).toBe(false)
  })

  test("AC5 — an LLMCallError from relevance passes through unchanged with its billed call", async () => {
    const error = new LLMCallError("bad JSON from the model", CALL)

    const caught = await rejection(
      new LLMJudge(failingLLM(error)).relevance(QUESTION, CHUNKS)
    )

    expect(caught).toBe(error)
    expect((caught as LLMCallError).call).toEqual(CALL)
  })

  test("AC5 — an LLMCallError from assess passes through unchanged with its billed call", async () => {
    const error = new LLMCallError("bad JSON from the model", CALL)

    const caught = await rejection(
      new LLMJudge(failingLLM(error)).assess(QUESTION, CHUNKS, LINKS)
    )

    expect(caught).toBe(error)
    expect((caught as LLMCallError).call).toEqual(CALL)
  })

  test("AC5 — an error of the API passes through unchanged", async () => {
    const error = new Error("529 overloaded")

    const relevance = await rejection(
      new LLMJudge(failingLLM(error)).relevance(QUESTION, CHUNKS)
    )
    const assess = await rejection(
      new LLMJudge(failingLLM(error)).assess(QUESTION, CHUNKS, LINKS)
    )

    expect(relevance).toBe(error)
    expect(assess).toBe(error)
  })
})
