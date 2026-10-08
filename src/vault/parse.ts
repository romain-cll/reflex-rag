import { basename, join } from "node:path"
import type { Chunk, Link, Note, UnresolvedLink } from "../core/types.ts"

const MAX_CHUNK_LENGTH = 2000
const SUMMARY_LENGTH = 200

/** An unresolved link in a note, in document order. */
export interface NoteLink {
  target: string
  label: string
}

export interface ParsedNote {
  note: Note
  chunks: Chunk[]
  links: NoteLink[]
}

export interface ParsedVault {
  notes: Note[]
  chunks: Chunk[]
  links: Link[]
  unresolved: UnresolvedLink[]
}

interface Line {
  text: string
  /** Inside a fenced code block, fences included. */
  code: boolean
  heading: { level: number; title: string } | null
}

interface Section {
  heading: string
  lines: string[]
}

const FENCE = /^\s*```/
const HEADING = /^(#{1,6})\s+(.*?)\s*$/
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/
// Inline code is matched so that wikilinks inside it are left alone. Embeds
// (`![[...]]`) are excluded by the lookbehind.
const CODE_OR_WIKILINK =
  /`[^`\n]*`|(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g

const sentences = new Intl.Segmenter("en", { granularity: "sentence" })

export function parseNote(path: string, content: string): ParsedNote {
  const { frontmatter, body } = splitFrontmatter(path, content)
  const lines = classifyLines(body)
  return {
    note: buildNote(path, frontmatter, body),
    chunks: buildChunks(path, lines),
    links: blocks(lines).flatMap(extractLinks),
  }
}

export async function parseVault(dir: string): Promise<ParsedVault> {
  // Glob skips dot files and folders (`.obsidian`) by default.
  const glob = new Bun.Glob("**/*.md")
  const paths = (await Array.fromAsync(glob.scan({ cwd: dir }))).sort()
  const parsed = await Promise.all(
    paths.map(async (path) =>
      parseNote(path, await Bun.file(join(dir, path)).text())
    )
  )

  const resolve = noteResolver(paths)
  const vault: ParsedVault = {
    notes: [],
    chunks: [],
    links: [],
    unresolved: [],
  }
  for (const { note, chunks, links } of parsed) {
    vault.notes.push(note)
    vault.chunks.push(...chunks)
    links.forEach(({ target, label }, index) => {
      const targetPath = resolve(target)
      if (targetPath === undefined) {
        vault.unresolved.push({ sourcePath: note.path, target, label })
      } else {
        const id = `${note.path}@${index}`
        vault.links.push({ id, sourcePath: note.path, targetPath, label })
      }
    })
  }
  return vault
}

/** Matches a target against the full path, then the file name, ignoring case. */
export function noteResolver(
  paths: string[]
): (target: string) => string | undefined {
  const byPath = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const path of paths) {
    const key = withoutExtension(path).toLowerCase()
    byPath.set(key, path)
    const name = key.slice(key.lastIndexOf("/") + 1)
    if (!byName.has(name)) byName.set(name, path)
  }
  return (target) => {
    const key = withoutExtension(target).toLowerCase()
    return byPath.get(key) ?? byName.get(key)
  }
}

function withoutExtension(path: string): string {
  return path.replace(/\.md$/i, "")
}

export function splitFrontmatter(
  path: string,
  content: string
): { frontmatter: Record<string, unknown>; body: string } {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const end = lines[0]?.trimEnd() === "---" ? findClosingFence(lines) : -1
  if (end === -1) return { frontmatter: {}, body: lines.join("\n") }

  const body = lines.slice(end + 1).join("\n")
  try {
    const parsed: unknown = Bun.YAML.parse(lines.slice(1, end).join("\n"))
    return { frontmatter: isRecord(parsed) ? parsed : {}, body }
  } catch (error) {
    throw new Error(`Invalid frontmatter in ${path}: ${String(error)}`, {
      cause: error,
    })
  }
}

function findClosingFence(lines: string[]): number {
  return lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function buildNote(
  path: string,
  frontmatter: Record<string, unknown>,
  body: string
): Note {
  const { title, date, summary } = frontmatter
  return {
    path,
    title: typeof title === "string" ? title : basename(path, ".md"),
    date: typeof date === "string" ? date : null,
    summary: typeof summary === "string" ? summary : summarize(body),
    frontmatter,
  }
}

function summarize(body: string): string {
  const text = body.replace(/^#{1,6}\s+/gm, "")
  return collapseWhitespace(renderWikilinks(text).text).slice(0, SUMMARY_LENGTH)
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function classifyLines(body: string): Line[] {
  let inFence = false
  return body.split("\n").map((text) => {
    const isFence = FENCE.test(text)
    if (isFence) inFence = !inFence
    const code = inFence || isFence
    const match = code ? null : HEADING.exec(text)
    const heading = match && { level: match[1]!.length, title: match[2]! }
    return { text, code, heading }
  })
}

function buildChunks(path: string, lines: Line[]): Chunk[] {
  return sections(lines)
    .flatMap(({ heading, lines }) =>
      splitText(lines.join("\n").trim()).map((text) => ({ heading, text }))
    )
    .map((chunk, index) => ({
      id: `${path}#${index}`,
      notePath: path,
      ...chunk,
    }))
}

function sections(lines: Line[]): Section[] {
  const result: Section[] = [{ heading: "", lines: [] }]
  const path: { level: number; title: string }[] = []
  for (const line of lines) {
    if (line.heading === null) {
      result.at(-1)!.lines.push(line.text)
      continue
    }
    while (path.length > 0 && path.at(-1)!.level >= line.heading.level) {
      path.pop()
    }
    path.push(line.heading)
    result.push({ heading: path.map((h) => h.title).join(" > "), lines: [] })
  }
  return result
}

/** Packs whole paragraphs into pieces of at most MAX_CHUNK_LENGTH characters. */
function splitText(text: string): string[] {
  if (text === "") return []
  if (text.length <= MAX_CHUNK_LENGTH) return [text]

  const pieces: string[] = []
  let current = ""
  for (const paragraph of text.split(/\n\s*\n/)) {
    const joined = current === "" ? paragraph : `${current}\n\n${paragraph}`
    if (joined.length <= MAX_CHUNK_LENGTH || current === "") {
      current = joined
    } else {
      pieces.push(current)
      current = paragraph
    }
  }
  pieces.push(current)
  return pieces
}

/** Paragraphs and list items, as single lines of text without list markers. */
function blocks(lines: Line[]): string[] {
  const result: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length > 0) result.push(collapseWhitespace(current.join(" ")))
    current = []
  }
  for (const line of lines) {
    if (line.code || line.text.trim() === "") {
      flush()
    } else if (line.heading) {
      flush()
      result.push(line.heading.title)
    } else {
      if (LIST_MARKER.test(line.text)) flush()
      current.push(line.text.replace(LIST_MARKER, ""))
    }
  }
  flush()
  return result
}

function extractLinks(block: string): NoteLink[] {
  const { text, targets } = renderWikilinks(block)
  return targets.map(({ target, at }) => ({
    target,
    label: sentenceAt(text, at),
  }))
}

/** Replaces wikilinks by their display text and records where each one landed. */
function renderWikilinks(text: string): {
  text: string
  targets: { target: string; at: number }[]
} {
  let rendered = ""
  let last = 0
  const targets: { target: string; at: number }[] = []
  for (const match of text.matchAll(CODE_OR_WIKILINK)) {
    const [whole, target, alias] = match
    rendered += text.slice(last, match.index)
    if (target === undefined) {
      rendered += whole
    } else {
      targets.push({ target: target.trim(), at: rendered.length })
      rendered += alias?.trim() || target.trim()
    }
    last = match.index + whole.length
  }
  return { text: rendered + text.slice(last), targets }
}

function sentenceAt(text: string, index: number): string {
  for (const { segment, index: start } of sentences.segment(text)) {
    if (index < start + segment.length) return segment.trim()
  }
  return text
}
