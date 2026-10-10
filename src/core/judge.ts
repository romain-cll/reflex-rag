import { LLMCallError } from "./llm.ts"
import type { ModelCall } from "./types.ts"

/** What a note gives for answering a question. */
export const VERDICTS = ["answer", "step", "none"] as const

export type Verdict = (typeof VERDICTS)[number]

/** A whole note, as the judge reads it. */
export interface NoteForJudge {
  path: string
  date: string | null
  /** The whole note body. */
  text: string
  /** Paths of the notes it links to. */
  links: string[]
}

/**
 * A note already kept, as the judge reads it. `verdict` is the one it was kept
 * with: a fallback judge reads it, a judge never shows it to its model.
 */
export type ContextNote = NoteForJudge & { verdict?: Record<Verdict, number> }

export interface Judgement {
  /** A probability for each verdict, summing to 1, by note path. */
  notes: Record<string, Record<Verdict, number>>
  calls: ModelCall[]
  /** The paths judged again by a fallback judge, in input order. */
  fallback?: string[]
  /** The paths whose verdict a veto set to `none`, in input order. */
  vetoed?: string[]
  /** Wall-clock time of a fallback judge's primary and fallback phases. */
  stages?: { judgeMs: number; fallbackMs: number }
  /**
   * The probability, from 0 to 1, that the notes of the call, context
   * included, state the complete answer; absent when the judge was not asked.
   */
  sufficient?: number
}

/**
 * Judges whole notes with one closed question (`JUDGE_QUESTION`), shared by
 * the LLM judge and the system-one judge so that they differ only by the
 * model that answers it.
 */
export interface Judge {
  /**
   * `context` holds notes already kept: the judge reads them but does not
   * score them, so that the result holds verdicts for `notes` only. Their
   * verdicts are not part of what the model reads.
   */
  judge(
    question: string,
    notes: NoteForJudge[],
    context?: ContextNote[]
  ): Promise<Judgement>
}

/**
 * A judge failure: `calls` holds the calls that were billed before it, so
 * that their cost is not lost.
 */
export class JudgeCallsError extends Error {
  constructor(
    message: string,
    readonly calls: ModelCall[],
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

/** The calls an error carries: its `calls`, or the `call` of an `LLMCallError`. */
export function billedCalls(error: unknown): ModelCall[] {
  if (error instanceof LLMCallError) return [error.call]
  if (
    error instanceof Error &&
    "calls" in error &&
    Array.isArray(error.calls)
  ) {
    return error.calls as ModelCall[]
  }
  return []
}
