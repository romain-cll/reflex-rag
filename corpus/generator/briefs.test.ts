import { describe, expect, test } from "bun:test"
import { renderBatches } from "./briefs.ts"
import type { World } from "./schema.ts"
import { generateWorld } from "./world.ts"

type Note = World["notes"][number]

const world = generateWorld({ seed: 42, scale: 1 })
const SIZE = 10
const batches = renderBatches(world, SIZE)
const notesById = new Map(world.notes.map((note) => [note.id, note]))
const peopleById = new Map(world.people.map((person) => [person.id, person]))
const factsById = new Map(world.facts.map((fact) => [fact.id, fact]))

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function containsWord(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
}

function noteOf(id: string): Note {
  const note = notesById.get(id)
  if (!note) throw new Error(`unknown note ${id}`)
  return note
}

/** Text before the first note path of the batch: the cast section. */
function castSection(batch: (typeof batches)[number]): string {
  const positions = batch.noteIds.map((id) =>
    batch.markdown.indexOf(noteOf(id).path)
  )
  const first = Math.min(...positions)
  return batch.markdown.slice(0, first)
}

/** Text of each note section, cut at the position of the next note path. */
function noteSections(batch: (typeof batches)[number]): Map<string, string> {
  const positions = batch.noteIds
    .map((id) => ({ id, at: batch.markdown.indexOf(noteOf(id).path) }))
    .sort((a, b) => a.at - b.at)
  const sections = new Map<string, string>()
  positions.forEach((position, index) => {
    const end = positions[index + 1]?.at ?? batch.markdown.length
    sections.set(position.id, batch.markdown.slice(position.at, end))
  })
  return sections
}

function yamlBlocks(section: string): string[] {
  return [...section.matchAll(/```ya?ml\r?\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? ""
  )
}

describe("AC12 — briefs", () => {
  test("AC12 — batches are named batch-01, batch-02… in order", () => {
    expect(batches.length).toBeGreaterThan(1)
    const expected = batches.map(
      (_, index) => `batch-${String(index + 1).padStart(2, "0")}`
    )
    expect(batches.map((batch) => batch.name)).toEqual(expected)
  })

  test("AC12 — a batch holds at most `size` notes", () => {
    for (const batch of batches) {
      expect(batch.noteIds.length).toBeGreaterThan(0)
      expect(batch.noteIds.length).toBeLessThanOrEqual(SIZE)
    }
  })

  test("AC12 — every note is in exactly one batch", () => {
    const all = batches.flatMap((batch) => batch.noteIds)
    expect(all.length).toBe(world.notes.length)
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual(world.notes.map((note) => note.id).sort())
  })

  test("AC12 — a size larger than the vault gives a single batch-01", () => {
    const single = renderBatches(world, world.notes.length + 50)
    expect(single.map((batch) => batch.name)).toEqual(["batch-01"])
    expect(single[0]?.noteIds.length).toBe(world.notes.length)
  })

  test("AC12 — a size of 1 gives one batch per note", () => {
    const each = renderBatches(world, 1)
    expect(each.length).toBe(world.notes.length)
    expect(each.every((batch) => batch.noteIds.length === 1)).toBe(true)
  })

  test("AC12 — each batch starts with a cast section naming every author with their role at the note date", () => {
    const missing: string[] = []
    for (const batch of batches) {
      const cast = castSection(batch)
      for (const id of batch.noteIds) {
        const note = noteOf(id)
        const author = peopleById.get(note.author)
        if (!author) {
          missing.push(`${id}: unknown author`)
          continue
        }
        if (!cast.includes(author.name)) {
          missing.push(`${batch.name}: ${author.name}`)
        }
        const titles = author.roles
          .filter(
            (role) =>
              role.from <= note.date &&
              (role.to === null || note.date <= role.to)
          )
          .map((role) => role.title)
        if (titles.length === 0) {
          missing.push(`${id}: author has no role at ${note.date}`)
        } else if (!titles.some((title) => cast.includes(title))) {
          missing.push(`${batch.name}: role of ${author.name} at ${note.date}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("AC12 — each note lists its path and frontmatter as a fenced YAML block", () => {
    const missing: string[] = []
    for (const batch of batches) {
      const sections = noteSections(batch)
      for (const id of batch.noteIds) {
        const note = noteOf(id)
        const section = sections.get(id) ?? ""
        if (!batch.markdown.includes(note.path)) {
          missing.push(`${id}: path`)
          continue
        }
        const blocks = yamlBlocks(section)
        if (blocks.length === 0) {
          missing.push(`${id}: no fenced yaml block`)
          continue
        }
        const yaml = blocks.join("\n")
        for (const [key, value] of Object.entries(note.frontmatter)) {
          if (!yaml.includes(key)) missing.push(`${id}: key ${key}`)
          const values = Array.isArray(value) ? value : [value]
          for (const item of values) {
            if (!yaml.includes(item)) missing.push(`${id}: ${key}=${item}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("AC12 — each note lists the statement and anchors of every fact it states", () => {
    const missing: string[] = []
    for (const batch of batches) {
      const sections = noteSections(batch)
      for (const id of batch.noteIds) {
        const section = sections.get(id) ?? ""
        for (const factId of noteOf(id).states) {
          const fact = factsById.get(factId)
          if (!fact) {
            missing.push(`${id}: unknown fact ${factId}`)
            continue
          }
          if (!section.includes(fact.statement)) {
            missing.push(`${id}: statement of ${factId}`)
          }
          for (const anchor of fact.anchors) {
            if (!section.includes(anchor)) {
              missing.push(`${id}: anchor of ${factId}: ${anchor}`)
            }
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("AC12 — each link target is written as [[<target title>]] with its intent", () => {
    const missing: string[] = []
    for (const batch of batches) {
      const sections = noteSections(batch)
      for (const id of batch.noteIds) {
        const section = sections.get(id) ?? ""
        for (const link of noteOf(id).links) {
          const target = notesById.get(link.target)
          if (!target) {
            missing.push(`${id}: unknown target ${link.target}`)
            continue
          }
          if (!section.includes(`[[${target.title}]]`)) {
            missing.push(`${id}: [[${target.title}]]`)
          }
          if (!section.includes(link.intent)) {
            missing.push(`${id}: intent for ${target.title}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  test("AC12 — each note lists its forbidden terms, context and word range", () => {
    const missing: string[] = []
    for (const batch of batches) {
      const sections = noteSections(batch)
      for (const id of batch.noteIds) {
        const note = noteOf(id)
        const section = sections.get(id) ?? ""
        for (const term of note.forbiddenTerms) {
          if (!section.includes(term)) missing.push(`${id}: term ${term}`)
        }
        if (!section.includes(note.context)) missing.push(`${id}: context`)
        const [min, max] = note.words
        if (!section.includes(String(min))) missing.push(`${id}: words min`)
        if (!section.includes(String(max))) missing.push(`${id}: words max`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe("AC11 — forbidden terms in rendered batches", () => {
  test("AC11 — no absent forbidden term appears in any rendered batch", () => {
    const terms = world.absent.flatMap((topic) => topic.forbiddenTerms)
    expect(terms.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const size of [SIZE, 1, world.notes.length]) {
      for (const batch of renderBatches(world, size)) {
        for (const term of terms) {
          if (containsWord(batch.markdown, term)) {
            offenders.push(`${batch.name} (size ${size}): ${term}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
