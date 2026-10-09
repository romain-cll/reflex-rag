import {
  VERDICTS,
  JudgeCallsError,
  billedCalls,
  type Judge,
  type Judgement,
  type NoteForJudge,
} from "../core/judge.ts"
import type { ModelCall } from "../core/types.ts"

export interface FallbackJudgeOptions {
  /** A note whose highest verdict probability is below it is judged again. */
  threshold: number
}

/**
 * Judges with `primary`, then judges again with `fallback`, in one call, the
 * notes on which `primary` hesitates.
 */
export class FallbackJudge implements Judge {
  constructor(
    private readonly primary: Judge,
    private readonly fallback: Judge,
    private readonly options: FallbackJudgeOptions
  ) {}

  async judge(question: string, notes: NoteForJudge[]): Promise<Judgement> {
    const primaryStart = performance.now()
    const first = await this.primary.judge(question, notes)
    const judgeMs = performance.now() - primaryStart

    const uncertain = notes.filter(
      (note) =>
        Math.max(
          ...VERDICTS.map((verdict) => first.notes[note.path]![verdict])
        ) < this.options.threshold
    )
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
      second = await this.fallback.judge(question, uncertain)
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
