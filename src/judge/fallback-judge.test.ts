import { describe, expect, test } from "bun:test"
import type { Judge, Judgement, NoteForJudge, Verdict } from "../core/judge.ts"
import { LLMCallError } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { FallbackJudge } from "./fallback-judge.ts"

const QUESTION = "Who leads the Atlas project?"

const NOTES: NoteForJudge[] = Array.from({ length: 5 }, (_, index) => ({
  path: `notes/a${index}.md`,
  date: "2025-01-01",
  text: `Text ${index}.`,
  links: [],
}))

type Verdicts = Record<Verdict, number>

const SURE: Verdicts = { answer: 0.75, step: 0.25, none: 0 }
const UNSURE: Verdicts = { answer: 0.4, step: 0.3, none: 0.3 }

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
    async judge(question, notes): Promise<Judgement> {
      requests.push({ question, notes })
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

/** Primary: notes 1 and 3 are uncertain. Fallback: its own verdicts. */
const PRIMARY_VERDICTS: Record<string, Verdicts> = {
  "notes/a0.md": SURE,
  "notes/a1.md": UNSURE,
  "notes/a2.md": SURE,
  "notes/a3.md": UNSURE,
  "notes/a4.md": { answer: 0, step: 0, none: 1 },
}

const FALLBACK_VERDICTS: Record<string, Verdicts> = {
  "notes/a1.md": { answer: 1, step: 0, none: 0 },
  "notes/a3.md": { answer: 0, step: 1, none: 0 },
}

function setup(options: { threshold?: number } = {}) {
  const primary = fakeJudge("primary", PRIMARY_VERDICTS)
  const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
  const judge = new FallbackJudge(primary.judge, fallback.judge, {
    threshold: options.threshold ?? 0.5,
  })
  return { primary, fallback, judge }
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
  test("AC5 — implements Judge and judges every note with the primary", async () => {
    const { primary, judge } = setup()
    const asJudge: Judge = judge
    await asJudge.judge(QUESTION, NOTES)
    expect(primary.requests).toHaveLength(1)
    expect(primary.requests[0]?.question).toBe(QUESTION)
    expect(primary.requests[0]?.notes).toEqual(NOTES)
  })

  test("AC5 — sends only the uncertain notes to the fallback, in one call, in input order", async () => {
    const { fallback, judge } = setup()
    await judge.judge(QUESTION, NOTES)
    expect(fallback.requests).toHaveLength(1)
    const request = fallback.requests[0] as JudgeRequest
    expect(request.question).toBe(QUESTION)
    expect(request.notes).toHaveLength(2)
    expect(request.notes[0]).toBe(NOTES[1] as NoteForJudge)
    expect(request.notes[1]).toBe(NOTES[3] as NoteForJudge)
  })

  test("AC5 — the fallback verdicts replace the primary ones of the uncertain notes", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.notes).toEqual({
      "notes/a0.md": SURE,
      "notes/a1.md": FALLBACK_VERDICTS["notes/a1.md"] as Verdicts,
      "notes/a2.md": SURE,
      "notes/a3.md": FALLBACK_VERDICTS["notes/a3.md"] as Verdicts,
      "notes/a4.md": { answer: 0, step: 0, none: 1 },
    })
  })

  test("AC5 — a highest probability equal to the threshold is not uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.5, step: 0.25, none: 0.25 },
      "notes/a1.md": { answer: 0.25, step: 0.25, none: 0.5 },
    }
    const primary = fakeJudge("primary", verdicts)
    const fallback = fakeJudge("fallback", verdicts)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.5,
    })
    const result = await judge.judge(QUESTION, NOTES.slice(0, 2))
    expect(fallback.requests).toHaveLength(0)
    expect(result.fallback).toEqual([])
  })

  test("AC5 — a highest probability just below the threshold is uncertain", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.25, step: 0.25, none: 0.5 },
      "notes/a1.md": { answer: 0.375, step: 0.375, none: 0.25 },
    }
    const primary = fakeJudge("primary", verdicts)
    const fallback = fakeJudge("fallback", {
      "notes/a1.md": { answer: 1, step: 0, none: 0 },
    })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.5,
    })
    const result = await judge.judge(QUESTION, NOTES.slice(0, 2))
    expect(fallback.requests).toHaveLength(1)
    expect(fallback.requests[0]?.notes).toEqual([NOTES[1] as NoteForJudge])
    expect(result.fallback).toEqual(["notes/a1.md"])
  })

  test("AC5 — the confidence is the highest of the three verdicts, whichever it is", async () => {
    const verdicts: Record<string, Verdicts> = {
      "notes/a0.md": { answer: 0.1, step: 0.1, none: 0.8 },
      "notes/a1.md": { answer: 0.1, step: 0.8, none: 0.1 },
      "notes/a2.md": { answer: 0.8, step: 0.1, none: 0.1 },
    }
    const primary = fakeJudge("primary", verdicts)
    const fallback = fakeJudge("fallback", verdicts)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.7,
    })
    await judge.judge(QUESTION, NOTES.slice(0, 3))
    expect(fallback.requests).toHaveLength(0)
  })

  test("AC5 — does not call the fallback when no note is uncertain", async () => {
    const { fallback, judge } = setup({ threshold: 0.3 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(fallback.requests).toHaveLength(0)
    expect(result.notes).toEqual(PRIMARY_VERDICTS)
  })

  test("AC5 — sends every note to the fallback when all are uncertain", async () => {
    const verdicts = Object.fromEntries(
      NOTES.map((note) => [note.path, UNSURE])
    )
    const primary = fakeJudge("primary", verdicts)
    const fallback = fakeJudge("fallback", verdicts)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.9,
    })
    const result = await judge.judge(QUESTION, NOTES)
    expect(fallback.requests).toHaveLength(1)
    expect(fallback.requests[0]?.notes).toEqual(NOTES)
    expect(result.fallback).toEqual(NOTES.map((note) => note.path))
  })

  test("AC6 — fallback lists the paths judged again, in input order", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.fallback).toEqual(["notes/a1.md", "notes/a3.md"])
  })

  test("AC6 — fallback is an empty list when no note is uncertain", async () => {
    const { judge } = setup({ threshold: 0.3 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.fallback).toEqual([])
  })

  test("AC6 — calls hold the primary calls, then the fallback calls tagged fallback", async () => {
    const { judge } = setup()
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.calls).toEqual([
      ...NOTES.map((note) => callOf("primary", note.path)),
      { ...callOf("fallback", "notes/a1.md"), role: "fallback" },
      { ...callOf("fallback", "notes/a3.md"), role: "fallback" },
    ])
  })

  test("AC6 — calls are the primary calls only when no note is uncertain", async () => {
    const { judge } = setup({ threshold: 0.3 })
    const result = await judge.judge(QUESTION, NOTES)
    expect(result.calls).toEqual(
      NOTES.map((note) => callOf("primary", note.path))
    )
  })

  test("AC6 — stages measure the wall-clock time of the primary phase and of the fallback phase", async () => {
    const primary = fakeJudge("primary", PRIMARY_VERDICTS, { delayMs: 40 })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS, { delayMs: 120 })
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.5,
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

  test("AC6 — fallbackMs is 0 without fallback", async () => {
    const primary = fakeJudge("primary", PRIMARY_VERDICTS, { delayMs: 30 })
    const fallback = fakeJudge("fallback", FALLBACK_VERDICTS)
    const judge = new FallbackJudge(primary.judge, fallback.judge, {
      threshold: 0.3,
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
      threshold: 0.5,
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
      threshold: 0.5,
    })
    const error = await rejection(judge.judge(QUESTION, NOTES))
    expect(error.message).toContain("invalid output")
    expect(error.calls).toEqual([
      ...NOTES.map((note) => callOf("primary", note.path)),
      { ...billed, role: "fallback" },
    ])
  })
})
