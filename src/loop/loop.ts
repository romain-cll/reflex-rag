import type { ContextChunk } from "../answer/answerer.ts"
import type { Assessment, Judge } from "../core/judge.ts"
import type { Chunk, DatedChunk, Link, ModelCall } from "../core/types.ts"
import type { Index } from "../index/read.ts"
import type { Retrieval } from "../retrieval/hybrid.ts"
import { decide, type Action, type PolicyConfig } from "./policy.ts"
import type { Rewriter } from "./rewriter.ts"

const DEFAULT_CANDIDATES = 50

export interface LoopDeps {
  /** The shape of `HybridRetriever.retrieve`. */
  retrieve(query: string, k: number): Promise<Retrieval>
  index: Pick<Index, "chunksOf" | "getNote" | "outgoingLinks">
  judge: Judge
  rewriter: Rewriter
  policy: PolicyConfig
  /** Chunks retrieved per search. Default 50. */
  candidates?: number
}

/** One turn of the loop: what it looked at, what it kept, what was decided. */
export interface LoopStep {
  kind: "search" | "follow" | "rewrite"
  /** The query of a search or a rewrite. */
  query?: string
  /** The link followed. */
  link?: Link
  /** Relevance of the chunks sent to the judge this turn, by chunk id. */
  judged: Record<string, number>
  /** The chunks of `judged` at or above the relevance threshold. */
  kept: string[]
  assessment: Assessment
  action: Action
}

export interface LoopResult {
  /** Empty when the loop abstains. */
  context: ContextChunk[]
  /** The action of the last step. */
  outcome: Action
  steps: LoopStep[]
  /** Every model call, in order. */
  calls: ModelCall[]
  hops: number
  rewrites: number
}

type Turn = Pick<LoopStep, "kind" | "query" | "link" | "judged" | "kept">

interface Judged {
  chunk: Chunk
  /** The highest probability the chunk was given. */
  probability: number
}

/** Retrieves, judges and decides until the policy answers or abstains. */
export async function runLoop(
  question: string,
  deps: LoopDeps
): Promise<LoopResult> {
  return new Loop(question, deps).run()
}

class Loop {
  /** Every chunk judged so far, in order of first judgement. */
  private readonly judged = new Map<string, Judged>()
  private readonly followed = new Set<string>()
  private readonly calls: ModelCall[] = []
  private hops = 0
  private rewrites = 0

  constructor(
    private readonly question: string,
    private readonly deps: LoopDeps
  ) {}

  async run(): Promise<LoopResult> {
    const steps: LoopStep[] = []
    let turn = await this.search(this.question, "search")
    for (;;) {
      const step = await this.assess(turn)
      steps.push(step)
      const { action } = step
      if (action.type === "follow") turn = await this.follow(action.link)
      else if (action.type === "rewrite") turn = await this.rewrite(step)
      else return this.result(action, steps)
    }
  }

  /** Retrieves for `query` and judges the chunks not judged yet. */
  private async search(
    query: string,
    kind: "search" | "rewrite"
  ): Promise<Turn> {
    const retrieval = await this.deps.retrieve(query, this.candidates)
    this.calls.push(...retrieval.calls)
    const fresh = retrieval.chunks
      .map((retrieved) => retrieved.chunk)
      .filter((chunk) => !this.judged.has(chunk.id))
    return { kind, query, ...(await this.judge(fresh)) }
  }

  private async follow(link: Link): Promise<Turn> {
    this.followed.add(link.targetPath)
    this.hops++
    const chunks = this.deps.index.chunksOf(link.targetPath)
    return { kind: "follow", link, ...(await this.judge(chunks)) }
  }

  private async rewrite(previous: LoopStep): Promise<Turn> {
    const { query, calls } = await this.deps.rewriter.rewrite(
      this.question,
      this.best().map(({ chunk }) => chunk),
      previous.assessment.missing.choice
    )
    this.calls.push(...calls)
    this.rewrites++
    return this.search(query, "rewrite")
  }

  /** Judges the chunks and keeps the highest probability of each. */
  private async judge(chunks: Chunk[]): Promise<Pick<Turn, "judged" | "kept">> {
    const unique = [...new Map(chunks.map((chunk) => [chunk.id, chunk]))]
    const relevance = await this.deps.judge.relevance(
      this.question,
      unique.map(([, chunk]) => this.dated(chunk))
    )
    this.calls.push(...relevance.calls)
    const judged: Record<string, number> = {}
    for (const [id, chunk] of unique) {
      const probability = relevance.chunks[id] ?? 0
      judged[id] = probability
      const before = this.judged.get(id)?.probability ?? 0
      this.judged.set(id, { chunk, probability: Math.max(before, probability) })
    }
    const kept = Object.keys(judged).filter(
      (id) => judged[id]! >= this.threshold
    )
    return { judged, kept }
  }

  /** Assesses the kept chunks and decides what comes next. */
  private async assess(turn: Turn): Promise<LoopStep> {
    const kept = this.kept()
    const links = this.visibleLinks(kept)
    const assessment = await this.deps.judge.assess(
      this.question,
      this.best().map(({ chunk }) => this.dated(chunk)),
      links
    )
    this.calls.push(...assessment.calls)
    const action = decide(
      {
        assessment,
        links,
        contextNotes: [...new Set(kept.map(({ chunk }) => chunk.notePath))],
        relevantCount: kept.length,
        hops: this.hops,
        rewrites: this.rewrites,
      },
      this.deps.policy
    )
    return { ...turn, assessment, action }
  }

  private result(outcome: Action, steps: LoopStep[]): LoopResult {
    const context =
      outcome.type === "abstain"
        ? []
        : this.best().map(({ chunk }) => this.contextChunk(chunk))
    return {
      context,
      outcome,
      steps,
      calls: this.calls,
      hops: this.hops,
      rewrites: this.rewrites,
    }
  }

  /** The links out of the kept notes to notes neither kept nor followed. */
  private visibleLinks(kept: Judged[]): Link[] {
    const inContext = new Set(kept.map(({ chunk }) => chunk.notePath))
    return [...inContext]
      .flatMap((path) => this.deps.index.outgoingLinks(path))
      .filter(
        (link) =>
          !inContext.has(link.targetPath) && !this.followed.has(link.targetPath)
      )
  }

  /** The kept chunks, most relevant first, ties by order of first judgement. */
  private kept(): Judged[] {
    return [...this.judged.values()]
      .filter(({ probability }) => probability >= this.threshold)
      .sort((a, b) => b.probability - a.probability)
  }

  /** The kept chunks within the chunk budget. */
  private best(): Judged[] {
    return this.kept().slice(0, this.deps.policy.budgets.maxChunks)
  }

  private dated(chunk: Chunk): DatedChunk {
    return {
      ...chunk,
      noteDate: this.deps.index.getNote(chunk.notePath)?.date ?? null,
    }
  }

  private contextChunk(chunk: Chunk): ContextChunk {
    return {
      notePath: chunk.notePath,
      noteDate: this.deps.index.getNote(chunk.notePath)?.date ?? null,
      heading: chunk.heading,
      text: chunk.text,
    }
  }

  private get threshold(): number {
    return this.deps.policy.thresholds.relevance
  }

  private get candidates(): number {
    return this.deps.candidates ?? DEFAULT_CANDIDATES
  }
}
