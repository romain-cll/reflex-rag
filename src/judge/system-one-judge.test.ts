import { describe, expect, test } from "bun:test"
import type { Judge, NoteForJudge } from "../core/judge.ts"
import type {
  SystemOne,
  SystemOneAnswer,
  SystemOneRequest,
} from "../core/system-one.ts"
import type { ModelCall } from "../core/types.ts"
import { JUDGE_QUESTION } from "./question.ts"
import { SystemOneJudge } from "./system-one-judge.ts"

const QUESTION = "Who leads the Atlas project?"

/** `count` notes `notes/a0.md`, `notes/a1.md`, … */
function manyNotes(count: number): NoteForJudge[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `notes/a${index}.md`,
    date: index % 2 === 0 ? "2025-01-01" : null,
    text: `Text ${index}.`,
    links: index === 0 ? [] : [`notes/a${index - 1}.md`, "people/bob.md"],
  }))
}

/** Distinct and recognisable: the call made for `notes/a<n>.md` has latency `n`. */
function callFor(path: string): ModelCall {
  return {
    model: "fake-system-one",
    inputTokens: 100,
    outputTokens: 5,
    latencyMs: Number(/\d+/.exec(path)?.[0]),
  }
}

interface Script {
  probabilities?: Record<string, number>
  delayMs?: number
  error?: Error
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A fake system one that records its requests and the number of calls in
 * flight. `script` says, by note path, which probabilities to answer, after
 * which delay, or which error to throw (default: all on `answer`, at once).
 */
function fakeSystemOne(script: (path: string) => Script = () => ({})) {
  const requests: SystemOneRequest[] = []
  const completed: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  const systemOne: SystemOne = {
    model: "fake-system-one",
    async decide(request) {
      requests.push(request)
      const path = (request.state as { note: { path: string } }).note.path
      const { probabilities = { answer: 1 }, delayMs = 0, error } = script(path)
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        await sleep(delayMs)
      } finally {
        inFlight -= 1
        completed.push(path)
      }
      if (error) throw error
      const answer: SystemOneAnswer = {
        type: "choice",
        choice: "answer",
        probabilities,
        confidence: 0.5,
      }
      return { answers: { verdict: answer }, call: callFor(path) }
    },
  }
  return {
    systemOne,
    requests,
    completed,
    maxInFlight: () => maxInFlight,
  }
}

/** Judges one note whose answer carries `probabilities`. */
async function mapped(probabilities: Record<string, number>) {
  const { systemOne } = fakeSystemOne(() => ({ probabilities }))
  const [note] = manyNotes(1)
  const result = await new SystemOneJudge(systemOne).judge(QUESTION, [
    note as NoteForJudge,
  ])
  return result.notes["notes/a0.md"]
}

async function rejection(
  promise: Promise<unknown>
): Promise<Error & { calls?: ModelCall[] }> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error("expected the promise to reject")
}

describe("SystemOneJudge", () => {
  test("AC1 — implements Judge", () => {
    const { systemOne } = fakeSystemOne()
    const judge: Judge = new SystemOneJudge(systemOne, { concurrency: 4 })
    expect(typeof judge.judge).toBe("function")
  })

  test("AC1 — makes one decide call per note", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(5))
    expect(requests).toHaveLength(5)
  })

  test("AC1 — the state holds the question and the whole note, and nothing else", async () => {
    const notes = manyNotes(3)
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, notes)
    const states = requests.map((request) => request.state)
    for (const note of notes) {
      expect(states).toContainEqual({
        question: QUESTION,
        note: {
          path: note.path,
          date: note.date,
          links: note.links,
          text: note.text,
        },
      })
    }
  })

  test("AC1 — asks the closed question of JUDGE_QUESTION as a choice named verdict", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(2))
    for (const request of requests) {
      expect(request.questions).toEqual({
        verdict: {
          type: "choice",
          instructions: JUDGE_QUESTION.instructions,
          criteria: JUDGE_QUESTION.criteria,
        },
      })
    }
  })

  test("AC1 — makes no call and returns an empty judgement without a note", async () => {
    const { systemOne, requests } = fakeSystemOne()
    const result = await new SystemOneJudge(systemOne).judge(QUESTION, [])
    expect(requests).toHaveLength(0)
    expect(result).toEqual({ notes: {}, calls: [] })
  })

  test("AC2 — gives each note the probabilities of its own answer", async () => {
    const scripts: Record<string, Record<string, number>> = {
      "notes/a0.md": { answer: 0.5, step: 0.25, none: 0.25 },
      "notes/a1.md": { answer: 0, step: 0.75, none: 0.25 },
      "notes/a2.md": { answer: 0, step: 0, none: 1 },
    }
    const { systemOne } = fakeSystemOne((path) => ({
      probabilities: scripts[path],
    }))
    const result = await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(3)
    )
    expect(result.notes).toEqual(scripts)
  })

  test("AC2 — clamps probabilities to [0, 1] then normalizes to sum to 1", async () => {
    // clamp: answer 1, step 0, none 1 -> 0.5, 0, 0.5
    expect(await mapped({ answer: 2, step: -1, none: 1 })).toEqual({
      answer: 0.5,
      step: 0,
      none: 0.5,
    })
  })

  test("AC2 — normalizes probabilities that do not sum to 1", async () => {
    const verdicts = await mapped({ answer: 0.2, step: 0.2, none: 0.2 })
    expect(verdicts?.answer).toBeCloseTo(1 / 3, 10)
    expect(verdicts?.step).toBeCloseTo(1 / 3, 10)
    expect(verdicts?.none).toBeCloseTo(1 / 3, 10)
  })

  test("AC2 — a missing option counts 0", async () => {
    expect(await mapped({ answer: 0.25, step: 0.25 })).toEqual({
      answer: 0.5,
      step: 0.5,
      none: 0,
    })
  })

  test("AC2 — ignores options that are not verdicts", async () => {
    expect(
      await mapped({ answer: 0.25, step: 0.25, none: 0.5, other: 0.9 })
    ).toEqual({ answer: 0.25, step: 0.25, none: 0.5 })
  })

  test("AC2 — all zero gives none 1", async () => {
    const zero = { answer: 0, step: 0, none: 1 }
    expect(await mapped({ answer: 0, step: 0, none: 0 })).toEqual(zero)
    expect(await mapped({})).toEqual(zero)
  })

  test("AC2 — all zero once clamped gives none 1", async () => {
    expect(await mapped({ answer: -0.5, step: -2 })).toEqual({
      answer: 0,
      step: 0,
      none: 1,
    })
  })

  test("AC2 — calls follow the order of the notes, each tagged judge", async () => {
    const { systemOne } = fakeSystemOne()
    const result = await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(4)
    )
    expect(result.calls).toEqual(
      [0, 1, 2, 3].map((index) => ({
        ...callFor(`notes/a${index}.md`),
        role: "judge",
      }))
    )
  })

  test("AC3 — never has more than `concurrency` calls in flight", async () => {
    const run = fakeSystemOne(() => ({ delayMs: 10 }))
    await new SystemOneJudge(run.systemOne, { concurrency: 3 }).judge(
      QUESTION,
      manyNotes(12)
    )
    expect(run.requests).toHaveLength(12)
    expect(run.maxInFlight()).toBe(3)
  })

  test("AC3 — concurrency 1 makes the calls one after the other", async () => {
    const run = fakeSystemOne(() => ({ delayMs: 5 }))
    await new SystemOneJudge(run.systemOne, { concurrency: 1 }).judge(
      QUESTION,
      manyNotes(4)
    )
    expect(run.maxInFlight()).toBe(1)
  })

  test("AC3 — the default concurrency is 16", async () => {
    const run = fakeSystemOne(() => ({ delayMs: 20 }))
    await new SystemOneJudge(run.systemOne).judge(QUESTION, manyNotes(40))
    expect(run.requests).toHaveLength(40)
    expect(run.maxInFlight()).toBe(16)
  })

  test("AC3 — the result does not depend on the order in which calls complete", async () => {
    const scripts: Record<string, Record<string, number>> = {
      "notes/a0.md": { answer: 1, step: 0, none: 0 },
      "notes/a1.md": { answer: 0, step: 1, none: 0 },
      "notes/a2.md": { answer: 0, step: 0, none: 1 },
      "notes/a3.md": { answer: 0.5, step: 0.5, none: 0 },
    }
    // The first note completes last.
    const delays: Record<string, number> = {
      "notes/a0.md": 40,
      "notes/a1.md": 30,
      "notes/a2.md": 20,
      "notes/a3.md": 1,
    }
    const run = fakeSystemOne((path) => ({
      probabilities: scripts[path],
      delayMs: delays[path],
    }))
    const result = await new SystemOneJudge(run.systemOne).judge(
      QUESTION,
      manyNotes(4)
    )
    expect(run.completed).toEqual([
      "notes/a3.md",
      "notes/a2.md",
      "notes/a1.md",
      "notes/a0.md",
    ])
    expect(result.notes).toEqual(scripts)
    expect(result.calls.map((call) => call.latencyMs)).toEqual([0, 1, 2, 3])
  })

  test("AC4 — waits for the other calls, then throws an error carrying the completed calls", async () => {
    const failure = new Error("boom")
    const run = fakeSystemOne((path) =>
      path === "notes/a1.md"
        ? { error: failure }
        : { delayMs: path === "notes/a3.md" ? 60 : 30 }
    )
    const error = await rejection(
      new SystemOneJudge(run.systemOne).judge(QUESTION, manyNotes(4))
    )
    // Every call had completed by the time the judge rejected.
    expect(run.completed).toHaveLength(4)
    expect(error.message).toContain("boom")
    expect(error.calls).toHaveLength(3)
    expect(error.calls).toEqual(
      expect.arrayContaining(
        [0, 2, 3].map((index) =>
          expect.objectContaining({
            latencyMs: index,
            model: "fake-system-one",
          })
        )
      )
    )
  })

  test("AC4 — without a failing call there is no error", async () => {
    const { systemOne } = fakeSystemOne(() => ({ delayMs: 1 }))
    const result = await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(3)
    )
    expect(result.calls).toHaveLength(3)
  })

  test("AC4 — when every call fails, the error carries no call", async () => {
    const run = fakeSystemOne(() => ({ error: new Error("down") }))
    const error = await rejection(
      new SystemOneJudge(run.systemOne).judge(QUESTION, manyNotes(3))
    )
    expect(error.calls).toEqual([])
  })
})
