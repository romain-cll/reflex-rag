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

export interface Judgement {
  /** A probability for each verdict, summing to 1, by note path. */
  notes: Record<string, Record<Verdict, number>>
  calls: ModelCall[]
  /** The paths judged again by a fallback judge, in input order. */
  fallback?: string[]
  /** Wall-clock time of a fallback judge's primary and fallback phases. */
  stages?: { judgeMs: number; fallbackMs: number }
}

/**
 * Judges whole notes with one closed question (`JUDGE_QUESTION`), shared by
 * the LLM judge and the system-one judge so that they differ only by the
 * model that answers it.
 */
export interface Judge {
  judge(question: string, notes: NoteForJudge[]): Promise<Judgement>
}
