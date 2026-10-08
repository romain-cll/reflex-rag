/** One call to a model, recorded in the run traces for cost and latency. */
export interface ModelCall {
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

/** A markdown file of the vault. */
export interface Note {
  /** Relative to the vault root, with `/` separators. */
  path: string
  title: string
  date: string | null
  summary: string
  frontmatter: Record<string, unknown>
}

/** A section of a note: the unit the index retrieves and the judge scores. */
export interface Chunk {
  id: string
  notePath: string
  /** Path of headings leading to the section, joined with ` > `. */
  heading: string
  text: string
}

/** A chunk with the date of its note, as the judge reads it. */
export interface DatedChunk extends Chunk {
  noteDate: string | null
}

/** A wikilink visible from the current context. */
export interface Link {
  id: string
  sourcePath: string
  targetPath: string
  /** The sentence around the link in the source note. */
  label: string
}

/** A wikilink whose target matches no note of the vault. */
export interface UnresolvedLink {
  sourcePath: string
  target: string
  label: string
}
