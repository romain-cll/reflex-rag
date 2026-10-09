import {
  VERDICTS,
  JudgeCallsError,
  type Judge,
  type Judgement,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type {
  SystemOne,
  SystemOneAnswer,
  SystemOneRequest,
} from "../core/system-one.ts"
import type { ModelCall } from "../core/types.ts"
import { JUDGE_QUESTION } from "./question.ts"

const DEFAULT_MAX_NOTES_PER_CALL = 40

export interface SystemOneJudgeOptions {
  /** Notes scored by one call; more are split into batches. Default 40. */
  maxNotesPerCall?: number
}

/**
 * Asks `JUDGE_QUESTION` of the system one, one question per note, all the
 * notes of a batch sharing one state and one call. The kept notes given as
 * context are in the state, without a question.
 */
export class SystemOneJudge implements Judge {
  private readonly maxNotesPerCall: number

  constructor(
    private readonly systemOne: SystemOne,
    options: SystemOneJudgeOptions = {}
  ) {
    this.maxNotesPerCall = options.maxNotesPerCall ?? DEFAULT_MAX_NOTES_PER_CALL
  }

  async judge(
    question: string,
    notes: NoteForJudge[],
    context: NoteForJudge[] = []
  ): Promise<Judgement> {
    const batches: NoteForJudge[][] = []
    for (let i = 0; i < notes.length; i += this.maxNotesPerCall) {
      batches.push(notes.slice(i, i + this.maxNotesPerCall))
    }
    const calls: (ModelCall | undefined)[] = batches.map(() => undefined)
    const verdicts: Record<Verdict, number>[][] = []
    const outcomes = await Promise.allSettled(
      batches.map(async (batch, index) => {
        const { answers, call } = await this.systemOne.decide(
          requestOf(question, batch, context)
        )
        calls[index] = { ...call, role: "judge" }
        verdicts[index] = batch.map((_, position) =>
          verdictsOf(answers[alias("n", position)])
        )
      })
    )
    const completed = calls.filter((call) => call !== undefined)
    const failure = outcomes.find((outcome) => outcome.status === "rejected")
    if (failure) {
      const reason: unknown = failure.reason
      const error = reason instanceof Error ? reason : new Error(String(reason))
      throw new JudgeCallsError(error.message, completed, { cause: error })
    }
    const inOrder = verdicts.flat()
    return {
      notes: Object.fromEntries(
        notes.map((note, position) => [note.path, inOrder[position]!])
      ),
      calls: completed,
    }
  }
}

/** The key of the nth note of a group in the state and the questions: `n1`, `k2`… */
function alias(prefix: "n" | "k", index: number): string {
  return `${prefix}${index + 1}`
}

/** The request for one batch: the notes are `n1…`, the context notes `k1…`. */
function requestOf(
  question: string,
  batch: NoteForJudge[],
  context: NoteForJudge[]
): SystemOneRequest {
  const inState = (prefix: "n" | "k", group: NoteForJudge[]) =>
    Object.fromEntries(
      group.map(({ path, date, links, text }, index) => [
        alias(prefix, index),
        { path, date, links, text },
      ])
    )
  return {
    state: {
      question,
      ...(context.length > 0 ? { context: inState("k", context) } : {}),
      notes: inState("n", batch),
    },
    questions: Object.fromEntries(
      batch.map((_, index) => {
        const key = alias("n", index)
        return [
          key,
          {
            type: "choice",
            instructions: `About note ${key} of the state only. ${JUDGE_QUESTION.instructions}`,
            criteria: JUDGE_QUESTION.criteria,
          },
        ]
      })
    ),
  }
}

/** Clamps the probabilities and scales them to sum to 1 (`none` when all are 0). */
function verdictsOf(
  answer: SystemOneAnswer | undefined
): Record<Verdict, number> {
  if (answer === undefined) return { answer: 0, step: 0, none: 1 }
  if (answer.type !== "choice") {
    throw new Error("System one gave no choice answer to the verdict question")
  }
  const clamped = VERDICTS.map((verdict) =>
    Math.min(1, Math.max(0, answer.probabilities[verdict] ?? 0))
  )
  const total = clamped.reduce((sum, value) => sum + value, 0)
  if (total === 0) return { answer: 0, step: 0, none: 1 }
  return Object.fromEntries(
    VERDICTS.map((verdict, index) => [
      verdict,
      (clamped[index] as number) / total,
    ])
  ) as Record<Verdict, number>
}
