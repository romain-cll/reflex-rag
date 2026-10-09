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
function manyNotes(count: number, prefix = "a"): NoteForJudge[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `notes/${prefix}${index}.md`,
    date: index % 2 === 0 ? "2025-01-01" : null,
    text: `Text ${prefix}${index}.`,
    links:
      index === 0 ? [] : [`notes/${prefix}${index - 1}.md`, "people/bob.md"],
  }))
}

function noteInState(note: NoteForJudge) {
  return {
    path: note.path,
    date: note.date,
    links: note.links,
    text: note.text,
  }
}

/**
 * Distinct and recognisable: the call made for a batch whose first note is
 * `notes/a<n>.md` has latency `n`.
 */
function callFor(path: string): ModelCall {
  return {
    model: "fake-system-one",
    inputTokens: 100,
    outputTokens: 5,
    latencyMs: Number(/\d+/.exec(path)?.[0]),
  }
}

interface BatchScript {
  delayMs?: number
  error?: Error
}

interface FakeOptions {
  /** The probabilities answered for a note, by path (default: all on `answer`); undefined leaves the note without answer. */
  probabilities?: (path: string) => Record<string, number> | undefined
  /** The delay or error of a batch, by the path of its first note. */
  batch?: (firstPath: string) => BatchScript
}

interface StateOfRequest {
  question: string
  context?: Record<string, { path: string }>
  notes: Record<string, { path: string }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A fake system one that records its requests and the number of calls in
 * flight. It answers every question of a request about the note it names.
 */
function fakeSystemOne(options: FakeOptions = {}) {
  const requests: SystemOneRequest[] = []
  const completed: string[] = []
  let inFlight = 0
  let maxInFlight = 0
  const systemOne: SystemOne = {
    model: "fake-system-one",
    async decide(request) {
      requests.push(request)
      const state = request.state as StateOfRequest
      // Tolerates a state of another shape, so that it fails on an assertion.
      const firstPath = state.notes?.["n1"]?.path ?? "notes/a0.md"
      const { delayMs = 0, error } = options.batch?.(firstPath) ?? {}
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        await sleep(delayMs)
      } finally {
        inFlight -= 1
        completed.push(firstPath)
      }
      if (error) throw error
      const answers: Record<string, SystemOneAnswer> = {}
      for (const key of Object.keys(request.questions)) {
        const path = state.notes?.[key]?.path as string
        const probabilities = options.probabilities
          ? options.probabilities(path)
          : { answer: 1 }
        if (probabilities === undefined) continue
        answers[key] = {
          type: "choice",
          choice: "answer",
          probabilities,
          confidence: 0.5,
        }
      }
      return { answers, call: callFor(firstPath) }
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
  const { systemOne } = fakeSystemOne({ probabilities: () => probabilities })
  const result = await new SystemOneJudge(systemOne).judge(
    QUESTION,
    manyNotes(1)
  )
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
  test("AC7 — implements Judge", () => {
    const { systemOne } = fakeSystemOne()
    const judge: Judge = new SystemOneJudge(systemOne, { maxNotesPerCall: 4 })
    expect(typeof judge.judge).toBe("function")
  })

  test("AC7 — makes one decide call for all the notes", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(5))
    expect(requests).toHaveLength(1)
  })

  test("AC7 — the state holds the question and the notes n1..nM, and no context key without context", async () => {
    const notes = manyNotes(3)
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, notes)
    expect(requests[0]?.state).toStrictEqual({
      question: QUESTION,
      notes: {
        n1: noteInState(notes[0] as NoteForJudge),
        n2: noteInState(notes[1] as NoteForJudge),
        n3: noteInState(notes[2] as NoteForJudge),
      },
    })
  })

  test("AC7 — an empty context leaves out the context key", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(2), [])
    expect(Object.keys(requests[0]?.state as object)).toEqual([
      "question",
      "notes",
    ])
  })

  test("AC7 — the context notes are k1..kJ in the state", async () => {
    const notes = manyNotes(2)
    const context = manyNotes(2, "c")
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, notes, context)
    expect(requests[0]?.state).toStrictEqual({
      question: QUESTION,
      context: {
        k1: noteInState(context[0] as NoteForJudge),
        k2: noteInState(context[1] as NoteForJudge),
      },
      notes: {
        n1: noteInState(notes[0] as NoteForJudge),
        n2: noteInState(notes[1] as NoteForJudge),
      },
    })
  })

  test("AC7 — asks one closed question per scored note, keyed nK, and none for the context notes", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(3),
      manyNotes(2, "c")
    )
    const question = (key: string) => ({
      type: "choice" as const,
      instructions: `About note ${key} of the state only. ${JUDGE_QUESTION.instructions}`,
      criteria: JUDGE_QUESTION.criteria,
    })
    expect(requests[0]?.questions).toStrictEqual({
      n1: question("n1"),
      n2: question("n2"),
      n3: question("n3"),
    })
  })

  test("AC7 — makes no call and returns an empty judgement without a note", async () => {
    const { systemOne, requests } = fakeSystemOne()
    const judge = new SystemOneJudge(systemOne)
    expect(await judge.judge(QUESTION, [])).toEqual({ notes: {}, calls: [] })
    expect(await judge.judge(QUESTION, [], manyNotes(2, "c"))).toEqual({
      notes: {},
      calls: [],
    })
    expect(requests).toHaveLength(0)
  })

  test("AC7 — splits the notes into batches of at most maxNotesPerCall, in input order", async () => {
    const notes = manyNotes(7)
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne, { maxNotesPerCall: 3 }).judge(
      QUESTION,
      notes
    )
    const batches = requests
      .map((request) =>
        Object.values((request.state as StateOfRequest).notes).map(
          (note) => note.path
        )
      )
      .sort((a, b) => a[0]!.localeCompare(b[0]!))
    expect(batches).toEqual([
      ["notes/a0.md", "notes/a1.md", "notes/a2.md"],
      ["notes/a3.md", "notes/a4.md", "notes/a5.md"],
      ["notes/a6.md"],
    ])
  })

  test("AC7 — the aliases restart at n1 in each batch, with questions to match", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne, { maxNotesPerCall: 2 }).judge(
      QUESTION,
      manyNotes(5)
    )
    expect(requests).toHaveLength(3)
    const shapes = requests
      .map((request) => ({
        notes: Object.keys((request.state as StateOfRequest).notes),
        questions: Object.keys(request.questions),
      }))
      .sort((a, b) => b.notes.length - a.notes.length)
    expect(shapes).toEqual([
      { notes: ["n1", "n2"], questions: ["n1", "n2"] },
      { notes: ["n1", "n2"], questions: ["n1", "n2"] },
      { notes: ["n1"], questions: ["n1"] },
    ])
  })

  test("AC7 — the same context is in every batch", async () => {
    const context = manyNotes(2, "c")
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne, { maxNotesPerCall: 2 }).judge(
      QUESTION,
      manyNotes(5),
      context
    )
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect((request.state as StateOfRequest).context).toStrictEqual({
        k1: noteInState(context[0] as NoteForJudge),
        k2: noteInState(context[1] as NoteForJudge),
      })
      expect(
        Object.keys(request.questions).filter((key) => key.startsWith("k"))
      ).toEqual([])
    }
  })

  test("AC7 — the default is 40 notes per call", async () => {
    const forty = fakeSystemOne()
    await new SystemOneJudge(forty.systemOne).judge(QUESTION, manyNotes(40))
    expect(forty.requests).toHaveLength(1)

    const more = fakeSystemOne()
    await new SystemOneJudge(more.systemOne).judge(QUESTION, manyNotes(85))
    expect(
      more.requests
        .map(
          (request) =>
            Object.keys((request.state as StateOfRequest).notes).length
        )
        .sort((a, b) => b - a)
    ).toEqual([40, 40, 5])
  })

  test("AC7 — runs the batches in parallel", async () => {
    const run = fakeSystemOne({ batch: () => ({ delayMs: 20 }) })
    await new SystemOneJudge(run.systemOne, { maxNotesPerCall: 2 }).judge(
      QUESTION,
      manyNotes(8)
    )
    expect(run.requests).toHaveLength(4)
    expect(run.maxInFlight()).toBe(4)
  })

  test("AC7 — gives every note of every batch its own verdicts", async () => {
    const scripts: Record<string, Record<string, number>> = {
      "notes/a0.md": { answer: 1, step: 0, none: 0 },
      "notes/a1.md": { answer: 0, step: 1, none: 0 },
      "notes/a2.md": { answer: 0, step: 0, none: 1 },
      "notes/a3.md": { answer: 0.5, step: 0.5, none: 0 },
      "notes/a4.md": { answer: 0.25, step: 0.25, none: 0.5 },
    }
    const { systemOne } = fakeSystemOne({
      probabilities: (path) => scripts[path],
    })
    const result = await new SystemOneJudge(systemOne, {
      maxNotesPerCall: 2,
    }).judge(QUESTION, manyNotes(5))
    expect(result.notes).toEqual(scripts)
  })

  test("AC7 — a note without answer in the response gets none 1", async () => {
    const { systemOne } = fakeSystemOne({
      probabilities: (path) =>
        path === "notes/a1.md" ? undefined : { answer: 1 },
    })
    const result = await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(3)
    )
    expect(result.notes).toEqual({
      "notes/a0.md": { answer: 1, step: 0, none: 0 },
      "notes/a1.md": { answer: 0, step: 0, none: 1 },
      "notes/a2.md": { answer: 1, step: 0, none: 0 },
    })
  })

  test("AC2 — gives each note the probabilities of its own answer", async () => {
    const scripts: Record<string, Record<string, number>> = {
      "notes/a0.md": { answer: 0.5, step: 0.25, none: 0.25 },
      "notes/a1.md": { answer: 0, step: 0.75, none: 0.25 },
      "notes/a2.md": { answer: 0, step: 0, none: 1 },
    }
    const { systemOne } = fakeSystemOne({
      probabilities: (path) => scripts[path],
    })
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

  test("AC7 — calls hold one call per batch, in batch order, each tagged judge", async () => {
    const { systemOne } = fakeSystemOne()
    const result = await new SystemOneJudge(systemOne, {
      maxNotesPerCall: 2,
    }).judge(QUESTION, manyNotes(5))
    // Batches start at notes a0, a2 and a4.
    expect(result.calls).toEqual(
      [0, 2, 4].map((index) => ({
        ...callFor(`notes/a${index}.md`),
        role: "judge",
      }))
    )
  })

  test("AC7 — the result does not depend on the order in which batches complete", async () => {
    const scripts: Record<string, Record<string, number>> = {
      "notes/a0.md": { answer: 1, step: 0, none: 0 },
      "notes/a1.md": { answer: 0, step: 1, none: 0 },
      "notes/a2.md": { answer: 0, step: 0, none: 1 },
      "notes/a3.md": { answer: 0.5, step: 0.5, none: 0 },
    }
    // The first batch completes last.
    const delays: Record<string, number> = {
      "notes/a0.md": 40,
      "notes/a1.md": 30,
      "notes/a2.md": 20,
      "notes/a3.md": 1,
    }
    const run = fakeSystemOne({
      probabilities: (path) => scripts[path],
      batch: (firstPath) => ({ delayMs: delays[firstPath] }),
    })
    const result = await new SystemOneJudge(run.systemOne, {
      maxNotesPerCall: 1,
    }).judge(QUESTION, manyNotes(4))
    expect(run.completed).toEqual([
      "notes/a3.md",
      "notes/a2.md",
      "notes/a1.md",
      "notes/a0.md",
    ])
    expect(result.notes).toEqual(scripts)
    expect(result.calls.map((call) => call.latencyMs)).toEqual([0, 1, 2, 3])
  })

  test("AC4 — a failed batch makes the judge wait for the other batches, then throw an error carrying the completed calls", async () => {
    const failure = new Error("boom")
    // Batches start at notes a0, a2, a4 and a6; the second one fails.
    const run = fakeSystemOne({
      batch: (firstPath) =>
        firstPath === "notes/a2.md"
          ? { error: failure }
          : { delayMs: firstPath === "notes/a6.md" ? 60 : 30 },
    })
    const error = await rejection(
      new SystemOneJudge(run.systemOne, { maxNotesPerCall: 2 }).judge(
        QUESTION,
        manyNotes(8)
      )
    )
    // Every batch had completed by the time the judge rejected.
    expect(run.completed).toHaveLength(4)
    expect(error.message).toContain("boom")
    expect(error.calls).toHaveLength(3)
    const completed = (error.calls ?? [])
      .map(({ latencyMs, model }) => ({ latencyMs, model }))
      .sort((a, b) => a.latencyMs - b.latencyMs)
    expect(completed).toEqual(
      [0, 4, 6].map((index) => ({ latencyMs: index, model: "fake-system-one" }))
    )
  })

  test("AC4 — without a failing batch there is no error", async () => {
    const { systemOne } = fakeSystemOne({ batch: () => ({ delayMs: 1 }) })
    const result = await new SystemOneJudge(systemOne, {
      maxNotesPerCall: 1,
    }).judge(QUESTION, manyNotes(3))
    expect(result.calls).toHaveLength(3)
  })

  test("AC4 — when every batch fails, the error carries no call", async () => {
    const run = fakeSystemOne({ batch: () => ({ error: new Error("down") }) })
    const error = await rejection(
      new SystemOneJudge(run.systemOne, { maxNotesPerCall: 1 }).judge(
        QUESTION,
        manyNotes(3)
      )
    )
    expect(error.calls).toEqual([])
  })

  test("AC4 — a single failing call carries no call", async () => {
    const run = fakeSystemOne({ batch: () => ({ error: new Error("down") }) })
    const error = await rejection(
      new SystemOneJudge(run.systemOne).judge(QUESTION, manyNotes(3))
    )
    expect(error.message).toContain("down")
    expect(error.calls).toEqual([])
  })
})
