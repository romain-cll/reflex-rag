import { z } from "zod"
import type { LLM } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"

const MAX_TOKENS = 1024

export const AnswerSchema = z.object({
  status: z.enum(["answered", "conflict", "abstained"]),
  answer: z.string(),
  citations: z.array(z.string()),
})

export type Answer = z.infer<typeof AnswerSchema>

/** One retrieved excerpt, with the note it comes from. */
export interface ContextChunk {
  notePath: string
  noteDate: string | null
  heading: string
  text: string
}

const SYSTEM_PROMPT = `You answer a question about a company's internal note vault, using only the excerpts provided in the user message. Each excerpt comes with its note path, the date of the note when it has one, and its heading. Do not use any knowledge from outside the excerpts.

Set "status" to one of three values.
- Use "answered" when the excerpts hold the answer. When a later note explicitly supersedes, replaces or corrects an earlier one, the earlier information is outdated, so answer with the newer information. When the excerpts say a question was discussed but left open, use "answered" and answer that no decision was made.
- Use "conflict" when the sources disagree and none of them supersedes the other. Give each value with its source in the answer.
- Use "abstained" when the excerpts do not hold the answer. Say so rather than guessing. Never infer a "no" from the absence of a mention.

In "citations", cite the note paths of the excerpts you used, exactly as they are written. Keep "answer" short and concise: one or two sentences. Copy names, dates and amounts exactly as they are written in the excerpts.`

export async function answerQuestion(
  question: string,
  context: ContextChunk[],
  llm: LLM
): Promise<{ output: Answer; call: ModelCall }> {
  const { value, call } = await llm.completeJson(
    {
      system: SYSTEM_PROMPT,
      prompt: userMessage(question, context),
      maxTokens: MAX_TOKENS,
    },
    AnswerSchema
  )
  const notePaths = new Set(context.map((chunk) => chunk.notePath))
  const citations = value.citations.filter((path) => notePaths.has(path))
  return { output: { ...value, citations }, call }
}

function userMessage(question: string, context: ContextChunk[]): string {
  const excerpts = context.map(
    (chunk, index) =>
      `[${index + 1}] ${chunk.notePath}${chunk.noteDate === null ? "" : ` (${chunk.noteDate})`}\n${chunk.heading}\n${chunk.text}`
  )
  return `Question: ${question}\n\nExcerpts:\n\n${excerpts.join("\n\n")}`
}
