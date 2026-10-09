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
import {
  JUDGE_BEST_QUESTION,
  JUDGE_CROSS_QUESTION,
  JUDGE_QUESTION,
} from "./question.ts"

const DEFAULT_MAX_NOTES_PER_CALL = 40

export interface SystemOneJudgeOptions {
  /** Notes scored by one call; more are split into batches. Default 40. */
  maxNotesPerCall?: number
  /**
   * Adds to each call a question per note about it among all the notes, and a
   * question picking the best note. A note is vetoed, its verdict set to
   * `none`, when the first gives `none` at least `none` and the second less
   * than `best` to the note.
   */
  veto?: { none: number; best: number }
}

const NONE_VERDICT: Record<Verdict, number> = { answer: 0, step: 0, none: 1 }

interface BatchResult {
  verdicts: Record<Verdict, number>[]
  /** Whether the note of each position was vetoed. */
  vetoed: boolean[]
}

/**
 * Asks `JUDGE_QUESTION` of the system one, one question per note, all the
 * notes of a batch sharing one state and one call. The kept notes given as
 * context are in the state, without a question. With the `veto` option, the
 * same call also holds the questions of the veto.
 */
export class SystemOneJudge implements Judge {
  private readonly maxNotesPerCall: number
  private readonly veto: SystemOneJudgeOptions["veto"]

  constructor(
    private readonly systemOne: SystemOne,
    options: SystemOneJudgeOptions = {}
  ) {
    this.maxNotesPerCall = options.maxNotesPerCall ?? DEFAULT_MAX_NOTES_PER_CALL
    this.veto = options.veto
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
    const results: BatchResult[] = []
    const outcomes = await Promise.allSettled(
      batches.map(async (batch, index) => {
        const { answers, call } = await this.systemOne.decide(
          requestOf(question, batch, context, this.veto !== undefined)
        )
        calls[index] = { ...call, role: "judge" }
        const vetoed = batch.map((_, position) =>
          this.isVetoed(answers, position)
        )
        results[index] = {
          verdicts: batch.map((_, position) =>
            vetoed[position]
              ? NONE_VERDICT
              : verdictsOf(answers[alias("n", position)])
          ),
          vetoed,
        }
      })
    )
    const completed = calls.filter((call) => call !== undefined)
    const failure = outcomes.find((outcome) => outcome.status === "rejected")
    if (failure) {
      const reason: unknown = failure.reason
      const error = reason instanceof Error ? reason : new Error(String(reason))
      throw new JudgeCallsError(error.message, completed, { cause: error })
    }
    const inOrder = results.flatMap(({ verdicts }) => verdicts)
    const vetoed = results.flatMap((result) => result.vetoed)
    return {
      notes: Object.fromEntries(
        notes.map((note, position) => [note.path, inOrder[position]!])
      ),
      calls: completed,
      ...(this.veto === undefined
        ? {}
        : {
            vetoed: notes
              .filter((_, position) => vetoed[position])
              .map((note) => note.path),
          }),
    }
  }

  /** Whether the veto applies to the note at `position` of a batch. */
  private isVetoed(
    answers: Record<string, SystemOneAnswer>,
    position: number
  ): boolean {
    if (this.veto === undefined) return false
    const cross = answers[alias("x", position)]
    const best = answers["best"]
    if (cross?.type !== "choice" || best?.type !== "choice") return false
    return (
      (cross.probabilities["none"] ?? 0) >= this.veto.none &&
      (best.probabilities[alias("n", position)] ?? 0) < this.veto.best
    )
  }
}

/**
 * The key of the nth note of a group in the state and the questions: `n1`,
 * `k2`…, and `x1` for the veto question about `n1`.
 */
function alias(prefix: "n" | "k" | "x", index: number): string {
  return `${prefix}${index + 1}`
}

/**
 * The request for one batch: the notes are `n1…`, the context notes `k1…`;
 * with `veto`, the questions `x1…` and `best` come with the questions `n1…`.
 */
function requestOf(
  question: string,
  batch: NoteForJudge[],
  context: NoteForJudge[],
  veto: boolean
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
    questions: {
      ...Object.fromEntries(
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
      ...(veto ? vetoQuestions(batch.length) : {}),
    },
  }
}

/** The questions of the veto for a batch of `size` notes: `x1…` and `best`. */
function vetoQuestions(size: number): SystemOneRequest["questions"] {
  const aliases = Array.from({ length: size }, (_, index) => alias("n", index))
  return {
    ...Object.fromEntries(
      aliases.map((key, index) => [
        alias("x", index),
        {
          type: "choice",
          instructions: JUDGE_CROSS_QUESTION.instructions(key),
          criteria: JUDGE_CROSS_QUESTION.criteria(key),
        },
      ])
    ),
    best: {
      type: "choice",
      instructions: JUDGE_BEST_QUESTION,
      criteria: {
        ...Object.fromEntries(aliases.map((key) => [key, `Note ${key}`])),
        none: "No note states the answer.",
      },
    },
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
