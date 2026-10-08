import type { Embedder } from "../core/embedder.ts"
import type { Chunk, ModelCall } from "../core/types.ts"
import type { Index } from "../index/read.ts"

export interface RetrievedChunk {
  chunk: Chunk
  /** Reciprocal rank fusion score: higher is better. */
  score: number
  /** Rank in the BM25 list, from 1; `null` when not in it. */
  bm25Rank: number | null
  /** Rank in the vector list, from 1; `null` when not in it. */
  vectorRank: number | null
}

export interface Retrieval {
  chunks: RetrievedChunk[]
  /** The model calls made to embed the query. */
  calls: ModelCall[]
}

export interface HybridOptions {
  /** Size of each list (BM25 and vector) before fusion. Default 50. */
  candidates?: number
  /** Constant of the fusion, `1 / (rrfK + rank)`. Default 60. */
  rrfK?: number
}

/** BM25 and cosine similarity over the chunks, fused by RRF. */
export class HybridRetriever {
  private readonly candidates: number
  private readonly rrfK: number
  private embeddings: Map<string, Float32Array> | null = null

  constructor(
    private readonly index: Index,
    private readonly embedder: Embedder,
    options: HybridOptions = {}
  ) {
    this.candidates = options.candidates ?? 50
    this.rrfK = options.rrfK ?? 60
  }

  async retrieve(query: string, k: number): Promise<Retrieval> {
    const { vectors, calls } = await this.embedder.embed([query])
    const bm25 = this.index
      .searchBM25(query, this.candidates)
      .map((result) => result.chunk.id)
    const vector = this.nearest(vectors[0]!)

    const fused = new Map<string, Omit<RetrievedChunk, "chunk">>()
    const add = (ids: string[], list: "bm25Rank" | "vectorRank") => {
      ids.forEach((id, i) => {
        const entry = fused.get(id) ?? {
          score: 0,
          bm25Rank: null,
          vectorRank: null,
        }
        entry.score += 1 / (this.rrfK + i + 1)
        entry[list] = i + 1
        fused.set(id, entry)
      })
    }
    add(bm25, "bm25Rank")
    add(vector, "vectorRank")

    const chunks = [...fused]
      .sort(([idA, a], [idB, b]) => b.score - a.score || compareIds(idA, idB))
      .slice(0, k)
      .map(([id, entry]) => ({ chunk: this.index.chunk(id)!, ...entry }))
    return { chunks, calls }
  }

  /** Ids of the chunks closest to the query, best first. */
  private nearest(query: Float32Array): string[] {
    this.embeddings ??= this.index.embeddings()
    return [...this.embeddings]
      .map(([id, vector]) => ({ id, similarity: cosine(query, vector) }))
      .sort((a, b) => b.similarity - a.similarity || compareIds(a.id, b.id))
      .slice(0, this.candidates)
      .map(({ id }) => id)
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB)
}
