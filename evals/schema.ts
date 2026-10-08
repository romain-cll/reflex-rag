import { z } from "zod"

export const SPLITS = ["tuning", "test"] as const

export const CATEGORIES = [
  "simple",
  "multi_hop",
  "temporal",
  "contradiction",
  "no_answer",
] as const

const text = z.string().min(1)

const ExpectedSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), values: z.array(text).min(1) }),
  z.object({ kind: z.literal("conflict"), values: z.tuple([text, text]) }),
  z.object({ kind: z.literal("undecided") }),
  z.object({ kind: z.literal("abstain") }),
])

export const QuestionSchema = z.object({
  id: z.string().regex(/^q-\d{3,}$/),
  split: z.enum(SPLITS),
  category: z.enum(CATEGORIES),
  question: text,
  expected: ExpectedSchema,
  stale: z.array(text),
  sources: z.array(text),
  sourceGroups: z.array(z.array(text)),
  entity: text,
  refs: z.array(text).min(1),
})

export const QuestionSetSchema = z.object({
  world: z.object({
    seed: z.number().int(),
    scale: z.number().int().positive(),
  }),
  questions: z.array(QuestionSchema),
})

export type Split = (typeof SPLITS)[number]
export type Category = (typeof CATEGORIES)[number]
export type Question = z.infer<typeof QuestionSchema>
export type QuestionSet = z.infer<typeof QuestionSetSchema>
