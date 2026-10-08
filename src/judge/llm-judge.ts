import { z } from "zod"
import {
  MISSING,
  type Assessment,
  type Judge,
  type Missing,
  type Relevance,
} from "../core/judge.ts"
import type { LLM } from "../core/llm.ts"
import type { DatedChunk, Link } from "../core/types.ts"

/** Output tokens for one `{ id, probability }` entry, with room for long ids. */
const TOKENS_PER_ITEM = 40
/** Output tokens for the fixed part of each answer. */
const RELEVANCE_BASE_TOKENS = 64
const ASSESS_BASE_TOKENS = 160

const RelevanceSchema = z.object({
  chunks: z.array(z.object({ id: z.string(), probability: z.number() })),
})

const AssessSchema = z.object({
  sufficient: z.number(),
  missing: z.object({
    detail_in_linked_note: z.number(),
    newer_version: z.number(),
    topic_not_found: z.number(),
    unidentified: z.number(),
  }),
  links: z.array(z.object({ id: z.string(), probability: z.number() })),
})

const RELEVANCE_SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. You receive a question and candidate chunks of notes, each with an id, its note path, the date of the note when it has one, and its heading.

For each chunk id, give the probability that the chunk helps answer the question, from 0 (useless) to 1 (it holds the answer or a necessary part of it). Return one entry for every chunk id of the message, with exactly the id you were given.

Give calibrated estimates rather than certainties: avoid extreme values such as 0 or 1 unless the text leaves no doubt. Judge using only the text of the chunks given in the message, not what you know from elsewhere.`

const ASSESS_SYSTEM_PROMPT = `You help a retrieval system that searches a company's internal note vault. You receive a question, the chunks of notes kept so far (each with an id, its note path, the date of the note when it has one, and its heading) and the links that can be followed from them (each with an id, the title of the note it points to and its label, the sentence around the link).

Give "sufficient", the probability that the chunks together are enough to answer the question, from 0 to 1.

Then give the probability of each of the four ways in which the context may fall short of the answer. Each is a number from 0 to 1, and the four describe what is missing:
- detail_in_linked_note: the chunks are on the right track but the answer is likely in a note one link away, a linked note that holds the detail.
- newer_version: the context may be outdated, because a later note may change, update or replace what the chunks say, for example a decision, a date or an owner that was revised afterwards.
- topic_not_found: nothing on the topic of the question was found, so the chunks are about something else.
- unidentified: something is missing, but none of the three reasons above explains it, or you cannot tell why.

For each link id, give the probability that its target note holds what is missing, judging from the label and the title of the link only, since you do not see the note itself. Return one entry for every link id of the message, with exactly the id you were given.

Give calibrated estimates rather than certainties: avoid extreme values such as 0 or 1 unless the text leaves no doubt. Judge using only the text given in the message, not what you know from elsewhere.`

export class LLMJudge implements Judge {
  constructor(private readonly llm: LLM) {}

  async relevance(question: string, chunks: DatedChunk[]): Promise<Relevance> {
    if (chunks.length === 0) return { chunks: {}, calls: [] }
    const { value, call } = await this.llm.completeJson(
      {
        system: RELEVANCE_SYSTEM_PROMPT,
        prompt: `Question: ${question}\n\n${chunksSection(chunks)}`,
        maxTokens: RELEVANCE_BASE_TOKENS + TOKENS_PER_ITEM * chunks.length,
      },
      RelevanceSchema
    )
    return {
      chunks: probabilitiesById(
        chunks.map((chunk) => chunk.id),
        value.chunks
      ),
      calls: [call],
    }
  }

  async assess(
    question: string,
    chunks: DatedChunk[],
    links: Link[]
  ): Promise<Assessment> {
    const { value, call } = await this.llm.completeJson(
      {
        system: ASSESS_SYSTEM_PROMPT,
        prompt: `Question: ${question}\n\n${chunksSection(chunks)}\n\n${linksSection(links)}`,
        maxTokens: ASSESS_BASE_TOKENS + TOKENS_PER_ITEM * links.length,
      },
      AssessSchema
    )
    const probabilities = normalized(value.missing)
    return {
      sufficient: clamp(value.sufficient),
      missing: { choice: mostProbable(probabilities), probabilities },
      links: probabilitiesById(
        links.map((link) => link.id),
        value.links
      ),
      calls: [call],
    }
  }
}

function chunksSection(chunks: DatedChunk[]): string {
  const entries = chunks.map(
    (chunk) =>
      `[${chunk.id}] ${chunk.notePath}${chunk.noteDate === null ? "" : ` (${chunk.noteDate})`}\n${chunk.heading}\n${chunk.text}`
  )
  return `Chunks:\n\n${entries.join("\n\n")}`
}

function linksSection(links: Link[]): string {
  const entries = links.map(
    (link) => `[${link.id}] ${titleOf(link.targetPath)}\n${link.label}`
  )
  return `Links:\n\n${entries.join("\n\n")}`
}

/** The title of a note is its file name, without folders and extension. */
function titleOf(path: string): string {
  const fileName = path.slice(path.lastIndexOf("/") + 1)
  return fileName.replace(/\.md$/, "")
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** One clamped probability for each expected id: 0 if left out, extras dropped. */
function probabilitiesById(
  ids: string[],
  entries: { id: string; probability: number }[]
): Record<string, number> {
  const scored = new Map(
    entries.map((entry) => [entry.id, clamp(entry.probability)])
  )
  return Object.fromEntries(ids.map((id) => [id, scored.get(id) ?? 0]))
}

/** Clamps the values and scales them to sum to 1 (uniform when all are 0). */
function normalized(raw: Record<Missing, number>): Record<Missing, number> {
  const clamped = MISSING.map((key) => clamp(raw[key]))
  const total = clamped.reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(
    MISSING.map((key, index) => [
      key,
      total === 0 ? 1 / MISSING.length : (clamped[index] as number) / total,
    ])
  ) as Record<Missing, number>
}

/** The most probable value; ties go to the first in `MISSING` order. */
function mostProbable(probabilities: Record<Missing, number>): Missing {
  return MISSING.reduce((best, key) =>
    probabilities[key] > probabilities[best] ? key : best
  )
}
