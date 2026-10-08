import type { Chunk, Link, ModelCall } from "./types.ts"

export const MISSING = [
  "detail_in_linked_note",
  "newer_version",
  "topic_not_found",
  "unidentified",
] as const

export type Missing = (typeof MISSING)[number]

export interface Relevance {
  /** Probability that each chunk is relevant to the question, by chunk id. */
  chunks: Record<string, number>
  calls: ModelCall[]
}

export interface Assessment {
  /** Probability that the chunks are enough to answer the question. */
  sufficient: number
  missing: {
    choice: Missing
    probabilities: Record<Missing, number>
  }
  /** Probability that each link leads to what is missing, by link id. */
  links: Record<string, number>
  calls: ModelCall[]
}

/**
 * Judges what the index found, in two steps per turn. A system-one model
 * answers at most 64 questions over one shared state, which cannot hold a
 * relevance question for each of 50 candidates plus the assessment.
 */
export interface Judge {
  relevance(question: string, chunks: Chunk[]): Promise<Relevance>
  assess(question: string, chunks: Chunk[], links: Link[]): Promise<Assessment>
}
