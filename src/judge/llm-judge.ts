import { z } from "zod"
import {
  VERDICTS,
  type ContextNote,
  type Judge,
  type Judgement,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type { LLM } from "../core/llm.ts"
import { JUDGE_QUESTION, JUDGE_SUFFICIENT_QUESTION } from "./question.ts"

/** Output tokens for one `{ id, answer, step, none }` entry. */
const TOKENS_PER_NOTE = 48
/** Output tokens for the fixed part of the answer. */
const BASE_TOKENS = 64
/** Output tokens for the `sufficient` field. */
const SUFFICIENT_TOKENS = 16

// No bounds on the numbers: the judge clamps them rather than reject the answer.
const NotesSchema = z.object({
  notes: z.array(
    z.object({
      id: z.string(),
      answer: z.number(),
      step: z.number(),
      none: z.number(),
    })
  ),
})

const SufficientSchema = NotesSchema.extend({ sufficient: z.number() })

type Output = z.infer<typeof NotesSchema> & { sufficient?: number }

const SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. ${JUDGE_QUESTION.instructions}

Each note gets the probability of three verdicts:
${VERDICTS.map((verdict) => `- ${verdict}: ${JUDGE_QUESTION.criteria[verdict]}`).join("\n")}

You receive a question and notes, each with an id, its path, its date when it has one, the paths of the notes it links to and its text. For every note, give the probability of each verdict, from 0 to 1, the three summing to 1. Return one entry for every note of the message, with exactly the id you were given.

Give calibrated estimates rather than certainties: avoid extreme values such as 0 or 1 unless the text leaves no doubt. Judge using only the text of the notes given in the message, not what you know from elsewhere.`

const SUFFICIENT_PROMPT = `

Also give "sufficient", the probability, from 0 to 1, of a yes to this question about all the notes of the message, the notes already kept included: ${JUDGE_SUFFICIENT_QUESTION}`

export interface LLMJudgeOptions {
  /** Also asks whether the notes state the complete answer: the `sufficient` of the judgement. */
  sufficiency?: boolean
}

export class LLMJudge implements Judge {
  private readonly sufficiency: boolean

  constructor(
    private readonly llm: LLM,
    options: LLMJudgeOptions = {}
  ) {
    this.sufficiency = options.sufficiency ?? false
  }

  async judge(
    question: string,
    notes: NoteForJudge[],
    context: ContextNote[] = []
  ): Promise<Judgement> {
    if (notes.length === 0) return { notes: {}, calls: [] }
    const schema: z.ZodType<Output> = this.sufficiency
      ? SufficientSchema
      : NotesSchema
    const { value, call } = await this.llm.completeJson(
      {
        system: this.sufficiency
          ? SYSTEM_PROMPT + SUFFICIENT_PROMPT
          : SYSTEM_PROMPT,
        prompt: promptOf(question, notes, context),
        maxTokens:
          BASE_TOKENS +
          TOKENS_PER_NOTE * notes.length +
          (this.sufficiency ? SUFFICIENT_TOKENS : 0),
      },
      schema
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
      ...(this.sufficiency && value.sufficient !== undefined
        ? { sufficient: Math.min(1, Math.max(0, value.sufficient)) }
        : {}),
    }
  }
}

/** The short id of the nth note of a message: `n1`, `n2`… */
function alias(index: number): string {
  return `n${index + 1}`
}

/** The question, the kept notes when there are any (no alias), then the notes to score. */
function promptOf(
  question: string,
  notes: NoteForJudge[],
  context: ContextNote[]
): string {
  const scored = notes
    .map((note, index) => noteSection(note, `[${alias(index)}] `))
    .join("\n\n")
  if (context.length === 0)
    return `Question: ${question}\n\nNotes:\n\n${scored}`
  const kept = context.map((note) => noteSection(note, "")).join("\n\n")
  return `Question: ${question}\n\nThese notes were already kept: do not score them, they only give context for the notes to score.\n\n${kept}\n\nNotes to score:\n\n${scored}`
}

function noteSection(note: NoteForJudge, label: string): string {
  const date = note.date === null ? "" : ` (${note.date})`
  const links =
    note.links.length === 0 ? "" : `Links to: ${note.links.join(", ")}\n`
  return `${label}${note.path}${date}\n${links}${note.text}`
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
