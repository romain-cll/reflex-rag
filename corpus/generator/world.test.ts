import { describe, expect, test } from "bun:test"
import { WorldSchema } from "./schema.ts"
import type { World } from "./schema.ts"
import { DEFAULT_QUOTAS, generateWorld } from "./world.ts"

type Fact = World["facts"][number]
type Note = World["notes"][number]

const world = generateWorld({ seed: 42, scale: 1 })

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function containsWord(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
}

function noteStates(w: World, note: Note): Fact[] {
  const facts = byId(w.facts)
  return note.states.flatMap((id) => {
    const fact = facts.get(id)
    return fact ? [fact] : []
  })
}

describe("AC1 — determinism", () => {
  test("AC1 — the same seed and scale give deep-equal worlds", () => {
    for (const seed of [1, 42, 2026]) {
      const first = generateWorld({ seed, scale: 1 })
      const second = generateWorld({ seed, scale: 1 })
      expect(second).toEqual(first)
    }
  })

  test("AC1 — different seeds give different worlds", () => {
    const seeds = [1, 2, 42, 2026]
    const worlds = seeds.map((seed) => generateWorld({ seed, scale: 1 }))
    for (let i = 0; i < worlds.length; i++) {
      for (let j = i + 1; j < worlds.length; j++) {
        expect(worlds[j]).not.toEqual(worlds[i])
      }
    }
  })
})

describe("AC2 — schema", () => {
  test("AC2 — the world passes WorldSchema.parse", () => {
    expect(() => WorldSchema.parse(world)).not.toThrow()
  })

  test("AC2 — ids are unique within each collection", () => {
    const collections: Record<string, { id: string }[]> = {
      people: world.people,
      customers: world.customers,
      suppliers: world.suppliers,
      projects: world.projects,
      facts: world.facts,
      notes: world.notes,
      traps: world.traps,
      chains: world.chains,
      absent: world.absent,
    }
    for (const [name, items] of Object.entries(collections)) {
      expect(items.length).toBeGreaterThan(0)
      expect({
        name,
        duplicates: duplicates(items.map((item) => item.id)),
      }).toEqual({ name, duplicates: [] })
    }
  })
})

describe("AC3 — size", () => {
  test("AC3 — scale 1 has between 180 and 220 notes", () => {
    expect(world.notes.length).toBeGreaterThanOrEqual(180)
    expect(world.notes.length).toBeLessThanOrEqual(220)
  })

  test("AC3 — scale 2 has at least 1.8 times as many notes as scale 1", () => {
    const double = generateWorld({ seed: 42, scale: 2 })
    expect(double.notes.length).toBeGreaterThanOrEqual(1.8 * world.notes.length)
  })
})

describe("AC4 — quotas", () => {
  test("AC4 — DEFAULT_QUOTAS carries the specified minimums", () => {
    const values = Object.values(DEFAULT_QUOTAS) as unknown[]
    for (const minimum of [30, 24, 18, 6]) {
      expect(values).toContain(minimum)
    }
    expect(
      values.filter((value) => value === 24).length
    ).toBeGreaterThanOrEqual(2)
  })

  test("AC4 — scale 1 has at least 30 chains", () => {
    expect(world.chains.length).toBeGreaterThanOrEqual(30)
  })

  test("AC4 — scale 1 has at least 24 superseded facts", () => {
    const superseded = world.facts.filter((fact) => fact.supersededBy !== null)
    expect(superseded.length).toBeGreaterThanOrEqual(24)
  })

  test("AC4 — scale 1 has at least 18 contradiction traps (contradiction + divergent_duplicate)", () => {
    const traps = world.traps.filter(
      (trap) =>
        trap.kind === "contradiction" || trap.kind === "divergent_duplicate"
    )
    expect(traps.length).toBeGreaterThanOrEqual(18)
  })

  test("AC4 — scale 1 has at least 24 absent topics", () => {
    expect(world.absent.length).toBeGreaterThanOrEqual(24)
  })

  test("AC4 — scale 1 has at least 6 undecided traps", () => {
    const traps = world.traps.filter((trap) => trap.kind === "undecided")
    expect(traps.length).toBeGreaterThanOrEqual(6)
  })

  test("AC4 — scale 1 has one vocabulary_shift trap per project", () => {
    const traps = world.traps.filter((trap) => trap.kind === "vocabulary_shift")
    expect(world.projects.length).toBeGreaterThan(0)
    expect(traps.length).toBe(world.projects.length)
  })

  test("AC4 — an unmet quota makes generateWorld throw an error naming it", () => {
    const keys = Object.keys(DEFAULT_QUOTAS)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      const quotas = { [key]: 1_000_000 } as Partial<typeof DEFAULT_QUOTAS>
      expect(() => generateWorld({ seed: 42, scale: 1, quotas })).toThrow(key)
    }
  })

  test("AC4 — options.quotas overrides the defaults", () => {
    const relaxed = Object.fromEntries(
      Object.keys(DEFAULT_QUOTAS).map((key) => [key, 0])
    ) as Partial<typeof DEFAULT_QUOTAS>
    expect(() =>
      generateWorld({ seed: 42, scale: 1, quotas: relaxed })
    ).not.toThrow()
  })
})

describe("AC5 — paths", () => {
  const folders = [
    "Projects",
    "Meetings",
    "Specs",
    "Quotes",
    "Decisions",
    "Customers",
    "Suppliers",
    "People",
  ]
  const personNames = new Set(world.people.map((person) => person.name))

  test("AC5 — every path is <Folder>/<basename>.md with an allowed folder", () => {
    const bad: string[] = []
    for (const note of world.notes) {
      if (!note.path.endsWith(".md")) {
        bad.push(note.path)
        continue
      }
      const withoutExt = note.path.slice(0, -".md".length)
      const parts = withoutExt.split("/")
      const isJournal =
        parts.length === 3 &&
        parts[0] === "Journal" &&
        personNames.has(parts[1] ?? "")
      const isPlain = parts.length === 2 && folders.includes(parts[0] ?? "")
      if (!isJournal && !isPlain) bad.push(note.path)
    }
    expect(bad).toEqual([])
  })

  test("AC5 — the basename equals the note title", () => {
    const bad = world.notes.filter(
      (note) => note.path.split("/").pop() !== `${note.title}.md`
    )
    expect(bad.map((note) => note.path)).toEqual([])
  })

  test("AC5 — basenames are unique, case-insensitive", () => {
    const basenames = world.notes.map((note) => note.title.toLowerCase())
    expect(duplicates(basenames)).toEqual([])
  })

  test("AC5 — basenames only use allowed characters", () => {
    const bad = world.notes.filter(
      (note) => !/^[A-Za-z0-9 ,.'&()-]+$/.test(note.title)
    )
    expect(bad.map((note) => note.title)).toEqual([])
  })
})

describe("AC6 — references", () => {
  const people = byId(world.people)
  const facts = byId(world.facts)
  const notes = byId(world.notes)

  test("AC6 — every reference points to an existing item of the right collection", () => {
    const dangling: string[] = []
    const check = (map: Map<string, unknown>, id: string, where: string) => {
      if (!map.has(id)) dangling.push(`${where} -> ${id}`)
    }
    for (const note of world.notes) {
      check(people, note.author, `${note.id}.author`)
      for (const id of note.states) check(facts, id, `${note.id}.states`)
      for (const link of note.links) {
        check(notes, link.target, `${note.id}.links`)
      }
    }
    for (const project of world.projects) {
      check(people, project.owner, `${project.id}.owner`)
    }
    for (const trap of world.traps) {
      for (const id of trap.facts) check(facts, id, `${trap.id}.facts`)
      for (const id of trap.truthNotes) {
        check(notes, id, `${trap.id}.truthNotes`)
      }
      for (const id of trap.decoyNotes) {
        check(notes, id, `${trap.id}.decoyNotes`)
      }
    }
    for (const chain of world.chains) {
      for (const id of chain.notes) check(notes, id, `${chain.id}.notes`)
      check(facts, chain.answer, `${chain.id}.answer`)
    }
    for (const fact of world.facts) {
      if (fact.supersededBy !== null) {
        check(facts, fact.supersededBy, `${fact.id}.supersededBy`)
      }
    }
    expect(dangling).toEqual([])
  })

  test("AC6 — every note date lies within [meta.start, meta.today]", () => {
    const outside = world.notes.filter(
      (note) => note.date < world.meta.start || note.date > world.meta.today
    )
    expect(outside.map((note) => `${note.id} ${note.date}`)).toEqual([])
  })

  test("AC6 — every note is dated on or after the validFrom of the facts it states", () => {
    const early: string[] = []
    for (const note of world.notes) {
      for (const fact of noteStates(world, note)) {
        if (note.date < fact.validFrom) {
          early.push(
            `${note.id} (${note.date}) states ${fact.id} (${fact.validFrom})`
          )
        }
      }
    }
    expect(early).toEqual([])
  })
})

describe("AC7 — facts", () => {
  test("AC7 — every fact is stated by at least one note", () => {
    const stated = new Set(world.notes.flatMap((note) => note.states))
    const orphans = world.facts.filter((fact) => !stated.has(fact.id))
    expect(orphans.map((fact) => fact.id)).toEqual([])
  })

  test("AC7 — every fact has at least one anchor", () => {
    const bad = world.facts.filter(
      (fact) =>
        fact.anchors.length === 0 ||
        fact.anchors.some((anchor) => anchor.length === 0)
    )
    expect(bad.map((fact) => fact.id)).toEqual([])
  })

  test("AC7 — every anchor is a substring of its statement", () => {
    const bad: string[] = []
    for (const fact of world.facts) {
      for (const anchor of fact.anchors) {
        if (!fact.statement.includes(anchor)) bad.push(`${fact.id}: ${anchor}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe("AC8 — supersession", () => {
  const facts = byId(world.facts)
  const superseded = world.facts.filter((fact) => fact.supersededBy !== null)

  test("AC8 — superseded facts share subject and attribute with their successor and differ in value", () => {
    expect(superseded.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const older of superseded) {
      const newer = facts.get(older.supersededBy ?? "")
      if (
        !newer ||
        newer.subject !== older.subject ||
        newer.attribute !== older.attribute ||
        newer.value === older.value
      ) {
        bad.push(older.id)
      }
    }
    expect(bad).toEqual([])
  })

  test("AC8 — the successor starts after the superseded fact and the superseded fact ends when it starts", () => {
    const bad: string[] = []
    for (const older of superseded) {
      const newer = facts.get(older.supersededBy ?? "")
      if (
        !newer ||
        !(newer.validFrom > older.validFrom) ||
        older.validTo !== newer.validFrom
      ) {
        bad.push(older.id)
      }
    }
    expect(bad).toEqual([])
  })
})

describe("AC9 — contradictions", () => {
  const facts = byId(world.facts)
  const traps = world.traps.filter(
    (trap) =>
      trap.kind === "contradiction" || trap.kind === "divergent_duplicate"
  )

  test("AC9 — a contradiction trap has exactly two facts with the same subject and attribute but different values", () => {
    expect(traps.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const trap of traps) {
      const [a, b] = trap.facts.map((id) => facts.get(id))
      if (
        trap.facts.length !== 2 ||
        !a ||
        !b ||
        a.subject !== b.subject ||
        a.attribute !== b.attribute ||
        a.value === b.value
      ) {
        bad.push(trap.id)
      }
    }
    expect(bad).toEqual([])
  })

  test("AC9 — both facts are open-ended and not superseded", () => {
    const bad: string[] = []
    for (const trap of traps) {
      for (const id of trap.facts) {
        const fact = facts.get(id)
        if (!fact || fact.validTo !== null || fact.supersededBy !== null) {
          bad.push(`${trap.id}: ${id}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  test("AC9 — no note states both facts of a contradiction", () => {
    const bad: string[] = []
    for (const trap of traps) {
      for (const note of world.notes) {
        if (
          trap.facts.length > 0 &&
          trap.facts.every((id) => note.states.includes(id))
        ) {
          bad.push(`${trap.id}: ${note.id}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

describe("AC10 — chains", () => {
  const notes = byId(world.notes)

  test("AC10 — a chain has 3 or 4 notes", () => {
    expect(world.chains.length).toBeGreaterThan(0)
    const bad = world.chains.filter(
      (chain) => chain.notes.length < 3 || chain.notes.length > 4
    )
    expect(bad.map((chain) => chain.id)).toEqual([])
  })

  test("AC10 — each note of a chain links to the next one", () => {
    const bad: string[] = []
    for (const chain of world.chains) {
      for (let i = 0; i < chain.notes.length - 1; i++) {
        const current = notes.get(chain.notes[i] ?? "")
        const next = chain.notes[i + 1]
        if (!current || !current.links.some((link) => link.target === next)) {
          bad.push(`${chain.id}: ${chain.notes[i]} -> ${next}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  test("AC10 — the answer fact is stated by the last note and not by the first", () => {
    const bad: string[] = []
    for (const chain of world.chains) {
      const first = notes.get(chain.notes[0] ?? "")
      const last = notes.get(chain.notes[chain.notes.length - 1] ?? "")
      if (
        !first ||
        !last ||
        !last.states.includes(chain.answer) ||
        first.states.includes(chain.answer)
      ) {
        bad.push(chain.id)
      }
    }
    expect(bad).toEqual([])
  })
})

describe("AC11 — forbidden terms", () => {
  const notes = byId(world.notes)

  test("AC11 — the truth notes of a vocabulary_shift trap have non-empty forbiddenTerms", () => {
    const traps = world.traps.filter((trap) => trap.kind === "vocabulary_shift")
    expect(traps.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const trap of traps) {
      expect(trap.truthNotes.length).toBeGreaterThan(0)
      for (const id of trap.truthNotes) {
        const note = notes.get(id)
        if (!note || note.forbiddenTerms.length === 0) {
          bad.push(`${trap.id}: ${id}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  test("AC11 — no note's forbidden term appears in its title, context, link intents or fact statements", () => {
    const offenders: string[] = []
    for (const note of world.notes) {
      const texts = [
        note.title,
        note.context,
        ...note.links.map((link) => link.intent),
        ...noteStates(world, note).map((fact) => fact.statement),
      ]
      for (const term of note.forbiddenTerms) {
        if (texts.some((text) => containsWord(text, term))) {
          offenders.push(`${note.id}: ${term}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test("AC11 — no absent forbidden term appears in fact statements, note titles, contexts or link intents", () => {
    const terms = world.absent.flatMap((topic) => topic.forbiddenTerms)
    expect(terms.length).toBeGreaterThan(0)
    expect(terms.every((term) => term.trim().length > 0)).toBe(true)
    const texts = [
      ...world.facts.map((fact) => fact.statement),
      ...world.notes.flatMap((note) => [
        note.title,
        note.context,
        ...note.links.map((link) => link.intent),
      ]),
    ]
    const offenders: string[] = []
    for (const term of terms) {
      if (texts.some((text) => containsWord(text, term))) offenders.push(term)
    }
    expect(offenders).toEqual([])
  })
})
