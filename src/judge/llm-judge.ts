import { z } from "zod"
import {
  VERDICTS,
  type Judge,
  type Judgement,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type { LLM } from "../core/llm.ts"
import { JUDGE_QUESTION } from "./question.ts"

/** Output tokens for one `{ id, answer, step, none }` entry. */
const TOKENS_PER_NOTE = 24
/** Output tokens for the fixed part of the answer. */
const BASE_TOKENS = 64

// No bounds on the numbers: the judge clamps them rather than reject the answer.
const OutputSchema = z.object({
  notes: z.array(
    z.object({
      id: z.string(),
      answer: z.number(),
      step: z.number(),
      none: z.number(),
    })
  ),
})

const SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. ${JUDGE_QUESTION.instructions}

Each note gets the probability of three verdicts:
${VERDICTS.map((verdict) => `- ${verdict}: ${JUDGE_QUESTION.criteria[verdict]}`).join("\n")}

You receive a question and notes, each with an id, its path, its date when it has one, the paths of the notes it links to and its text. For every note, give the probability of each verdict, from 0 to 1, the three summing to 1. Return one entry for every note of the message, with exactly the id you were given.

Give calibrated estimates rather than certainties: avoid extreme values such as 0 or 1 unless the text leaves no doubt. Judge using only the text of the notes given in the message, not what you know from elsewhere.`

export class LLMJudge implements Judge {
  constructor(private readonly llm: LLM) {}

  async judge(question: string, notes: NoteForJudge[]): Promise<Judgement> {
    if (notes.length === 0) return { notes: {}, calls: [] }
    const { value, call } = await this.llm.completeJson(
      {
        system: SYSTEM_PROMPT,
        prompt: `Question: ${question}\n\nNotes:\n\n${notes.map(noteSection).join("\n\n")}`,
        maxTokens: BASE_TOKENS + TOKENS_PER_NOTE * notes.length,
      },
      OutputSchema
    )
    const byAlias = new Map(value.notes.map((entry) => [entry.id, entry]))
    return {
      notes: Object.fromEntries(
        notes.map((note, index) => [
          note.path,
          verdictsOf(byAlias.get(alias(index))),
        ])
      ),
      calls: [call],
    }
  }
}

/** The short id of the nth note of a message: `n1`, `n2`… */
function alias(index: number): string {
  return `n${index + 1}`
}

function noteSection(note: NoteForJudge, index: number): string {
  const date = note.date === null ? "" : ` (${note.date})`
  const links =
    note.links.length === 0 ? "" : `Links to: ${note.links.join(", ")}\n`
  return `[${alias(index)}] ${note.path}${date}\n${links}${note.text}`
}

/** Clamps the values and scales them to sum to 1 (`none` when all are 0). */
function verdictsOf(
  entry: Record<Verdict, number> | undefined
): Record<Verdict, number> {
  const clamped = VERDICTS.map((verdict) =>
    Math.min(1, Math.max(0, entry?.[verdict] ?? 0))
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
