import { Database } from "bun:sqlite"
import type { Chunk, Link, Note } from "../core/types.ts"

export interface IndexMeta {
  vaultPath: string
  embedderModel: string
  dimensions: number
  /** ISO 8601. */
  builtAt: string
  notes: number
  chunks: number
  links: number
  unresolved: number
}

export interface SearchResult {
  chunk: Chunk
  /** Raw FTS5 `bm25()`: lower is better. */
  score: number
}

export interface Index {
  getNote(pathOrTitle: string): Note | null
  chunk(id: string): Chunk | null
  chunksOf(path: string): Chunk[]
  outgoingLinks(path: string): Link[]
  backlinks(path: string): Link[]
  searchBM25(query: string, k: number): SearchResult[]
  /** One vector per chunk id. */
  embeddings(): Map<string, Float32Array>
  meta(): IndexMeta
  close(): void
}

interface NoteRow extends Omit<Note, "frontmatter"> {
  frontmatter: string
}

const CHUNK_COLUMNS = "id, notePath, heading, text"
const LINK_COLUMNS = "id, sourcePath, targetPath, label"

/** Opens an existing index read-only. */
export function openIndex(dbPath: string): Index {
  const db = new Database(dbPath, { readonly: true })

  const noteByPath = db.query<NoteRow, [string]>(
    "SELECT path, title, date, summary, frontmatter FROM notes WHERE path = ?"
  )
  const noteByTitle = db.query<NoteRow, [string]>(
    `SELECT path, title, date, summary, frontmatter FROM notes
     WHERE titleKey = ? ORDER BY rowid LIMIT 1`
  )
  const chunkById = db.query<Chunk, [string]>(
    `SELECT ${CHUNK_COLUMNS} FROM chunks WHERE id = ?`
  )
  const chunksOf = db.query<Chunk, [string]>(
    `SELECT ${CHUNK_COLUMNS} FROM chunks WHERE notePath = ? ORDER BY rowid`
  )
  const outgoing = db.query<Link, [string]>(
    `SELECT ${LINK_COLUMNS} FROM links WHERE sourcePath = ? ORDER BY rowid`
  )
  const incoming = db.query<Link, [string]>(
    `SELECT ${LINK_COLUMNS} FROM links WHERE targetPath = ? ORDER BY rowid`
  )
  const search = db.query<Chunk & { score: number }, [string, number]>(
    `SELECT c.id, c.notePath, c.heading, c.text, bm25(chunks_fts) AS score
     FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.chunkId
     WHERE chunks_fts MATCH ?
     ORDER BY score, c.rowid LIMIT ?`
  )
  const embeddings = db.query<{ id: string; embedding: Uint8Array }, []>(
    "SELECT id, embedding FROM chunks"
  )
  const meta = db.query<IndexMeta, []>("SELECT * FROM meta")

  return {
    getNote(pathOrTitle) {
      const row =
        noteByPath.get(pathOrTitle) ??
        noteByTitle.get(pathOrTitle.toLowerCase())
      return row && toNote(row)
    },
    chunk: (id) => chunkById.get(id),
    chunksOf: (path) => chunksOf.all(path),
    outgoingLinks: (path) => outgoing.all(path),
    backlinks: (path) => incoming.all(path),
    searchBM25(query, k) {
      const match = toMatchQuery(query)
      if (match === null) return []
      return search
        .all(match, k)
        .map(({ score, ...chunk }) => ({ chunk, score }))
    },
    embeddings: () =>
      new Map(embeddings.all().map((row) => [row.id, toVector(row.embedding)])),
    meta: () => meta.get()!,
    close: () => db.close(),
  }
}

function toNote({ frontmatter, ...row }: NoteRow): Note {
  return { ...row, frontmatter: JSON.parse(frontmatter) as Note["frontmatter"] }
}

/**
 * Every word becomes a quoted FTS5 string, joined with OR, so that no query
 * syntax from the user reaches MATCH. `null` when the query has no word.
 */
function toMatchQuery(query: string): string | null {
  const words = query.match(/[\p{L}\p{N}]+/gu)
  return words && words.map((word) => `"${word}"`).join(" OR ")
}

function toVector(blob: Uint8Array): Float32Array {
  // Copy: the blob is not necessarily aligned on 4 bytes.
  const bytes = blob.slice()
  return new Float32Array(bytes.buffer, 0, bytes.byteLength / 4)
}
