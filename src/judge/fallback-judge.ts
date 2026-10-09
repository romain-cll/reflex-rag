import {
  JudgeCallsError,
  billedCalls,
  type Judge,
  type Judgement,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type { ModelCall } from "../core/types.ts"

export interface FallbackJudgeOptions {
  /** The lower bound of the grey zone: a note not kept whose `answer` or `step` reaches it is judged again. */
  low: number
  /** Whether a verdict keeps its note; the grey zone sits just below it. */
  isKept: (verdict: Record<Verdict, number>) => boolean
}

/**
 * Judges with `primary`, then judges again with `fallback`, in one call, the
 * notes that `primary` nearly kept. The fallback reads the notes `primary`
 * kept as context.
 */
export class FallbackJudge implements Judge {
  constructor(
    private readonly primary: Judge,
    private readonly fallback: Judge,
    private readonly options: FallbackJudgeOptions
  ) {}

  async judge(
    question: string,
    notes: NoteForJudge[],
    context: NoteForJudge[] = []
  ): Promise<Judgement> {
    const { low, isKept } = this.options
    const primaryStart = performance.now()
    const first = await this.primary.judge(question, notes, context)
    const judgeMs = performance.now() - primaryStart

    const uncertain = notes.filter((note) => {
      const verdict = first.notes[note.path]!
      return !isKept(verdict) && Math.max(verdict.answer, verdict.step) >= low
    })
    if (uncertain.length === 0) {
      return {
        ...first,
        fallback: [],
        stages: { judgeMs, fallbackMs: 0 },
      }
    }

    const fallbackStart = performance.now()
    let second: Judgement
    try {
      second = await this.fallback.judge(question, uncertain, [
        ...context,
        ...notes.filter((note) => isKept(first.notes[note.path]!)),
      ])
    } catch (error) {
      throw new JudgeCallsError(
        error instanceof Error ? error.message : String(error),
        [...first.calls, ...billedCalls(error).map(asFallback)],
        { cause: error }
      )
    }
    const fallbackMs = performance.now() - fallbackStart
    return {
      notes: { ...first.notes, ...second.notes },
      calls: [...first.calls, ...second.calls.map(asFallback)],
      fallback: uncertain.map((note) => note.path),
      stages: { judgeMs, fallbackMs },
    }
  }
}

function asFallback(call: ModelCall): ModelCall {
  return { ...call, role: "fallback" }
}
