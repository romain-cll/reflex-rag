import { describe, expect, test } from "bun:test"
import type { z } from "zod"
import {
  VERDICTS,
  type Judge,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import { LLMCallError, type LLM, type LLMRequest } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { LLMJudge } from "./llm-judge.ts"
import { JUDGE_QUESTION } from "./question.ts"

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
 * schema, which checks that the schema accepts the shape the tests script
 * (out-of-range numbers included: the judge clamps them, the schema must not
 * reject them).
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

type Scores = Partial<Record<Verdict, number>>

/** Scripted output: `{ notes: [{ id, answer, step, none }] }`. */
function judgeOutput(scores: Record<string, Scores>) {
  return {
    notes: Object.entries(scores).map(([id, verdicts]) => ({
      id,
      answer: 0,
      step: 0,
      none: 0,
      ...verdicts,
    })),
  }
}

const QUESTION = "Who leads the Atlas project?"

const NOTES: NoteForJudge[] = [
  {
    path: "people/alice.md",
    date: "2025-03-14",
    text: "ALPHA-TEXT Alice leads the Atlas project.",
    links: ["projects/atlas.md", "people/bob.md"],
  },
  {
    path: "projects/atlas.md",
    date: "2024-11-02",
    text: "BRAVO-TEXT Atlas ships in June.",
    links: ["projects/roadmap.md"],
  },
  {
    path: "meetings/sync.md",
    date: null,
    text: "CHARLIE-TEXT The team discussed the roadmap.",
    links: [],
  },
]

/** `count` notes `notes/a0.md`, `notes/a1.md`, … */
function manyNotes(count: number): NoteForJudge[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `notes/a${index}.md`,
    date: "2025-01-01",
    text: `Text ${index}.`,
    links: [],
  }))
}

async function promptFor(notes = NOTES, question = QUESTION) {
  const { llm, calls } = fakeLLM(judgeOutput({}))
  await new LLMJudge(llm).judge(question, notes)
  return (calls[0] as JsonCall).request
}

async function budgetFor(count: number): Promise<number> {
  const { llm, calls } = fakeLLM(judgeOutput({}))
  await new LLMJudge(llm).judge(QUESTION, manyNotes(count))
  return (calls[0] as JsonCall).request.maxTokens
}

/** Judges `NOTES` with one scripted model answer. */
async function judged(scores: Record<string, Scores>) {
  const { llm } = fakeLLM(judgeOutput(scores))
  return new LLMJudge(llm).judge(QUESTION, NOTES)
}

/**
 * The part of a prompt that belongs to each marker: from its first occurrence
 * to the next marker's occurrence. Fails if a marker is missing or out of
 * order.
 */
function segmentsOf(prompt: string, markers: string[]): Record<string, string> {
  const positions = markers.map((marker) => prompt.indexOf(marker))
  expect(positions.every((position) => position >= 0)).toBe(true)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  const segments: Record<string, string> = {}
  markers.forEach((marker, index) => {
    segments[marker] = prompt.slice(positions[index], positions[index + 1])
  })
  return segments
}

/** The sentences and lines of a prompt (colons do not split). */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/)
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

function sum(verdicts: Record<Verdict, number>): number {
  return VERDICTS.reduce((total, verdict) => total + verdicts[verdict], 0)
}

describe("AC1 — Judge interface", () => {
  test("AC1 — VERDICTS lists answer, step and none in that order", () => {
    expect([...VERDICTS]).toEqual(["answer", "step", "none"])
  })

  test("AC1 — LLMJudge implements Judge with a single judge method", () => {
    const judge: Judge = new LLMJudge(fakeLLM().llm)

    expect(typeof judge.judge).toBe("function")
    expect(judge.judge.length).toBe(2)
  })

  test("AC1 — returns, for every input note path, a probability for each verdict", async () => {
    const result = await judged({
      n1: { answer: 0.8, step: 0.1, none: 0.1 },
      n2: { answer: 0.1, step: 0.6, none: 0.3 },
      n3: { answer: 0, step: 0, none: 1 },
    })

    expect(Object.keys(result.notes).sort()).toEqual(
      NOTES.map((note) => note.path).sort()
    )
    for (const note of NOTES) {
      const verdicts = result.notes[note.path] as Record<Verdict, number>
      expect(Object.keys(verdicts).sort()).toEqual([...VERDICTS].sort())
    }
  })

  test("AC1 — each note's three probabilities sum to 1", async () => {
    const result = await judged({
      n1: { answer: 0.5, step: 0.5, none: 0.5 },
      n2: { answer: 0.9, step: 0.3, none: 0.1 },
    })

    for (const note of NOTES) {
      expect(
        sum(result.notes[note.path] as Record<Verdict, number>)
      ).toBeCloseTo(1, 10)
    }
  })

  test("AC1 — returns the billed call of the model in calls", async () => {
    const result = await judged({ n1: { answer: 1 } })

    expect(result.calls).toEqual([CALL])
  })

  test("AC1 — judges notes with a null date and notes without links", async () => {
    const result = await judged({ n3: { step: 0.4, none: 0.6 } })

    expect(result.notes["meetings/sync.md"]).toEqual({
      answer: 0,
      step: 0.4,
      none: 0.6,
    })
  })
})

describe("AC2 — the shared question", () => {
  test("AC2 — the instructions are the exact wording of the spec", () => {
    expect(JUDGE_QUESTION.instructions).toBe(
      "A question is asked about a company's internal note vault, and answering it may need several notes read one after the other. What does this note give for answering the question?"
    )
  })

  test("AC2 — the answer verdict is described word for word", () => {
    expect(JUDGE_QUESTION.criteria.answer).toBe(
      "The note states the answer to the question, or a part of it."
    )
  })

  test("AC2 — the step verdict is described word for word", () => {
    expect(JUDGE_QUESTION.criteria.step).toBe(
      "The note does not state the answer, but it leads to it: it names the person, supplier, customer, meeting or decision the question depends on, or it links to a note that likely holds the answer."
    )
  })

  test("AC2 — the none verdict is described word for word", () => {
    expect(JUDGE_QUESTION.criteria.none).toBe(
      "The note does not help answer the question."
    )
  })

  test("AC2 — the criteria describe exactly the three verdicts", () => {
    expect(Object.keys(JUDGE_QUESTION.criteria).sort()).toEqual(
      [...VERDICTS].sort()
    )
  })

  test("AC2 — LLMJudge uses the instructions and the three descriptions verbatim in its system prompt", async () => {
    const { system } = await promptFor()

    expect(system).toContain(JUDGE_QUESTION.instructions)
    expect(system).toContain(JUDGE_QUESTION.criteria.answer)
    expect(system).toContain(JUDGE_QUESTION.criteria.step)
    expect(system).toContain(JUDGE_QUESTION.criteria.none)
  })
})

describe("AC3 — one call per batch", () => {
  test("AC3 — makes exactly one completeJson call for all the notes", async () => {
    const { llm, calls } = fakeLLM(judgeOutput({}))

    await new LLMJudge(llm).judge(QUESTION, manyNotes(40))

    expect(calls).toHaveLength(1)
  })

  test("AC3 — the system prompt is fixed, whatever the question and the notes", async () => {
    const first = await promptFor()
    const second = await promptFor(NOTES.slice(1), "When does Atlas ship?")

    expect((first.system ?? "").length).toBeGreaterThan(
      JUDGE_QUESTION.instructions.length
    )
    expect(second.system).toBe(first.system)
  })

  test("AC3 — the question and the notes stay out of the system prompt", async () => {
    const { system } = await promptFor()

    expect(system).not.toContain(QUESTION)
    expect(system).not.toContain("ALPHA-TEXT")
  })

  test("AC3 — the system prompt asks for the probability of each verdict for every note", async () => {
    const { system } = await promptFor()

    expect(system).toMatch(/probabilit/i)
    expect(system).toMatch(/\bnote/i)
    for (const verdict of VERDICTS) expect(system).toContain(verdict)
  })

  test("AC3 — the system prompt asks for calibrated estimates rather than certainties", async () => {
    const { system } = await promptFor()

    const sentence = sentencesOf(system ?? "").find((part) =>
      /calibrat/i.test(part)
    )
    expect(sentence).toBeDefined()
    expect(sentence).toMatch(/certain|0 or 1|extreme/i)
    expect(sentence).toMatch(/\b(not|never|avoid|rather than|instead)\b/i)
  })

  test("AC3 — the system prompt tells the model to judge only from the given text", async () => {
    const { system } = await promptFor()

    const sentence = sentencesOf(system ?? "").find(
      (part) =>
        /\bonly\b/i.test(part) && /\b(given|provided|text)\b/i.test(part)
    )
    expect(sentence).toBeDefined()
  })

  test("AC3 — the user prompt holds the question", async () => {
    const request = await promptFor()

    expect(request.prompt).toContain(QUESTION)
  })

  test("AC3 — the question comes before the notes in the user prompt", async () => {
    const request = await promptFor()

    expect(request.prompt.indexOf(QUESTION)).toBeGreaterThanOrEqual(0)
    expect(request.prompt.indexOf(QUESTION)).toBeLessThan(
      request.prompt.indexOf("ALPHA-TEXT")
    )
  })

  test("AC3 — each note appears under its alias n1, n2, n3 in input order", async () => {
    const request = await promptFor()

    const segments = segmentsOf(request.prompt, ["n1", "n2", "n3"])
    expect(segments["n1"]).toContain("ALPHA-TEXT")
    expect(segments["n2"]).toContain("BRAVO-TEXT")
    expect(segments["n3"]).toContain("CHARLIE-TEXT")
  })

  test("AC3 — each note carries its path, date, links and text", async () => {
    const request = await promptFor()

    const segments = segmentsOf(request.prompt, ["n1", "n2", "n3"])
    NOTES.forEach((note, index) => {
      const segment = segments[`n${index + 1}`] as string
      expect(segment).toContain(note.path)
      expect(segment).toContain(note.text)
      if (note.date !== null) expect(segment).toContain(note.date)
      for (const link of note.links) expect(segment).toContain(link)
    })
  })

  test("AC3 — a link path belongs to the note that links to it", async () => {
    const request = await promptFor()

    const segments = segmentsOf(request.prompt, ["n1", "n2", "n3"])
    expect(segments["n1"]).toContain("people/bob.md")
    expect(segments["n2"]).not.toContain("people/bob.md")
    expect(segments["n2"]).toContain("projects/roadmap.md")
    expect(segments["n3"]).not.toContain("projects/roadmap.md")
  })

  test("AC3 — a note without a date is sent without a null date", async () => {
    const request = await promptFor()

    expect(request.prompt).toContain("CHARLIE-TEXT")
    expect(request.prompt).not.toMatch(/null|undefined/)
  })

  test("AC3 — the whole text of a long note is sent", async () => {
    const text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ")
    const request = await promptFor([
      { path: "notes/long.md", date: null, text, links: [] },
    ])

    expect(request.prompt).toContain(text)
  })

  test("AC3 — the schema accepts the scripted shape and rejects a malformed one", async () => {
    const { llm, calls } = fakeLLM(judgeOutput({ n1: { answer: 1 } }))
    await new LLMJudge(llm).judge(QUESTION, NOTES)
    const { schema } = calls[0] as JsonCall

    expect(
      schema.safeParse(judgeOutput({ n1: { answer: 0.5, none: 0.5 } })).success
    ).toBe(true)
    expect(schema.safeParse({ notes: "high" }).success).toBe(false)
    expect(schema.safeParse({ notes: [{ id: "n1" }] }).success).toBe(false)
    expect(
      schema.safeParse({
        notes: [{ id: "n1", answer: "yes", step: 0, none: 0 }],
      }).success
    ).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
  })
})

describe("AC4 — output mapping", () => {
  test("AC4 — maps the aliases back to the note paths", async () => {
    const result = await judged({
      n1: { answer: 0.75, step: 0.25, none: 0 },
      n2: { answer: 0, step: 0.5, none: 0.5 },
      n3: { answer: 0, step: 0, none: 1 },
    })

    expect(result.notes).toEqual({
      "people/alice.md": { answer: 0.75, step: 0.25, none: 0 },
      "projects/atlas.md": { answer: 0, step: 0.5, none: 0.5 },
      "meetings/sync.md": { answer: 0, step: 0, none: 1 },
    })
  })

  test("AC4 — the mapping does not depend on the order of the model's entries", async () => {
    const { llm } = fakeLLM({
      notes: [
        { id: "n3", answer: 0, step: 0, none: 1 },
        { id: "n1", answer: 1, step: 0, none: 0 },
        { id: "n2", answer: 0, step: 1, none: 0 },
      ],
    })

    const result = await new LLMJudge(llm).judge(QUESTION, NOTES)

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 1,
      step: 0,
      none: 0,
    })
    expect(result.notes["projects/atlas.md"]).toEqual({
      answer: 0,
      step: 1,
      none: 0,
    })
    expect(result.notes["meetings/sync.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })

  test("AC4 — an alias the model invented is ignored", async () => {
    const result = await judged({
      n1: { answer: 1 },
      n2: { step: 1 },
      n3: { none: 1 },
      n9: { answer: 1 },
      "projects/ghost.md": { answer: 1 },
    })

    expect(Object.keys(result.notes).sort()).toEqual(
      NOTES.map((note) => note.path).sort()
    )
  })

  test("AC4 — a note the model left out gets none = 1", async () => {
    const result = await judged({ n1: { answer: 0.9, step: 0.1 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0.9,
      step: 0.1,
      none: 0,
    })
    expect(result.notes["projects/atlas.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
    expect(result.notes["meetings/sync.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })

  test("AC4 — when the model answers no note at all, every note gets none = 1", async () => {
    const result = await judged({})

    for (const note of NOTES) {
      expect(result.notes[note.path]).toEqual({ answer: 0, step: 0, none: 1 })
    }
  })

  test("AC4 — values above 1 are clamped to 1", async () => {
    const result = await judged({ n1: { answer: 1.7, step: 0, none: 0 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 1,
      step: 0,
      none: 0,
    })
  })

  test("AC4 — negative values are clamped to 0", async () => {
    const result = await judged({ n1: { answer: 0.5, step: -0.3, none: 0.5 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0.5,
      step: 0,
      none: 0.5,
    })
  })

  test("AC4 — clamping comes before normalization", async () => {
    const result = await judged({ n1: { answer: 2, step: 1, none: -1 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0.5,
      step: 0.5,
      none: 0,
    })
  })

  test("AC4 — values that already sum to 1 are kept", async () => {
    const result = await judged({
      n1: { answer: 0.5, step: 0.25, none: 0.25 },
    })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0.5,
      step: 0.25,
      none: 0.25,
    })
  })

  test("AC4 — values are normalized to sum to 1, keeping their proportions", async () => {
    const result = await judged({ n1: { answer: 0.1, step: 0.1, none: 0.2 } })

    const verdicts = result.notes["people/alice.md"] as Record<Verdict, number>
    expect(verdicts.answer).toBeCloseTo(0.25, 10)
    expect(verdicts.step).toBeCloseTo(0.25, 10)
    expect(verdicts.none).toBeCloseTo(0.5, 10)
    expect(sum(verdicts)).toBeCloseTo(1, 10)
  })

  test("AC4 — equal values normalize to a third each", async () => {
    const result = await judged({ n1: { answer: 0.4, step: 0.4, none: 0.4 } })

    const verdicts = result.notes["people/alice.md"] as Record<Verdict, number>
    for (const verdict of VERDICTS) {
      expect(verdicts[verdict]).toBeCloseTo(1 / 3, 10)
    }
  })

  test("AC4 — a note whose three values are all 0 gets none = 1", async () => {
    const result = await judged({ n1: { answer: 0, step: 0, none: 0 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })

  test("AC4 — a note whose values are all negative gets none = 1", async () => {
    const result = await judged({ n1: { answer: -1, step: -0.5, none: -2 } })

    expect(result.notes["people/alice.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })

  test("AC4 — each note is normalized on its own", async () => {
    const result = await judged({
      n1: { answer: 0.3, step: 0.1, none: 0 },
      n2: { answer: 0, step: 0, none: 0.5 },
    })

    const first = result.notes["people/alice.md"] as Record<Verdict, number>
    expect(first.answer).toBeCloseTo(0.75, 10)
    expect(first.step).toBeCloseTo(0.25, 10)
    expect(first.none).toBe(0)
    expect(result.notes["projects/atlas.md"]).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })
})

describe("AC5 — budget and errors", () => {
  test("AC5 — maxTokens is a positive integer", async () => {
    for (const count of [1, 2, 10]) {
      const budget = await budgetFor(count)

      expect(Number.isInteger(budget)).toBe(true)
      expect(budget).toBeGreaterThan(0)
    }
  })

  test("AC5 — maxTokens grows by exactly 48 per note added", async () => {
    const two = await budgetFor(2)
    const three = await budgetFor(3)

    expect(three - two).toBe(48)
  })

  test("AC5 — maxTokens is a fixed base plus 48 per note across batch sizes", async () => {
    const one = await budgetFor(1)
    const five = await budgetFor(5)
    const thirty = await budgetFor(30)

    expect(five - one).toBe(4 * 48)
    expect(thirty - one).toBe(29 * 48)
  })

  test("AC5 — the budget depends on the number of notes, not on their length", async () => {
    const short = await promptFor(manyNotes(3))
    const long = await promptFor(
      manyNotes(3).map((note) => ({ ...note, text: "word ".repeat(400) }))
    )

    expect(long.maxTokens).toBe(short.maxTokens)
  })

  test("AC5 — with no note, makes no call and returns empty results", async () => {
    const { llm, calls } = fakeLLM()

    const result = await new LLMJudge(llm).judge(QUESTION, [])

    expect(calls).toHaveLength(0)
    expect(result).toEqual({ notes: {}, calls: [] })
  })

  test("AC5 — an LLMCallError passes through unchanged with its billed call", async () => {
    const error = new LLMCallError("bad JSON from the model", CALL)

    const caught = await rejection(
      new LLMJudge(failingLLM(error)).judge(QUESTION, NOTES)
    )

    expect(caught).toBe(error)
    expect((caught as LLMCallError).call).toEqual(CALL)
  })

  test("AC5 — an error of the API passes through unchanged", async () => {
    const error = new Error("529 overloaded")

    const caught = await rejection(
      new LLMJudge(failingLLM(error)).judge(QUESTION, NOTES)
    )

    expect(caught).toBe(error)
  })
})
