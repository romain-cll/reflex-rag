import type { Missing } from "../core/judge.ts"
import type { LLM } from "../core/llm.ts"
import type { Chunk, ModelCall } from "../core/types.ts"

/** Builds the query of a new search from what the loop kept so far. */
export interface Rewriter {
  readonly kind: string
  /** `kept` is best first; `missing` is the judge's most probable gap. */
  rewrite(
    question: string,
    kept: Chunk[],
    missing: Missing
  ): Promise<{ query: string; calls: ModelCall[] }>
}

const MAX_TERMS = 6
const MAX_TOKENS = 100

/** A capitalized word, or several of them in a row. */
const CAPITALIZED = /\p{Lu}\p{L}*(?: \p{Lu}\p{L}*)*/gu

/** The question plus the most frequent capitalized terms of the kept chunks. */
export class CodeRewriter implements Rewriter {
  readonly kind = "code"

  /** Ignores `missing`: it only has the chunks to take terms from. */
  readonly rewrite: Rewriter["rewrite"] = (question, kept) => {
    const terms = topTerms(question, kept)
    const query =
      terms.length === 0 ? question : `${question} ${terms.join(" ")}`
    return Promise.resolve({ query, calls: [] })
  }
}

/** Terms absent from the question, most frequent first, then in order of appearance. */
function topTerms(question: string, kept: Chunk[]): string[] {
  const lowerQuestion = question.toLowerCase()
  const counts = new Map<string, number>()
  for (const chunk of kept) {
    for (const [term] of chunk.text.matchAll(CAPITALIZED)) {
      if (lowerQuestion.includes(term.toLowerCase())) continue
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TERMS)
    .map(([term]) => term)
}

const SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. A first search for a question did not find everything needed. You receive the question, the headings of the chunks found so far and what is missing, and you write one new search query that is more likely to find the missing notes.

Reply with the query only, on a single line, without quotes or explanation.`

/** Asks the LLM for one reformulated query. */
export class LLMRewriter implements Rewriter {
  readonly kind = "llm"

  constructor(private readonly llm: LLM) {}

  async rewrite(
    question: string,
    kept: Chunk[],
    missing: Missing
  ): Promise<{ query: string; calls: ModelCall[] }> {
    const { text, call } = await this.llm.complete({
      system: SYSTEM_PROMPT,
      prompt: `Question: ${question}\n\nHeadings found so far:\n${headings(kept)}\n\nWhat is missing: ${missing}`,
      maxTokens: MAX_TOKENS,
    })
    return { query: text.trim(), calls: [call] }
  }
}

function headings(kept: Chunk[]): string {
  if (kept.length === 0) return "(nothing relevant)"
  return kept.map((chunk) => `- ${chunk.heading}`).join("\n")
}
