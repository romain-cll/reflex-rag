import {
  VERDICTS,
  JudgeCallsError,
  type Judge,
  type Judgement,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type { SystemOne, SystemOneAnswer } from "../core/system-one.ts"
import type { ModelCall } from "../core/types.ts"
import { JUDGE_QUESTION } from "./question.ts"

const DEFAULT_CONCURRENCY = 16

export interface SystemOneJudgeOptions {
  /** Calls in flight at once. Default 16. */
  concurrency?: number
}

/**
 * Asks `JUDGE_QUESTION` of the system one, one call per note: notes batched
 * into one state get mixed up.
 */
export class SystemOneJudge implements Judge {
  private readonly concurrency: number

  constructor(
    private readonly systemOne: SystemOne,
    options: SystemOneJudgeOptions = {}
  ) {
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  }

  async judge(question: string, notes: NoteForJudge[]): Promise<Judgement> {
    const calls: (ModelCall | undefined)[] = notes.map(() => undefined)
    const verdicts: (Record<Verdict, number> | undefined)[] = notes.map(
      () => undefined
    )
    const failures: Error[] = []
    await mapConcurrently(notes, this.concurrency, async (note, index) => {
      try {
        const { answers, call } = await this.systemOne.decide({
          state: {
            question,
            note: {
              path: note.path,
              date: note.date,
              links: note.links,
              text: note.text,
            },
          },
          questions: {
            verdict: {
              type: "choice",
              instructions: JUDGE_QUESTION.instructions,
              criteria: JUDGE_QUESTION.criteria,
            },
          },
        })
        calls[index] = { ...call, role: "judge" }
        verdicts[index] = verdictsOf(answers["verdict"])
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)))
      }
    })
    const completed = calls.filter((call) => call !== undefined)
    const [failure] = failures
    if (failure) {
      throw new JudgeCallsError(failure.message, completed, { cause: failure })
    }
    return {
      notes: Object.fromEntries(
        notes.map((note, index) => [note.path, verdicts[index]!])
      ),
      calls: completed,
    }
  }
}

/** Runs `task` on every item, `limit` at a time; it must not throw. */
async function mapConcurrently<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      await task(items[index] as T, index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  )
}

/** Clamps the probabilities and scales them to sum to 1 (`none` when all are 0). */
function verdictsOf(
  answer: SystemOneAnswer | undefined
): Record<Verdict, number> {
  if (answer?.type !== "choice") {
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
