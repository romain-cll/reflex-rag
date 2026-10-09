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
