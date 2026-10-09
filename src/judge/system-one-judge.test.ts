import { describe, expect, test } from "bun:test"
import type { Judge, NoteForJudge } from "../core/judge.ts"
import type {
  SystemOne,
  SystemOneAnswer,
  SystemOneRequest,
} from "../core/system-one.ts"
import type { ModelCall } from "../core/types.ts"
import { JUDGE_QUESTION } from "./question.ts"
// A namespace import: a symbol that is not exported yet fails its own tests,
// not the whole file.
import * as questionModule from "./question.ts"
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

/** `JUDGE_CROSS_QUESTION`, typed here since it is not exported yet. */
function crossQuestion(): {
  instructions: (alias: string) => string
  criteria: (alias: string) => Record<string, string>
} {
  return (
    questionModule as unknown as {
      JUDGE_CROSS_QUESTION: ReturnType<typeof crossQuestion>
    }
  ).JUDGE_CROSS_QUESTION
}

const CROSS_INSTRUCTIONS =
  "Read all the notes in the state. Taking into account what the other notes say, what does note n1 give for answering the question?"
const BEST_INSTRUCTIONS =
  "According to all the notes, which note states the answer to the question as it stands?"

describe("system-one-judge AC11 — generic wording of the step criterion", () => {
  test("system-one-judge AC11 — the step verdict is described word for word", () => {
    expect(JUDGE_QUESTION.criteria.step).toBe(
      "The note does not state the answer, but it identifies something the answer depends on, or it links to a note likely to hold the answer."
    )
  })

  test("system-one-judge AC11 — the system one is asked the question with that wording", async () => {
    const { systemOne, requests } = fakeSystemOne()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(1))
    const asked = requests[0]?.questions["n1"] as { criteria: unknown }
    expect(asked.criteria).toEqual({
      answer: "The note states the answer to the question, or a part of it.",
      step: "The note does not state the answer, but it identifies something the answer depends on, or it links to a note likely to hold the answer.",
      none: "The note does not help answer the question.",
    })
  })
})

describe("system-one-judge AC12 — veto questions", () => {
  test("system-one-judge AC12 — JUDGE_CROSS_QUESTION.instructions(alias) is the exact wording of the spec", () => {
    const JUDGE_CROSS_QUESTION = crossQuestion()
    expect(JUDGE_CROSS_QUESTION.instructions("n1")).toBe(CROSS_INSTRUCTIONS)
    expect(JUDGE_CROSS_QUESTION.instructions("n12")).toBe(
      CROSS_INSTRUCTIONS.replace("note n1", "note n12")
    )
  })

  test("system-one-judge AC12 — JUDGE_CROSS_QUESTION.criteria(alias) describes answer, step and none word for word", () => {
    const JUDGE_CROSS_QUESTION = crossQuestion()
    expect(JUDGE_CROSS_QUESTION.criteria("n3")).toStrictEqual({
      answer:
        "Note n3 states the answer, and no other note shows that this information is outdated or superseded.",
      step: "Note n3 does not state the answer, but it identifies something the answer depends on, or links to a note likely to hold it.",
      none: "Note n3 does not help: it is off topic, about another entity than the one the question asks about, or outdated according to other notes.",
    })
  })

  test("system-one-judge AC12 — JUDGE_BEST_QUESTION is the exact wording of the spec", () => {
    expect(
      (questionModule as unknown as { JUDGE_BEST_QUESTION: string })
        .JUDGE_BEST_QUESTION
    ).toBe(BEST_INSTRUCTIONS)
  })
})

interface VetoFakeOptions {
  /** The probabilities answered to the cross question of a note, by path (undefined: no answer). */
  cross?: (path: string) => Record<string, number> | undefined
  /** The probabilities answered to the best question, from the paths of the batch in alias order (undefined: no answer). */
  best?: (paths: string[]) => Record<string, number> | undefined
  /** The delay of a batch, by the path of its first note. */
  delayMs?: (firstPath: string) => number
}

/**
 * A fake system one that answers the verdict question of every note with
 * `answer` (0.9 / 0.05 / 0.05), the cross question `xK` and the `best`
 * question from the scripts.
 */
function vetoFake(options: VetoFakeOptions = {}) {
  const requests: SystemOneRequest[] = []
  const systemOne: SystemOne = {
    model: "fake-system-one",
    async decide(request) {
      requests.push(request)
      const notes = (request.state as StateOfRequest).notes
      const paths = Object.keys(notes)
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
        .map((key) => notes[key]!.path)
      await sleep(options.delayMs?.(paths[0] ?? "") ?? 0)
      const answers: Record<string, SystemOneAnswer> = {}
      const give = (key: string, probabilities?: Record<string, number>) => {
        if (probabilities === undefined) return
        answers[key] = {
          type: "choice",
          choice: "none",
          probabilities,
          confidence: 0.5,
        }
      }
      for (const key of Object.keys(request.questions)) {
        if (/^n\d+$/.test(key)) {
          give(key, { answer: 0.9, step: 0.05, none: 0.05 })
        } else if (/^x\d+$/.test(key)) {
          const path = notes[`n${key.slice(1)}`]?.path as string
          give(key, options.cross?.(path))
        } else if (key === "best") {
          give(key, options.best?.(paths))
        }
      }
      return {
        answers,
        call: {
          model: "fake-system-one",
          inputTokens: 100,
          outputTokens: 5,
          latencyMs: 1,
        },
      }
    },
  }
  return { systemOne, requests }
}

const VETO = { none: 0.7, best: 0.02 }

/** A judge with the veto option, which the options type may not know yet. */
function vetoJudge(systemOne: SystemOne, extra: object = {}) {
  return new SystemOneJudge(systemOne, { veto: VETO, ...extra })
}

/** The paths vetoed, whether the judgement has the field or not. */
function vetoedOf(result: object): string[] | undefined {
  return (result as { vetoed?: string[] }).vetoed
}

const NONE_HIGH = { answer: 0.1, step: 0.1, none: 0.8 }
const NONE_LOW = { answer: 0.8, step: 0.1, none: 0.1 }
const VETOED_VERDICT = { answer: 0, step: 0, none: 1 }

describe("system-one-judge AC13 — the questions of the veto", () => {
  test("system-one-judge AC13 — without veto, the request holds only the questions nK: no xK, no best", async () => {
    const { systemOne, requests } = vetoFake()
    await new SystemOneJudge(systemOne).judge(QUESTION, manyNotes(3))
    expect(Object.keys(requests[0]?.questions ?? {}).sort()).toEqual([
      "n1",
      "n2",
      "n3",
    ])
  })

  test("system-one-judge AC13 — without veto, the judgement has no vetoed note", async () => {
    const { systemOne } = vetoFake()
    const result = await new SystemOneJudge(systemOne).judge(
      QUESTION,
      manyNotes(2)
    )
    expect(vetoedOf(result) ?? []).toEqual([])
  })

  test("system-one-judge AC13 — with veto, the call also holds xK for every scored note and one best question, still one call", async () => {
    const { systemOne, requests } = vetoFake()
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(3))
    expect(requests).toHaveLength(1)
    expect(result.calls).toHaveLength(1)
    expect(Object.keys(requests[0]?.questions ?? {}).sort()).toEqual([
      "best",
      "n1",
      "n2",
      "n3",
      "x1",
      "x2",
      "x3",
    ])
  })

  test("system-one-judge AC13 — the nK questions are unchanged with a veto", async () => {
    const { systemOne, requests } = vetoFake()
    await vetoJudge(systemOne).judge(QUESTION, manyNotes(2))
    expect(requests[0]?.questions["n2"]).toStrictEqual({
      type: "choice",
      instructions: `About note n2 of the state only. ${JUDGE_QUESTION.instructions}`,
      criteria: JUDGE_QUESTION.criteria,
    })
  })

  test("system-one-judge AC13 — xK is a choice question built from JUDGE_CROSS_QUESTION for nK", async () => {
    const { systemOne, requests } = vetoFake()
    await vetoJudge(systemOne).judge(QUESTION, manyNotes(3))
    const JUDGE_CROSS_QUESTION = crossQuestion()
    expect(requests[0]?.questions["x1"]).toStrictEqual({
      type: "choice",
      instructions: CROSS_INSTRUCTIONS,
      criteria: JUDGE_CROSS_QUESTION.criteria("n1"),
    })
    expect(requests[0]?.questions["x3"]).toStrictEqual({
      type: "choice",
      instructions: CROSS_INSTRUCTIONS.replace("note n1", "note n3"),
      criteria: JUDGE_CROSS_QUESTION.criteria("n3"),
    })
  })

  test("system-one-judge AC13 — best is a choice among the aliases of the batch, each described Note nK, plus none", async () => {
    const { systemOne, requests } = vetoFake()
    await vetoJudge(systemOne).judge(QUESTION, manyNotes(3), manyNotes(2, "c"))
    expect(requests[0]?.questions["best"]).toStrictEqual({
      type: "choice",
      instructions: BEST_INSTRUCTIONS,
      criteria: {
        n1: "Note n1",
        n2: "Note n2",
        n3: "Note n3",
        none: "No note states the answer.",
      },
    })
  })

  test("system-one-judge AC13 — the context notes get no xK and are not options of best", async () => {
    const { systemOne, requests } = vetoFake()
    await vetoJudge(systemOne).judge(QUESTION, manyNotes(2), manyNotes(2, "c"))
    const keys = Object.keys(requests[0]?.questions ?? {})
    expect(keys.filter((key) => key.startsWith("k"))).toEqual([])
    expect(Object.keys(requests[0]?.state as object)).toContain("context")
    const best = requests[0]?.questions["best"] as {
      criteria: Record<string, string>
    }
    expect(Object.keys(best.criteria).sort()).toEqual(["n1", "n2", "none"])
  })

  test("system-one-judge AC13 — with veto and no note, no call is made", async () => {
    const { systemOne, requests } = vetoFake()
    const result = await vetoJudge(systemOne).judge(QUESTION, [])
    expect(requests).toHaveLength(0)
    expect(result.notes).toEqual({})
    expect(result.calls).toEqual([])
  })

  test("system-one-judge AC13 — per batch, the aliases and the options of best restart at n1", async () => {
    const { systemOne, requests } = vetoFake()
    await vetoJudge(systemOne, { maxNotesPerCall: 2 }).judge(
      QUESTION,
      manyNotes(3)
    )
    expect(requests).toHaveLength(2)
    const shapes = requests
      .map((request) => ({
        questions: Object.keys(request.questions).sort(),
        options: Object.keys(
          (request.questions["best"] as { criteria: object }).criteria
        ).sort(),
      }))
      .sort((a, b) => b.questions.length - a.questions.length)
    expect(shapes).toEqual([
      {
        questions: ["best", "n1", "n2", "x1", "x2"],
        options: ["n1", "n2", "none"],
      },
      { questions: ["best", "n1", "x1"], options: ["n1", "none"] },
    ])
  })
})

describe("system-one-judge AC13 — the veto", () => {
  test("system-one-judge AC13 — a note whose none probability reaches veto.none and whose best probability is under veto.best is vetoed", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => ({ n1: 0.01, none: 0.99 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(result.notes["notes/a0.md"]).toEqual(VETOED_VERDICT)
    expect(vetoedOf(result)).toEqual(["notes/a0.md"])
  })

  test("system-one-judge AC13 — only the vetoed notes change verdict, and vetoed lists them in input order", async () => {
    const { systemOne } = vetoFake({
      cross: (path) => (path === "notes/a1.md" ? NONE_LOW : NONE_HIGH),
      best: () => ({ n2: 0.9, n1: 0.005, n3: 0.005, none: 0.09 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(4))
    // n2 (a1) has a low none and a high best; n3 (a2) is vetoed; n1, n3, n4 are under veto.best.
    expect(vetoedOf(result)).toEqual([
      "notes/a0.md",
      "notes/a2.md",
      "notes/a3.md",
    ])
    expect(result.notes["notes/a0.md"]).toEqual(VETOED_VERDICT)
    expect(result.notes["notes/a2.md"]).toEqual(VETOED_VERDICT)
    expect(result.notes["notes/a3.md"]).toEqual(VETOED_VERDICT)
    expect(result.notes["notes/a1.md"]?.answer).toBeCloseTo(0.9, 10)
    expect(result.notes["notes/a1.md"]?.none).toBeCloseTo(0.05, 10)
  })

  test("system-one-judge AC13 — a veto leaves the call and the other judgement fields as they are", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => ({ n1: 0, none: 1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(2))
    expect(Object.keys(result.notes).sort()).toEqual([
      "notes/a0.md",
      "notes/a1.md",
    ])
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0]?.role).toBe("judge")
  })

  test("system-one-judge AC13 — nothing vetoed: vetoed is an empty list and the verdicts are those of the per-note questions", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_LOW,
      best: () => ({ n1: 0.5, n2: 0.4, none: 0.1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(2))
    expect(vetoedOf(result)).toEqual([])
    expect(result.notes["notes/a0.md"]?.answer).toBeCloseTo(0.9, 10)
    expect(result.notes["notes/a1.md"]?.answer).toBeCloseTo(0.9, 10)
  })

  test("system-one-judge AC13 — a none probability exactly at veto.none vetoes", async () => {
    const { systemOne } = vetoFake({
      cross: () => ({ answer: 0.15, step: 0.15, none: 0.7 }),
      best: () => ({ n1: 0, none: 1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual(["notes/a0.md"])
    expect(result.notes["notes/a0.md"]).toEqual(VETOED_VERDICT)
  })

  test("system-one-judge AC13 — a none probability just under veto.none does not veto", async () => {
    const { systemOne } = vetoFake({
      cross: () => ({ answer: 0.16, step: 0.15, none: 0.69 }),
      best: () => ({ n1: 0, none: 1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual([])
    expect(result.notes["notes/a0.md"]?.answer).toBeCloseTo(0.9, 10)
  })

  test("system-one-judge AC13 — a best probability exactly at veto.best does not veto", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => ({ n1: 0.02, none: 0.98 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual([])
    expect(result.notes["notes/a0.md"]?.answer).toBeCloseTo(0.9, 10)
  })

  test("system-one-judge AC13 — a best probability just under veto.best vetoes", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => ({ n1: 0.019, none: 0.981 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual(["notes/a0.md"])
  })

  test("system-one-judge AC13 — a note the best question picks is not vetoed even when the cross question rejects it", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => ({ n1: 0.9, none: 0.1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual([])
  })

  test("system-one-judge AC13 — a note the cross question accepts is not vetoed even when best ignores it", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_LOW,
      best: () => ({ n1: 0, none: 1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(result)).toEqual([])
  })

  test("system-one-judge AC13 — the thresholds are those given: a higher veto.none spares a note a lower one vetoes", async () => {
    const cross = () => NONE_HIGH
    const best = () => ({ n1: 0, none: 1 })
    const lax = vetoFake({ cross, best })
    const strict = vetoFake({ cross, best })
    const high = await new SystemOneJudge(lax.systemOne, {
      veto: { none: 0.9, best: 0.02 },
    }).judge(QUESTION, manyNotes(1))
    const low = await new SystemOneJudge(strict.systemOne, {
      veto: { none: 0.5, best: 0.02 },
    }).judge(QUESTION, manyNotes(1))
    expect(vetoedOf(high)).toEqual([])
    expect(vetoedOf(low)).toEqual(["notes/a0.md"])
  })

  test("system-one-judge AC13 — a missing xK answer: that note is not vetoed", async () => {
    const { systemOne } = vetoFake({
      cross: (path) => (path === "notes/a0.md" ? undefined : NONE_HIGH),
      best: () => ({ n1: 0, n2: 0, none: 1 }),
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(2))
    expect(vetoedOf(result)).toEqual(["notes/a1.md"])
    expect(result.notes["notes/a0.md"]?.answer).toBeCloseTo(0.9, 10)
  })

  test("system-one-judge AC13 — a missing best answer: no note is vetoed", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      best: () => undefined,
    })
    const result = await vetoJudge(systemOne).judge(QUESTION, manyNotes(3))
    expect(vetoedOf(result)).toEqual([])
    for (const verdict of Object.values(result.notes)) {
      expect(verdict.answer).toBeCloseTo(0.9, 10)
    }
  })

  test("system-one-judge AC13 — per batch: a best answer is read against the notes of its own batch, and vetoed keeps the input order across batches", async () => {
    const { systemOne } = vetoFake({
      cross: () => NONE_HIGH,
      // The first batch (a0, a1) picks its n2; the second (a2, a3) its n1.
      best: (paths) =>
        paths[0] === "notes/a0.md"
          ? { n1: 0, n2: 0.95, none: 0.05 }
          : { n1: 0.95, n2: 0, none: 0.05 },
      // The second batch answers first.
      delayMs: (firstPath) => (firstPath === "notes/a0.md" ? 20 : 0),
    })
    const result = await vetoJudge(systemOne, { maxNotesPerCall: 2 }).judge(
      QUESTION,
      manyNotes(4)
    )
    expect(vetoedOf(result)).toEqual(["notes/a0.md", "notes/a3.md"])
    expect(result.notes["notes/a1.md"]?.answer).toBeCloseTo(0.9, 10)
    expect(result.notes["notes/a2.md"]?.answer).toBeCloseTo(0.9, 10)
    expect(result.notes["notes/a0.md"]).toEqual(VETOED_VERDICT)
    expect(result.notes["notes/a3.md"]).toEqual(VETOED_VERDICT)
  })
})
