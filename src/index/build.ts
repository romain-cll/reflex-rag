import { Database } from "bun:sqlite"
import { mkdir, rm } from "node:fs/promises"
import { dirname } from "node:path"
import type { Embedder } from "../core/embedder.ts"
import type { Chunk, ModelCall, Note } from "../core/types.ts"
import type { ParsedVault } from "../vault/parse.ts"

export interface BuildOptions {
  vault: ParsedVault
  embedder: Embedder
  dbPath: string
  vaultPath: string
}

export interface BuildResult {
  notes: number
  chunks: number
  links: number
  unresolved: number
  calls: ModelCall[]
}

// Rows are read back in insertion order (rowid), which is document order.
const SCHEMA = `
  CREATE TABLE notes (
    path TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    titleKey TEXT NOT NULL,
    date TEXT,
    summary TEXT NOT NULL,
    frontmatter TEXT NOT NULL
  );
  CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    notePath TEXT NOT NULL,
    heading TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB NOT NULL
  );
  CREATE INDEX chunks_by_note ON chunks (notePath);
  CREATE TABLE links (
    id TEXT PRIMARY KEY,
    sourcePath TEXT NOT NULL,
    targetPath TEXT NOT NULL,
    label TEXT NOT NULL
  );
  CREATE INDEX links_by_source ON links (sourcePath);
  CREATE INDEX links_by_target ON links (targetPath);
  CREATE TABLE meta (
    vaultPath TEXT NOT NULL,
    embedderModel TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    builtAt TEXT NOT NULL,
    notes INTEGER NOT NULL,
    chunks INTEGER NOT NULL,
    links INTEGER NOT NULL,
    unresolved INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE chunks_fts USING fts5(
    title, heading, text, chunkId UNINDEXED,
    tokenize = 'porter unicode61'
  );
`

/** Rebuilds the index at `dbPath` from scratch. The vault is only read. */
export async function buildIndex(options: BuildOptions): Promise<BuildResult> {
  const { vault, embedder, dbPath, vaultPath } = options
  const titles = new Map(vault.notes.map((note) => [note.path, note.title]))

  // Embed before touching the disk, so a failure leaves the old index intact.
  const { vectors, calls } = await embedder.embed(
    vault.chunks.map((chunk) =>
      embeddingInput(chunk, titles.get(chunk.notePath)!)
    )
  )

  await mkdir(dirname(dbPath), { recursive: true })
  await rm(dbPath, { force: true })
  const db = new Database(dbPath, { create: true })
  try {
    db.run(SCHEMA)
    db.transaction(() => {
      insertNotes(db, vault.notes)
      insertChunks(db, vault.chunks, titles, vectors)
      insertLinks(db, vault.links)
      db.query("INSERT INTO meta VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        vaultPath,
        embedder.model,
        embedder.dimensions,
        new Date().toISOString(),
        vault.notes.length,
        vault.chunks.length,
        vault.links.length,
        vault.unresolved.length
      )
    })()
  } finally {
    db.close()
  }

  return {
    notes: vault.notes.length,
    chunks: vault.chunks.length,
    links: vault.links.length,
    unresolved: vault.unresolved.length,
    calls,
  }
}

function embeddingInput(chunk: Chunk, title: string): string {
  const heading = chunk.heading === "" ? "" : `${chunk.heading}\n`
  return `${title}\n${heading}\n${chunk.text}`
}

function insertNotes(db: Database, notes: Note[]) {
  const insert = db.query("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?)")
  for (const note of notes) {
    insert.run(
      note.path,
      note.title,
      note.title.toLowerCase(),
      note.date,
      note.summary,
      JSON.stringify(note.frontmatter)
    )
  }
}

function insertChunks(
  db: Database,
  chunks: Chunk[],
  titles: Map<string, string>,
  vectors: Float32Array[]
) {
  const insert = db.query("INSERT INTO chunks VALUES (?, ?, ?, ?, ?)")
  const insertFts = db.query("INSERT INTO chunks_fts VALUES (?, ?, ?, ?)")
  chunks.forEach((chunk, index) => {
    const vector = vectors[index]!
    const blob = new Uint8Array(
      vector.buffer,
      vector.byteOffset,
      vector.byteLength
    )
    insert.run(chunk.id, chunk.notePath, chunk.heading, chunk.text, blob)
    insertFts.run(
      titles.get(chunk.notePath)!,
      chunk.heading,
      chunk.text,
      chunk.id
    )
  })
}

function insertLinks(db: Database, links: ParsedVault["links"]) {
  const insert = db.query("INSERT INTO links VALUES (?, ?, ?, ?)")
  for (const link of links) {
    insert.run(link.id, link.sourcePath, link.targetPath, link.label)
  }
}
