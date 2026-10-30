/** What a model call is for, so that cost and calls can be split by stage. */
export const ROLES = [
  "embed",
  "judge",
  "fallback",
  "rewrite",
  "answer",
] as const

export type Role = (typeof ROLES)[number]

/** One call to a model, recorded in the run traces for cost and latency. */
export interface ModelCall {
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  /**
   * Time the provider spent loading the model, kept out of `latencyMs`.
   * Absent when the provider does not report it.
   */
  loadMs?: number
  role?: Role
}

/** The load time of the calls, 0 for the calls that report none. */
export function loadMsOf(calls: ModelCall[]): number {
  return calls.reduce((sum, call) => sum + (call.loadMs ?? 0), 0)
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

/** A section of a note: the unit the index retrieves. */
export interface Chunk {
  id: string
  notePath: string
  /** Path of headings leading to the section, joined with ` > `. */
  heading: string
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

/** A wikilink whose target matches no note of the vault. */
export interface UnresolvedLink {
  sourcePath: string
  target: string
  label: string
}
