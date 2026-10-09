import type { LLM } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"

/** A note judged so far, as the rewriter reads it. */
export interface RewriterNote {
  path: string
  text: string
}

/** Builds the query of a new search from the best notes found so far. */
export interface Rewriter {
  readonly kind: string
  /** `notes` is best first; none of them answered the question. */
  rewrite(
    question: string,
    notes: RewriterNote[]
  ): Promise<{ query: string; calls: ModelCall[] }>
}

const MAX_TERMS = 6
const MAX_TOKENS = 100

/** A capitalized word, or several of them in a row. */
const CAPITALIZED = /\p{Lu}\p{L}*(?: \p{Lu}\p{L}*)*/gu

/** The question plus the most frequent capitalized terms of the notes. */
export class CodeRewriter implements Rewriter {
  readonly kind = "code"

  readonly rewrite: Rewriter["rewrite"] = (question, notes) => {
    const terms = topTerms(question, notes)
    const query =
      terms.length === 0 ? question : `${question} ${terms.join(" ")}`
    return Promise.resolve({ query, calls: [] })
  }
}

/** Terms absent from the question, most frequent first, then in order of appearance. */
function topTerms(question: string, notes: RewriterNote[]): string[] {
  const lowerQuestion = question.toLowerCase()
  const counts = new Map<string, number>()
  for (const note of notes) {
    for (const [term] of note.text.matchAll(CAPITALIZED)) {
      if (lowerQuestion.includes(term.toLowerCase())) continue
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TERMS)
    .map(([term]) => term)
}

const SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. A first search for a question did not find the answer. You receive the question and the paths of the notes found so far, none of which answered it, and you write one new search query that is more likely to find the notes that do.

Reply with the query only, on a single line, without quotes or explanation.`

/** Asks the LLM for one reformulated query. */
export class LLMRewriter implements Rewriter {
  readonly kind = "llm"

  constructor(private readonly llm: LLM) {}

  async rewrite(
    question: string,
    notes: RewriterNote[]
  ): Promise<{ query: string; calls: ModelCall[] }> {
    const { text, call } = await this.llm.complete({
      system: SYSTEM_PROMPT,
      prompt: `Question: ${question}\n\nNotes found so far:\n${paths(notes)}`,
      maxTokens: MAX_TOKENS,
    })
    return { query: text.trim(), calls: [call] }
  }
}

function paths(notes: RewriterNote[]): string {
  if (notes.length === 0) return "(nothing found)"
  return notes.map((note) => `- ${note.path}`).join("\n")
}
