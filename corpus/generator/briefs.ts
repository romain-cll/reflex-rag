import { OFFICES } from "./pools.ts"
import type { NoteSpec, World } from "./schema.ts"
import { roleAt } from "./world.ts"

/** Notes per brief handed to one writer. */
export const BATCH_SIZE = 20

export interface Batch {
  name: string
  noteIds: string[]
  markdown: string
}

/**
 * Splits the notes into briefs of at most `size` notes, keeping the notes of
 * one project or customer together when they fit, so a writer sees a story
 * whole.
 */
export function renderBatches(world: World, size: number): Batch[] {
  const batches: NoteSpec[][] = []
  let current: NoteSpec[] = []
  for (const group of groupNotes(world.notes)) {
    if (current.length > 0 && current.length + group.length > size) {
      batches.push(current)
      current = []
    }
    for (const note of group) {
      if (current.length === size) {
        batches.push(current)
        current = []
      }
      current.push(note)
    }
  }
  if (current.length > 0) batches.push(current)

  return batches.map((notes, index) => {
    const name = `batch-${String(index + 1).padStart(2, "0")}`
    return {
      name,
      noteIds: notes.map((note) => note.id),
      markdown: renderBatch(world, name, notes),
    }
  })
}

function groupKey(note: NoteSpec): string {
  if (note.type === "project") return `project:${note.title}`
  if (note.type === "customer") return `customer:${note.title}`
  const { project, customer } = note.frontmatter
  if (typeof project === "string") return `project:${project}`
  if (typeof customer === "string") return `customer:${customer}`
  return `type:${note.type}`
}

function groupNotes(notes: NoteSpec[]): NoteSpec[][] {
  const groups = new Map<string, NoteSpec[]>()
  for (const note of notes) {
    const key = groupKey(note)
    const group = groups.get(key)
    if (group) group.push(note)
    else groups.set(key, [note])
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  )
}

function renderBatch(world: World, name: string, notes: NoteSpec[]): string {
  const people = new Map(world.people.map((person) => [person.id, person]))
  const facts = new Map(world.facts.map((fact) => [fact.id, fact]))
  const titles = new Map(world.notes.map((note) => [note.id, note.title]))
  const author = (note: NoteSpec) => {
    const person = people.get(note.author)
    if (!person) throw new Error(`unknown author ${note.author}`)
    return { person, role: roleAt(person, note.date) }
  }

  const cast = new Set<string>()
  for (const note of notes) {
    const { person, role } = author(note)
    cast.add(`- ${person.name}: ${role.title}, ${role.team} team`)
  }

  const lines = [
    `# Writing brief ${name}`,
    "",
    `Write each of the ${notes.length} notes below as a markdown file of the vault, following corpus/WRITING.md.`,
    "",
    "## Cast",
    "",
    `- ${world.meta.company} designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in ${offices()}.`,
    ...cast,
    "",
    "## Notes",
  ]

  for (const note of notes) {
    const { person, role } = author(note)
    const [min, max] = note.words
    lines.push(
      "",
      `### \`${note.path}\``,
      "",
      `- Type: ${note.type}`,
      `- Date: ${note.date}`,
      `- Author: ${person.name} (${role.title})`,
      `- Length: ${min} to ${max} words`,
      "",
      "Frontmatter, copied exactly:",
      "",
      "```yaml",
      ...yaml(note.frontmatter),
      "```",
      "",
      `Situation: ${note.context}`,
      "",
      "Facts to state, keeping every anchor word for word:",
      ""
    )
    if (note.states.length === 0) lines.push("- None beyond the situation.")
    for (const id of note.states) {
      const fact = facts.get(id)
      if (!fact) throw new Error(`unknown fact ${id}`)
      const anchors = fact.anchors.map((anchor) => `"${anchor}"`).join(", ")
      lines.push(`- ${fact.statement} Anchors: ${anchors}.`)
    }
    if (note.links.length > 0) {
      lines.push("", "Links, each inside a real sentence of the note:", "")
      for (const link of note.links) {
        lines.push(`- [[${titles.get(link.target)}]]: ${link.intent}`)
      }
    }
    if (note.forbiddenTerms.length > 0) {
      lines.push(
        "",
        `Never use these words: ${note.forbiddenTerms.join(", ")}.`
      )
    }
  }
  return `${lines.join("\n")}\n`
}

/** YAML for string and string-list values, plain when safe, else quoted. */
function yaml(frontmatter: Record<string, string | string[]>): string[] {
  const scalar = (value: string) => {
    const plain =
      /^\d{4}-\d{2}-\d{2}$/.test(value) ||
      (/^[A-Za-z][A-Za-z0-9 .'&()-]*[A-Za-z0-9.)]$/.test(value) &&
        !/^(true|false|yes|no|on|off|null)$/i.test(value))
    return plain ? value : JSON.stringify(value)
  }
  return Object.entries(frontmatter).flatMap(([key, value]) =>
    Array.isArray(value)
      ? [`${key}:`, ...value.map((item) => `  - ${scalar(item)}`)]
      : [`${key}: ${scalar(value)}`]
  )
}

/** "Portland (headquarters), Denver, Austin, Boston and Chicago". */
function offices(): string {
  const [headquarters, ...others] = OFFICES
  const last = others.pop()
  return `${headquarters} (headquarters), ${others.join(", ")} and ${last}`
}
