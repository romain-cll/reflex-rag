/** One call to a model, recorded in the run traces for cost and latency. */
export interface ModelCall {
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

/** A section of a note: the unit the index retrieves and the judge scores. */
export interface Chunk {
  id: string
  notePath: string
  text: string
}

/** A wikilink visible from the current context. */
export interface Link {
  id: string
  sourcePath: string
  targetPath: string
  /** The sentence around the link in the source note. */
  label: string
}
