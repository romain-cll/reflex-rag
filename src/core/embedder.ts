import type { ModelCall } from "./types.ts"

export interface Embedding {
  vectors: Float32Array[]
  call: ModelCall
}

export interface Embedder {
  readonly model: string
  readonly dimensions: number
  /** One vector per text, in input order. */
  embed(texts: string[]): Promise<Embedding>
}
