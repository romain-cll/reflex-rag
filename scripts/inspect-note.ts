// Usage: bun scripts/inspect-note.ts <path or title>
import { existsSync } from "node:fs"
import type { Link } from "../src/core/types.ts"
import { openIndex } from "../src/index/read.ts"

const DB_PATH = ".reflex/index.db"
const EXCERPT_LENGTH = 120

function fail(message: string): never {
  console.error(`inspect-note: ${message}`)
  process.exit(1)
}

function printLinks(title: string, links: Link[], otherEnd: keyof Link) {
  console.log(`\n${title} (${links.length})`)
  for (const link of links) console.log(`  ${link[otherEnd]}: ${link.label}`)
}

const query = process.argv[2]
if (query === undefined)
  fail("usage: bun scripts/inspect-note.ts <path or title>")
if (!existsSync(DB_PATH))
  fail(`no index at ${DB_PATH}, run \`reflex index\` first`)

const index = openIndex(DB_PATH)
const note = index.getNote(query)
if (note === null) fail(`no note matching "${query}"`)

console.log(`${note.title}\n  path: ${note.path}\n  date: ${note.date ?? "-"}`)

const chunks = index.chunksOf(note.path)
console.log(`\nChunks (${chunks.length})`)
for (const chunk of chunks) {
  const excerpt = chunk.text.replace(/\s+/g, " ").slice(0, EXCERPT_LENGTH)
  console.log(`  ${chunk.id} [${chunk.heading || "-"}] ${excerpt}`)
}

printLinks("Outgoing links", index.outgoingLinks(note.path), "targetPath")
printLinks("Backlinks", index.backlinks(note.path), "sourcePath")
index.close()
