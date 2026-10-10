import { describe, expect, test } from "bun:test"
import type { Judge, Judgement, NoteForJudge, Verdict } from "../core/judge.ts"
import { LLMCallError } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { FallbackJudge } from "./fallback-judge.ts"

const QUESTION = "Who leads the Atlas project?"

function makeNotes(count: number, prefix: string): NoteForJudge[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `notes/${prefix}${index}.md`,
    date: "2025-01-01",
    text: `Text ${prefix}${index}.`,
    links: [],
  }))
}

const NOTES = makeNotes(5, "a")
const CONTEXT = makeNotes(2, "c")

type Verdicts = Record<Verdict, number>

const LOW = 0.3

/** A stand-in for the policy of config C: kept above 0.6 on answer or step. */
function isKept(verdict: Verdicts): boolean {
  return verdict.answer >= 0.6 || verdict.step >= 0.6
}

const KEPT_ANSWER: Verdicts = { answer: 0.75, step: 0.25, none: 0 }
const KEPT_STEP: Verdicts = { answer: 0.25, step: 0.75, none: 0 }
const GREY_ANSWER: Verdicts = { answer: 0.5, step: 0.25, none: 0.25 }
const GREY_STEP: Verdicts = { answer: 0.25, step: 0.5, none: 0.25 }
const NONE: Verdicts = { answer: 0.125, step: 0.125, none: 0.75 }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function callOf(model: string, path: string): ModelCall {
  return {
    model,
    inputTokens: 10,
    outputTokens: 1,
    latencyMs: Number(/\d+/.exec(path)?.[0]),
    role: "judge",
  }
}

interface JudgeRequest {
  question: string
  notes: NoteForJudge[]
  context: NoteForJudge[] | undefined
}

/**
 * A fake judge that records its requests and answers each note from
 * `verdicts` (by path), with one call per note and an optional delay.
 */
function fakeJudge(
  model: string,
  verdicts: Record<string, Verdicts>,
  options: { delayMs?: number; error?: Error } = {}
) {
  const requests: JudgeRequest[] = []
  const judge: Judge = {
    async judge(
      question: string,
      notes: NoteForJudge[],
      context?: NoteForJudge[]
    ): Promise<Judgement> {
      requests.push({ question, notes, context })
      await sleep(options.delayMs ?? 0)
      if (options.error) throw options.error
      return {
        notes: Object.fromEntries(
          notes.map((note) => [note.path, verdicts[note.path] as Verdicts])
        ),
        calls: notes.map((note) => callOf(model, note.path)),
      }
    },
  }
  return { judge, requests }
}

/**
 * Primary: notes 0 and 2 are kept, 1 and 3 are in the grey zone, 4 is a clear
 * miss. Fallback: its own verdicts for the grey notes.
 */
const PRIMARY_VERDICTS: Record<string, Verdicts> = {
  "notes/a0.md": KEPT_ANSWER,
  "notes/a1.md": GREY_ANSWER,
  "notes/a2.md": KEPT_STEP,
  "notes/a3.md": GREY_STEP,
  "notes/a4.md": NONE,
}

const FALLBACK_VERDICTS: Record<string, Verdicts> = {
  "notes/a1.md": { answer: 1, step: 0, none: 0 },
  "notes/a3.md": { answer: 0, step: 0, none: 1 },
}

function setup(options: { low?: number } = {}) {
  const primary = fakeJudge("primary", PRIMARY_VERDICTS)
  const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
  const judge = new FallbackJudge(primary.judge, fallback.judge, {
    low: options.low ?? LOW,
    isKept,
  })
  return { primary, fallback, judge }
}

/** Judges `notes` whose primary verdicts are `verdicts`; returns the fallback requests. */
async function fallbackRequests(
  verdicts: Record<string, Verdicts>,
  low: number,
  keep: (verdict: Verdicts) => boolean = isKept
) {
  const notes = NOTES.filter((note) => note.path in verdicts)
  const primary = fakeJudge("primary", verdicts)
  const fallback = fakeJudge("fallback", verdicts)
  const judge = new FallbackJudge(primary.judge, fallback.judge, {
    low,
    isKept: keep,
  })
  const result = await judge.judge(QUESTION, notes)
  return { requests: fallback.requests, result }
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

describe("FallbackJudge", () => {
  test("AC8 — implements Judge and judges every note with the primary", async () => {
    const { primary, judge } = setup()
    const asJudge: Judge = judge
    await asJudge.judge(QUESTION, NOTES)
    expect(primary.requests).toHaveLength(1)
    expect(primary.requests[0]?.question).toBe(QUESTION)
    expect(primary.requests[0]?.notes).toEqual(NOTES)
  })

  test("AC8 — the primary receives the context it was given", async () => {
    const { primary, judge } = setup()
    await judge.judge(QUESTION, NOTES, CONTEXT)
    expect(primary.requests[0]?.context).toEqual(CONTEXT)
  })

  test("AC8 — without context the primary receives none", async () => {
    const { primary, judge } = setup()
    await judge.judge(QUESTION, NOTES)
    expect(primary.requests[0]?.context ?? []).toEqual([])
  })

  test("AC8 — a note is uncertain when it is not kept and max(answer, step) is at least low", async () => {
    const { fallback, judge } = setup()
    await judge.judge(QUESTION, NOTES)
    expect(fallback.requests).toHaveLength(1)
    const request = fallback.requests[0] as JudgeRequest
    expect(request.question).toBe(QUESTION)
    expect(request.notes).toHaveLength(2)
    expect(request.notes[0]).toBe(NOTES[1] as NoteForJudge)
    expect(request.notes[1]).toBe(NOTES[3] as NoteForJudge)
  })

  test("AC8 — the fallback context is the notes the primary kept, in input order", async () => {
    const { fallback, judge } = setup()
    await judge.judge(QUESTION, NOTES)
    expect(fallback.requests[0]?.context).toEqual([
      NOTES[0] as NoteForJudge,
      NOTES[2] as NoteForJudge,
    ])
  })

  test("AC8 — the fallback context is the call's context followed by the kept notes", async () => {
    const { fallback, judge } = setup()
    await judge.judge(QUESTION, NOTES, CONTEXT)
    expect(fallback.requests[0]?.context).toEqual([
      ...CONTEXT,
      NOTES[0] as NoteForJudge,
      NOTES[2] as NoteForJudge,
    ])
  })

  test("AC8 — with nothing kept the fallback context is the call's context alone", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": GREY_ANSWER,
      "notes/a1.md": NONE,
    }
    const withoutContext = await fallbackRequests(verdicts, LOW)
    expect(withoutContext.requests[0]?.context ?? []).toEqual([])

    const primary = fakeJudge("primary", verdicts)
    const fallback = fakeJudge("fallback", verdicts)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: LOW,
      isKept,
    })
    await judge.judge(QUESTION, NOTES.slice(0, 2), CONTEXT)
    expect(fallback.requests[0]?.context).toEqual(CONTEXT)
  })

  test("AC8 — the fallback verdicts replace the primary ones of the uncertain notes", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.notes).toEqual({
      "notes/a0.md": KEPT_ANSWER,
      "notes/a1.md": FALLBACK_VERDICTS["notes/a1.md"] as Verdicts,
      "notes/a2.md": KEPT_STEP,
      "notes/a3.md": FALLBACK_VERDICTS["notes/a3.md"] as Verdicts,
      "notes/a4.md": NONE,
    })
  })

  test("AC8 — a max(answer, step) equal to low is uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.25, step: 0.125, none: 0.625 },
      "notes/a1.md": { answer: 0.125, step: 0.25, none: 0.625 },
    }
    const { requests, result } = await fallbackRequests(verdicts, 0.25)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(NOTES.slice(0, 2))
    expect(result.fallback).toEqual(["notes/a0.md", "notes/a1.md"])
  })

  test("AC8 — a max(answer, step) just below low is not uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.125, step: 0.125, none: 0.75 },
      "notes/a1.md": { answer: 0.125, step: 0.1875, none: 0.6875 },
    }
    const { requests, result } = await fallbackRequests(verdicts, 0.25)
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
  })

  test("AC8 — the none probability does not make a note uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.0625, step: 0.0625, none: 0.875 },
    }
    const { requests } = await fallbackRequests(verdicts, 0.25)
    expect(requests).toHaveLength(0)
  })

  test("AC8 — a step probability alone can make a note uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.0625, step: 0.4375, none: 0.5 },
    }
    const { requests, result } = await fallbackRequests(verdicts, 0.25)
    expect(requests).toHaveLength(1)
    expect(result.fallback).toEqual(["notes/a0.md"])
  })

  test("AC8 — a kept note is never uncertain, whatever its probabilities", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": GREY_ANSWER,
      "notes/a1.md": GREY_STEP,
    }
    const { requests, result } = await fallbackRequests(
      verdicts,
      LOW,
      () => true
    )
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
  })

  test("AC8 — isKept alone decides which notes are kept", async () => {
    // Kept by the stand-in policy, but isKept says no: uncertain.
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": KEPT_ANSWER,
      "notes/a1.md": KEPT_STEP,
    }
    const { requests, result } = await fallbackRequests(
      verdicts,
      LOW,
      () => false
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(NOTES.slice(0, 2))
    expect(result.fallback).toEqual(["notes/a0.md", "notes/a1.md"])
  })

  test("AC8 — isKept is called with the verdict of the primary", async () => {
    const seen: Verdicts[] = []
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": GREY_ANSWER,
      "notes/a1.md": NONE,
    }
    await fallbackRequests(verdicts, LOW, (verdict) => {
      seen.push(verdict)
      return false
    })
    expect(seen).toContainEqual(GREY_ANSWER)
    expect(seen).toContainEqual(NONE)
  })

  test("AC8 — does not call the fallback when no note is uncertain", async () => {
    const { fallback, judge } = setup({ low: 0.6 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(fallback.requests).toHaveLength(0)
    expect(result.notes).toEqual(PRIMARY_VERDICTS)
  })

  test("AC8 — the fallback is called once, with every uncertain note", async () => {
    const verdicts = Object.fromEntries(
      NOTES.map((note) => [note.path, GREY_ANSWER])
    )
    const { requests, result } = await fallbackRequests(verdicts, LOW)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(NOTES)
    expect(requests[0]?.context ?? []).toEqual([])
    expect(result.fallback).toEqual(NOTES.map((note) => note.path))
  })

  test("AC8 — fallback lists the paths judged again, in input order", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.fallback).toEqual(["notes/a1.md", "notes/a3.md"])
  })

  test("AC8 — fallback is an empty list when no note is uncertain", async () => {
    const { judge } = setup({ low: 0.6 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.fallback).toEqual([])
  })

  test("AC8 — calls hold the primary calls, then the fallback calls tagged fallback", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES, CONTEXT)
    expect(result.calls).toEqual([
      ...NOTES.map((note) => callOf("primary", note.path)),
      { ...callOf("fallback", "notes/a1.md"), role: "fallback" },
      { ...callOf("fallback", "notes/a3.md"), role: "fallback" },
    ])
  })

  test("AC8 — calls are the primary calls only when no note is uncertain", async () => {
    const { judge } = setup({ low: 0.6 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.calls).toEqual(
      NOTES.map((note) => callOf("primary", note.path))
    )
  })

  test("AC8 — stages measure the wall-clock time of the primary phase and of the fallback phase", async () => {
    const primary = fakeJudge("primary", PRIMARY_VERDICTS, { delayMs: 40 })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS, { delayMs: 120 })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: LOW,
      isKept,
    })
    const result = await judge.judge(QUESTION, NOTES)
    const { judgeMs, fallbackMs } = result.stages as {
      judgeMs: number
      fallbackMs: number
    }
    expect(judgeMs).toBeGreaterThanOrEqual(30)
    expect(judgeMs).toBeLessThan(100)
    expect(fallbackMs).toBeGreaterThanOrEqual(100)
  })

  test("AC8 — fallbackMs is 0 without fallback", async () => {
    const primary = fakeJudge("primary", PRIMARY_VERDICTS, { delayMs: 30 })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: 0.6,
      isKept,
    })
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.stages?.fallbackMs).toBe(0)
    expect(result.stages?.judgeMs).toBeGreaterThanOrEqual(20)
  })

  test("AC6 — a fallback error propagates carrying the primary calls", async () => {
    const failure = new Error("fallback down")
    const primary = fakeJudge("primary", PRIMARY_VERDICTS)
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS, {
      error: failure,
    })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: LOW,
      isKept,
    })
    const error = await rejection(judge.judge(QUESTION, NOTES))
    expect(error.message).toContain("fallback down")
    expect(error.calls).toEqual(
      NOTES.map((note) => callOf("primary", note.path))
    )
  })

  test("AC6 — a fallback error that carries a billed call adds it to calls", async () => {
    const billed: ModelCall = {
      model: "fallback",
      inputTokens: 500,
      outputTokens: 7,
      latencyMs: 90,
      role: "judge",
    }
    const primary = fakeJudge("primary", PRIMARY_VERDICTS)
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS, {
      error: new LLMCallError("invalid output", billed),
    })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: LOW,
      isKept,
    })
    const error = await rejection(judge.judge(QUESTION, NOTES))
    expect(error.message).toContain("invalid output")
    expect(error.calls).toEqual([
      ...NOTES.map((note) => callOf("primary", note.path)),
      { ...billed, role: "fallback" },
    ])
  })
})

/** A stand-in for C's keep threshold: kept when answer + step reaches 0.875. */
function keptBySum(verdict: Verdicts): boolean {
  return verdict.answer + verdict.step >= 0.875
}

/** The notes of NOTES at these indexes. */
function pick(...indexes: number[]): NoteForJudge[] {
  return indexes.map((index) => NOTES[index] as NoteForJudge)
}

const sumScore = (verdict: Verdicts) => verdict.answer + verdict.step

/** Judges `notes` (and `context`) with the given options; returns the fallback requests and the result. */
async function run(
  verdicts: Record<string, Verdicts>,
  options: Omit<ConstructorParameters<typeof FallbackJudge>[2], "isKept"> & {
    isKept?: (verdict: Verdicts) => boolean
  },
  context?: NoteForJudge[],
  fallbackOptions: { delayMs?: number } = {}
) {
  const notes = NOTES.filter((note) => note.path in verdicts)
  const primary = fakeJudge("primary", verdicts)
  const fallback = fakeJudge("fallback", verdicts, fallbackOptions)
  const judge = new FallbackJudge(primary.judge, fallback.judge, {
    isKept,
    ...options,
  })
  const result = await judge.judge(QUESTION, notes, context)
  return { requests: fallback.requests, result }
}

describe("system-one-judge AC9 — grey zone on the keep score", () => {
  // Sums: a0 0.75, a1 0.625, a2 1 (kept), a3 0.5. Max: 0.5, 0.375, 0.5, 0.25.
  const verdicts: Record<string, Verdicts> = {
    "notes/a0.md": { answer: 0.5, step: 0.25, none: 0.25 },
    "notes/a1.md": { answer: 0.375, step: 0.25, none: 0.375 },
    "notes/a2.md": { answer: 0.5, step: 0.5, none: 0 },
    "notes/a3.md": { answer: 0.25, step: 0.25, none: 0.5 },
  }

  test("system-one-judge AC9 — a note is uncertain when it is not kept and score(verdict) ≥ low", async () => {
    const { requests, result } = await run(verdicts, {
      low: 0.625,
      isKept: keptBySum,
      score: sumScore,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(pick(0, 1))
    expect(result.fallback).toEqual(["notes/a0.md", "notes/a1.md"])
  })

  test("system-one-judge AC9 — the score replaces max(answer, step): the same low finds no note with the default score", async () => {
    const { requests, result } = await run(verdicts, {
      low: 0.625,
      isKept: keptBySum,
    })
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
  })

  test("system-one-judge AC9 — a score equal to low is uncertain, just under is not", async () => {
    const { result } = await run(verdicts, {
      low: 0.75,
      isKept: keptBySum,
      score: sumScore,
    })
    expect(result.fallback).toEqual(["notes/a0.md"])
  })

  test("system-one-judge AC9 — a kept note is never uncertain, whatever its score", async () => {
    const { requests } = await run(verdicts, {
      low: 0,
      isKept: keptBySum,
      score: sumScore,
    })
    expect(requests[0]?.notes).toEqual(pick(0, 1, 3))
    expect(requests[0]?.context).toEqual(pick(2))
  })

  test("system-one-judge AC9 — score is called with the verdict of the primary", async () => {
    const seen: Verdicts[] = []
    await run(verdicts, {
      low: 0.5,
      isKept: keptBySum,
      score: (verdict: Verdicts) => {
        seen.push(verdict)
        return verdict.answer + verdict.step
      },
    })
    expect(seen).toContainEqual(verdicts["notes/a0.md"] as Verdicts)
    expect(seen).toContainEqual(verdicts["notes/a3.md"] as Verdicts)
  })

  test("system-one-judge AC9 — the default score is max(answer, step)", async () => {
    const { result } = await run(verdicts, {
      low: 0.5,
      isKept: keptBySum,
    })
    // Max 0.5 for a0 (answer) and a3's 0.25 is under; a2 is kept.
    expect(result.fallback).toEqual(["notes/a0.md"])
  })
})

describe("system-one-judge AC10 — fallback scope", () => {
  const grey: Record<string, Verdicts> = {
    "notes/a0.md": GREY_ANSWER,
    "notes/a1.md": GREY_STEP,
    "notes/a2.md": NONE,
  }
  const withKept: Record<string, Verdicts> = {
    "notes/a0.md": KEPT_ANSWER,
    "notes/a1.md": GREY_ANSWER,
    "notes/a2.md": NONE,
  }

  test("system-one-judge AC10 — when defaults to uncertain: the fallback runs although a note is kept", async () => {
    const { requests, result } = await run(withKept, { low: LOW }, CONTEXT)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(pick(1))
    expect(result.fallback).toEqual(["notes/a1.md"])
  })

  test("system-one-judge AC10 — when: uncertain behaves as the default", async () => {
    const { requests, result } = await run(
      withKept,
      { low: LOW, when: "uncertain" },
      CONTEXT
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]?.context).toEqual([...CONTEXT, ...pick(0)])
    expect(result.fallback).toEqual(["notes/a1.md"])
  })

  test("system-one-judge AC10 — nothing-kept: the fallback runs when the context is empty and the primary kept none", async () => {
    const { requests, result } = await run(grey, {
      low: LOW,
      when: "nothing-kept",
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(pick(0, 1))
    expect(requests[0]?.context ?? []).toEqual([])
    expect(result.fallback).toEqual(["notes/a0.md", "notes/a1.md"])
  })

  test("system-one-judge AC10 — nothing-kept, fallback run: the fallback verdicts replace the primary ones, calls and stages as in AC8", async () => {
    const primary = fakeJudge("primary", {
      "notes/a1.md": GREY_ANSWER,
      "notes/a3.md": GREY_STEP,
    })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS, { delayMs: 30 })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      low: LOW,
      isKept,
      when: "nothing-kept",
    })
    const result = await judge.judge(QUESTION, [
      NOTES[1] as NoteForJudge,
      NOTES[3] as NoteForJudge,
    ])
    expect(result.notes).toEqual(FALLBACK_VERDICTS)
    expect(result.calls.map((call) => call.role)).toEqual([
      "judge",
      "judge",
      "fallback",
      "fallback",
    ])
    expect(result.stages?.fallbackMs).toBeGreaterThanOrEqual(20)
  })

  test("system-one-judge AC10 — nothing-kept: no fallback call when the primary kept a note of the call", async () => {
    const { requests, result } = await run(withKept, {
      low: LOW,
      when: "nothing-kept",
    })
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
    expect(result.stages?.fallbackMs).toBe(0)
    expect(result.notes).toEqual(withKept)
    expect(result.calls.map((call) => call.role)).toEqual([
      "judge",
      "judge",
      "judge",
    ])
  })

  test("system-one-judge AC10 — nothing-kept: no fallback call when the context is not empty, though the primary kept none", async () => {
    const { requests, result } = await run(
      grey,
      { low: LOW, when: "nothing-kept" },
      CONTEXT
    )
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
    expect(result.stages?.fallbackMs).toBe(0)
    expect(result.notes).toEqual(grey)
  })

  test("system-one-judge AC10 — nothing-kept: no fallback call when no note is uncertain", async () => {
    const { requests, result } = await run(
      { "notes/a0.md": NONE, "notes/a1.md": NONE },
      { low: LOW, when: "nothing-kept" }
    )
    expect(requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
  })

  test("system-one-judge AC10 — nothing-kept uses the isKept of the options to decide what was kept", async () => {
    // GREY_ANSWER is kept by this isKept: the primary kept a note, no fallback.
    const kept = await run(
      { "notes/a0.md": GREY_ANSWER, "notes/a1.md": GREY_STEP },
      { low: LOW, when: "nothing-kept", isKept: (v) => v.answer >= 0.5 }
    )
    expect(kept.requests).toHaveLength(0)
    // Nothing is kept by this isKept: the fallback runs.
    const none = await run(
      { "notes/a0.md": GREY_ANSWER, "notes/a1.md": GREY_STEP },
      { low: LOW, when: "nothing-kept", isKept: () => false }
    )
    expect(none.requests).toHaveLength(1)
    expect(none.requests[0]?.notes).toEqual(pick(0, 1))
  })

  test("system-one-judge AC10 — nothing-kept works with the keep score of AC9", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.5, step: 0.25, none: 0.25 },
      "notes/a1.md": { answer: 0.25, step: 0.25, none: 0.5 },
    }
    const { requests, result } = await run(verdicts, {
      low: 0.5,
      isKept: keptBySum,
      score: sumScore,
      when: "nothing-kept",
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.notes).toEqual(pick(0, 1))
    expect(result.fallback).toEqual(["notes/a0.md", "notes/a1.md"])
  })
})

/** A judge that answers like `inner`, plus the extra fields of its judgement. */
function withExtra(inner: Judge, extra: object): Judge {
  return {
    async judge(question, notes, context) {
      return { ...(await inner.judge(question, notes, context)), ...extra }
    },
  }
}

/** The `sufficient` of a judgement, whether the type has it yet or not. */
function sufficientOf(result: object): number | undefined {
  return (result as { sufficient?: number }).sufficient
}

describe("system-one-judge AC15 — sufficiency through the fallback", () => {
  /** a1 and a3 are in the grey zone of PRIMARY_VERDICTS: the fallback runs. */
  const withFallback = [
    NOTES[0],
    NOTES[1],
    NOTES[2],
    NOTES[3],
  ] as NoteForJudge[]

  test("system-one-judge AC15 — the primary's sufficient is returned when the fallback judges notes again", async () => {
    const primary = withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
      sufficient: 0.35,
    })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
    const result = await new FallbackJudge(primary, fallback.judge, {
      low: LOW,
      isKept,
    }).judge(QUESTION, withFallback)
    expect(fallback.requests).toHaveLength(1)
    expect(result.fallback).toEqual(["notes/a1.md", "notes/a3.md"])
    expect(sufficientOf(result)).toBe(0.35)
  })

  test("system-one-judge AC15 — the primary's sufficient is returned when no note is judged again", async () => {
    const primary = withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
      sufficient: 0.8,
    })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
    const result = await new FallbackJudge(primary, fallback.judge, {
      low: LOW,
      isKept,
    }).judge(QUESTION, [NOTES[0], NOTES[2], NOTES[4]] as NoteForJudge[])
    expect(fallback.requests).toHaveLength(0)
    expect(sufficientOf(result)).toBe(0.8)
  })

  test("system-one-judge AC15 — a sufficient of 0 is forwarded, with and without a fallback call", async () => {
    for (const notes of [
      withFallback,
      [NOTES[0], NOTES[2]] as NoteForJudge[],
    ]) {
      const primary = withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
        sufficient: 0,
      })
      const result = await new FallbackJudge(
        primary,
        fakeJudge("fallback", FALLBACK_VERDICTS).judge,
        { low: LOW, isKept }
      ).judge(QUESTION, notes)
      expect("sufficient" in result).toBe(true)
      expect(sufficientOf(result)).toBe(0)
    }
  })

  test("system-one-judge AC15 — the nothing-kept scope forwards it too, when the fallback does not run", async () => {
    const primary = withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
      sufficient: 0.6,
    })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
    const result = await new FallbackJudge(primary, fallback.judge, {
      low: LOW,
      isKept,
      when: "nothing-kept",
    }).judge(QUESTION, withFallback)
    expect(fallback.requests).toHaveLength(0)
    expect(sufficientOf(result)).toBe(0.6)
  })

  test("system-one-judge AC15 — absent when the primary has none, with and without a fallback call", async () => {
    for (const notes of [
      withFallback,
      [NOTES[0], NOTES[2]] as NoteForJudge[],
    ]) {
      const result = await new FallbackJudge(
        fakeJudge("primary", PRIMARY_VERDICTS).judge,
        fakeJudge("fallback", FALLBACK_VERDICTS).judge,
        { low: LOW, isKept }
      ).judge(QUESTION, notes)
      expect("sufficient" in result).toBe(false)
    }
  })

  test("system-one-judge AC15 — the fallback's own sufficient does not replace the primary's, nor appear when the primary has none", async () => {
    const asked = await new FallbackJudge(
      withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
        sufficient: 0.3,
      }),
      withExtra(fakeJudge("fallback", FALLBACK_VERDICTS).judge, {
        sufficient: 0.9,
      }),
      { low: LOW, isKept }
    ).judge(QUESTION, withFallback)
    expect(sufficientOf(asked)).toBe(0.3)

    const unasked = await new FallbackJudge(
      fakeJudge("primary", PRIMARY_VERDICTS).judge,
      withExtra(fakeJudge("fallback", FALLBACK_VERDICTS).judge, {
        sufficient: 0.9,
      }),
      { low: LOW, isKept }
    ).judge(QUESTION, withFallback)
    expect("sufficient" in unasked).toBe(false)
  })

  test("system-one-judge AC15 — forwarding it leaves the merge, the fallback list and the stages as they were", async () => {
    const plain = await setup().judge.judge(QUESTION, withFallback)
    const primary = withExtra(fakeJudge("primary", PRIMARY_VERDICTS).judge, {
      sufficient: 0.35,
    })
    const result = await new FallbackJudge(
      primary,
      fakeJudge("fallback", FALLBACK_VERDICTS).judge,
      { low: LOW, isKept }
    ).judge(QUESTION, withFallback)
    expect(result.notes).toEqual(plain.notes)
    expect(result.fallback).toEqual(plain.fallback)
    expect(result.calls).toEqual(plain.calls)
    expect(Object.keys(result.stages ?? {}).sort()).toEqual([
      "fallbackMs",
      "judgeMs",
    ])
  })
})
