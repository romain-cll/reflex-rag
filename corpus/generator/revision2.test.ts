import { describe, expect, test } from "bun:test"
import { renderBatches } from "./briefs.ts"
import type { World } from "./schema.ts"
import { generateWorld } from "./world.ts"

type Fact = World["facts"][number]
type Note = World["notes"][number]
type Project = World["projects"][number]

const SEED = 42
const world = generateWorld({ seed: SEED, scale: 1 })

/** Worlds by scale, generated once and shared by every test. */
const generated = new Map<number, World | Error>()
function worldAt(scale: number): World {
  if (scale === 1) return world
  let entry = generated.get(scale)
  if (entry === undefined) {
    try {
      entry = generateWorld({ seed: SEED, scale })
    } catch (error) {
      entry = error instanceof Error ? error : new Error(String(error))
    }
    generated.set(scale, entry)
  }
  if (entry instanceof Error) throw entry
  return entry
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

function money(value: string): number {
  return Number(value.replace(/[$,]/g, ""))
}

function statedBy(w: World, factId: string): Note[] {
  return w.notes.filter((note) => note.states.includes(factId))
}

function statesOf(w: World, note: Note): Fact[] {
  const facts = byId(w.facts)
  return note.states.flatMap((id) => {
    const fact = facts.get(id)
    return fact ? [fact] : []
  })
}

/** Notes of a project: its hub page and every note whose frontmatter names it. */
function notesOfProject(w: World, project: Project): Note[] {
  return w.notes.filter(
    (note) =>
      note.frontmatter.project === project.codename ||
      (note.type === "project" && note.title === project.codename)
  )
}

function projectNote(
  w: World,
  project: Project,
  titleEnd: string
): Note | undefined {
  return notesOfProject(w, project).find((note) =>
    note.title.endsWith(titleEnd)
  )
}

function projectFacts(w: World, project: Project, attribute: string): Fact[] {
  return w.facts.filter(
    (fact) => fact.subject === project.id && fact.attribute === attribute
  )
}

/** The enclosure_vendor fact a note states, if any. */
function vendorFactOf(w: World, note: Note | undefined): Fact | undefined {
  if (!note) return undefined
  return statesOf(w, note).find((fact) => fact.attribute === "enclosure_vendor")
}

function frontmatterValues(note: Note): string[] {
  return Object.values(note.frontmatter).flat()
}

function sharedBetweenProjects(
  w: World,
  valuesOf: (project: Project) => string[]
): string[] {
  const owners = new Map<string, Set<string>>()
  for (const project of w.projects) {
    for (const value of valuesOf(project)) {
      const set = owners.get(value) ?? new Set<string>()
      set.add(project.id)
      owners.set(value, set)
    }
  }
  return [...owners.entries()]
    .filter(([, projects]) => projects.size > 1)
    .map(([value, projects]) => `${value}: ${[...projects].join(", ")}`)
}

function danglingReferences(w: World): string[] {
  const people = byId(w.people)
  const facts = byId(w.facts)
  const notes = byId(w.notes)
  const dangling: string[] = []
  const check = (map: Map<string, unknown>, id: string, where: string) => {
    if (!map.has(id)) dangling.push(`${where} -> ${id}`)
  }
  for (const note of w.notes) {
    check(people, note.author, `${note.id}.author`)
    for (const id of note.states) check(facts, id, `${note.id}.states`)
    for (const link of note.links) check(notes, link.target, `${note.id}.links`)
  }
  for (const project of w.projects) {
    check(people, project.owner, `${project.id}.owner`)
  }
  for (const trap of w.traps) {
    for (const id of trap.facts) check(facts, id, `${trap.id}.facts`)
    for (const id of trap.truthNotes) check(notes, id, `${trap.id}.truthNotes`)
    for (const id of trap.decoyNotes) check(notes, id, `${trap.id}.decoyNotes`)
  }
  for (const chain of w.chains) {
    for (const id of chain.notes) check(notes, id, `${chain.id}.notes`)
    check(facts, chain.answer, `${chain.id}.answer`)
  }
  for (const fact of w.facts) {
    if (fact.supersededBy !== null) {
      check(facts, fact.supersededBy, `${fact.id}.supersededBy`)
    }
  }
  return dangling
}

function datingProblems(w: World): string[] {
  const facts = byId(w.facts)
  const problems: string[] = []
  for (const note of w.notes) {
    if (note.date < w.meta.start || note.date > w.meta.today) {
      problems.push(`${note.id} ${note.date} is outside the world`)
    }
    for (const id of note.states) {
      const fact = facts.get(id)
      if (fact && note.date < fact.validFrom) {
        problems.push(
          `${note.id} (${note.date}) states ${fact.id} (${fact.validFrom})`
        )
      }
    }
  }
  return problems
}

const SCALES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

describe("AC6 (extended) — references hold at every scale", () => {
  for (const scale of SCALES) {
    test(`AC6 — scale ${scale} generates, with sound references and dates`, () => {
      expect(() => worldAt(scale)).not.toThrow()
      const w = worldAt(scale)
      expect(w.meta.scale).toBe(scale)
      expect(danglingReferences(w)).toEqual([])
      expect(datingProblems(w)).toEqual([])
    })
  }
})

describe("AC9 (extended) — contradictions read as independent sources", () => {
  const traps = world.traps.filter((trap) => trap.kind === "contradiction")

  test("AC9 — the notes stating a contradiction's facts have different authors and are at most 7 days apart", () => {
    expect(traps.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const trap of traps) {
      const [first, second] = trap.facts
      const left = statedBy(world, first ?? "")
      const right = statedBy(world, second ?? "")
      const ok = left.some((a) =>
        right.some(
          (b) =>
            a.author !== b.author && Math.abs(daysBetween(a.date, b.date)) <= 7
        )
      )
      if (!ok) bad.push(trap.id)
    }
    expect(bad).toEqual([])
  })

  test("AC9 — the notes of a divergent_duplicate are of the same date and the duplicate's title ends with (copy)", () => {
    const duplicates = world.traps.filter(
      (trap) => trap.kind === "divergent_duplicate"
    )
    expect(duplicates.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const trap of duplicates) {
      const [first, second] = trap.facts
      const left = statedBy(world, first ?? "")
      const right = statedBy(world, second ?? "")
      const ok = left.some((a) =>
        right.some(
          (b) =>
            a.date === b.date &&
            Number(a.title.endsWith("(copy)")) +
              Number(b.title.endsWith("(copy)")) ===
              1
        )
      )
      if (!ok) bad.push(trap.id)
    }
    expect(bad).toEqual([])
  })
})

describe("AC10 (extended) — the first note of a chain does not reveal its end", () => {
  const notes = byId(world.notes)
  const facts = byId(world.facts)

  test("AC10 — the last note's title and the answer's anchors do not appear in the first note", () => {
    expect(world.chains.length).toBeGreaterThan(0)
    const leaks: string[] = []
    for (const chain of world.chains) {
      const first = notes.get(chain.notes[0] ?? "")
      const last = notes.get(chain.notes[chain.notes.length - 1] ?? "")
      const answer = facts.get(chain.answer)
      if (!first || !last || !answer) {
        leaks.push(`${chain.id}: broken chain`)
        continue
      }
      const texts = [
        first.title,
        first.context,
        ...first.links.map((link) => link.intent),
        ...frontmatterValues(first),
        ...statesOf(world, first).map((fact) => fact.statement),
        ...first.links.map((link) => notes.get(link.target)?.title ?? ""),
      ].map((text) => text.toLowerCase())
      for (const term of [last.title, ...answer.anchors]) {
        if (texts.some((text) => text.includes(term.toLowerCase()))) {
          leaks.push(`${chain.id}: "${term}" appears in ${first.id}`)
        }
      }
    }
    expect(leaks).toEqual([])
  })
})

describe("AC12 (extended) — projects stay together in the briefs", () => {
  test("AC12 — with batches of 20, the notes of each project fall in at most 2 batches", () => {
    const batches = renderBatches(world, 20)
    const bad: string[] = []
    for (const project of world.projects) {
      const ids = new Set(notesOfProject(world, project).map((note) => note.id))
      expect(ids.size).toBeGreaterThan(0)
      const hit = batches.filter((batch) =>
        batch.noteIds.some((id) => ids.has(id))
      )
      if (hit.length > 2) {
        bad.push(`${project.codename}: ${hit.length} batches`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe("AC14 — diverse answers", () => {
  const facts = byId(world.facts)
  const values = world.chains.map((chain) => facts.get(chain.answer)?.value)

  test("AC14 — chain answers take at least 18 distinct values", () => {
    expect(world.chains.length).toBeGreaterThan(0)
    expect(values.every((value) => value !== undefined)).toBe(true)
    expect(new Set(values).size).toBeGreaterThanOrEqual(18)
  })

  test("AC14 — no value answers more than 4 chains", () => {
    const counts = new Map<string | undefined, number>()
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
    const overused = [...counts.entries()]
      .filter(([, count]) => count > 4)
      .map(([value, count]) => `${value}: ${count} chains`)
    expect(overused).toEqual([])
  })
})

describe("AC15 — no shared facts between projects", () => {
  for (const scale of [1, 2]) {
    describe(`scale ${scale}`, () => {
      const attributeValues =
        (w: World, attribute: string) => (project: Project) =>
          projectFacts(w, project, attribute).map((fact) => fact.value)

      test(`AC15 — scale ${scale}: no two projects share a goal anchor`, () => {
        const w = worldAt(scale)
        const shared = sharedBetweenProjects(w, (project) =>
          projectFacts(w, project, "goal").flatMap((fact) => fact.anchors)
        )
        expect(shared).toEqual([])
      })

      test(`AC15 — scale ${scale}: no two projects share a battery-life value`, () => {
        const w = worldAt(scale)
        const shared = sharedBetweenProjects(
          w,
          attributeValues(w, "battery_life_requirement")
        )
        expect(shared).toEqual([])
      })

      test(`AC15 — scale ${scale}: no two projects share an EVT unit count`, () => {
        const w = worldAt(scale)
        const shared = sharedBetweenProjects(w, attributeValues(w, "evt_units"))
        expect(shared).toEqual([])
      })

      test(`AC15 — scale ${scale}: no two projects share a DVT finding`, () => {
        const w = worldAt(scale)
        const shared = sharedBetweenProjects(w, (project) =>
          projectFacts(w, project, "dvt_finding").flatMap((fact) => [
            fact.value,
            ...fact.anchors,
          ])
        )
        expect(shared).toEqual([])
      })
    })
  }
})

describe("AC16 — independent sources", () => {
  const people = byId(world.people)
  const notes = byId(world.notes)

  /** The meeting a journal links to: the meeting notes among its link targets. */
  function independenceProblems(journals: Note[]): string[] {
    const problems: string[] = []
    for (const journal of journals) {
      const meetings = journal.links.flatMap((link) => {
        const target = notes.get(link.target)
        return target?.type === "meeting" ? [target] : []
      })
      if (meetings.length === 0) {
        problems.push(`${journal.id}: links to no meeting`)
      }
      const writer = people.get(journal.author)?.name
      for (const meeting of meetings) {
        const attendees = meeting.frontmatter.attendees
        const names = Array.isArray(attendees) ? attendees : []
        if (journal.author === meeting.author) {
          problems.push(`${journal.id}: written by the author of ${meeting.id}`)
        }
        if (writer !== undefined && names.includes(writer)) {
          problems.push(`${journal.id}: ${writer} attended ${meeting.id}`)
        }
      }
    }
    return problems
  }

  test("AC16 — the journal note of an evt_units contradiction is written by neither the author nor an attendee of the meeting it links to", () => {
    const evtFacts = new Set(
      world.traps
        .filter((trap) => trap.kind === "contradiction")
        .flatMap((trap) => trap.facts)
        .filter(
          (id) =>
            world.facts.find((f) => f.id === id)?.attribute === "evt_units"
        )
    )
    const journals = world.notes.filter(
      (note) =>
        note.type === "journal" && note.states.some((id) => evtFacts.has(id))
    )
    expect(journals.length).toBeGreaterThan(0)
    expect(independenceProblems(journals)).toEqual([])
  })

  test("AC16 — every journal note stating a superseded enclosure vendor is written by neither the author nor an attendee of the meeting it links to", () => {
    const superseded = new Set(
      world.facts
        .filter(
          (fact) =>
            fact.attribute === "enclosure_vendor" && fact.supersededBy !== null
        )
        .map((fact) => fact.id)
    )
    expect(superseded.size).toBeGreaterThan(0)
    const journals = world.notes.filter(
      (note) =>
        note.type === "journal" && note.states.some((id) => superseded.has(id))
    )
    expect(journals.length).toBeGreaterThan(0)
    expect(independenceProblems(journals)).toEqual([])
  })
})

describe("AC17 — future launches", () => {
  test("AC17 — the value of every launch_date fact is after meta.today", () => {
    const launches = world.facts.filter(
      (fact) => fact.attribute === "launch_date"
    )
    expect(launches.length).toBeGreaterThan(0)
    const past = launches.filter((fact) => !(fact.value > world.meta.today))
    expect(past.map((fact) => `${fact.id} ${fact.value}`)).toEqual([])
  })
})

describe("AC18 — coherent preference", () => {
  test("AC18 — the vendor preferred at the enclosure review has the lower tooling price", () => {
    const suppliers = byId(world.suppliers)
    const bad: string[] = []
    for (const project of world.projects) {
      const review = projectNote(world, project, "enclosure review")
      const preferred = vendorFactOf(world, review)
      const offers = world.facts
        .filter(
          (fact) =>
            fact.subject === project.id &&
            fact.attribute.startsWith("enclosure_tooling_price:")
        )
        .map((fact) => ({
          vendor: suppliers.get(fact.attribute.split(":")[1] ?? "")?.name,
          price: money(fact.value),
        }))
      const chosen = offers.find((offer) => offer.vendor === preferred?.value)
      const others = offers.filter((offer) => offer !== chosen)
      if (
        !review ||
        !preferred ||
        offers.length !== 2 ||
        !chosen ||
        others.some((offer) => !(chosen.price < offer.price))
      ) {
        bad.push(project.codename)
      }
    }
    expect(world.projects.length).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })
})

describe("AC19 — coherent timeline", () => {
  test("AC19 — the EVT review is dated at least the selected vendor's tooling lead time after the sign-off", () => {
    const suppliers = byId(world.suppliers)
    const bad: string[] = []
    for (const project of world.projects) {
      const signoff = projectNote(world, project, "tooling sign-off")
      const evt = projectNote(world, project, "EVT review")
      const selected = vendorFactOf(world, signoff)
      const supplier = world.suppliers.find(
        (candidate) => candidate.name === selected?.value
      )
      const leadTime = projectFacts(
        world,
        project,
        `enclosure_lead_time:${supplier?.id ?? ""}`
      )[0]
      const weeks = Number(leadTime?.value.split(" ")[0])
      if (
        !signoff ||
        !evt ||
        !supplier ||
        !suppliers.has(supplier.id) ||
        Number.isNaN(weeks) ||
        daysBetween(signoff.date, evt.date) < 7 * weeks
      ) {
        bad.push(project.codename)
      }
    }
    expect(world.projects.length).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })
})

describe("AC20 — absent topics", () => {
  test("AC20 — absent topics use at least 15 distinct forbiddenTerms sets", () => {
    const sets = new Set(
      world.absent.map((topic) =>
        topic.forbiddenTerms
          .map((term) => term.toLowerCase())
          .sort()
          .join("|")
      )
    )
    expect(sets.size).toBeGreaterThanOrEqual(15)
  })

  test("AC20 — no absent forbidden term is a city", () => {
    // Cities of the world, plus well-known ones a question could name.
    const cities = new Set(
      [
        ...world.customers.map((customer) => customer.city),
        ...world.suppliers.map((supplier) => supplier.city),
        "Portland",
        "Denver",
        "Austin",
        "Seattle",
        "Reno",
        "San Francisco",
        "Los Angeles",
        "New York",
        "Boston",
        "Chicago",
        "Tokyo",
        "London",
        "Berlin",
      ].map((city) => city.toLowerCase())
    )
    const offenders = world.absent.flatMap((topic) =>
      topic.forbiddenTerms
        .filter((term) => cities.has(term.toLowerCase()))
        .map((term) => `${topic.id}: ${term}`)
    )
    expect(world.absent.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})

describe("AC21 — vocabulary trap", () => {
  test("AC21 — the forbidden terms of a sign-off include every quote and bid word", () => {
    const required = [
      "quote",
      "quotes",
      "quoted",
      "quoting",
      "quotation",
      "quotations",
      "bid",
      "bids",
      "bidding",
      "bidder",
      "bidders",
    ]
    const signoffs = world.notes.filter((note) =>
      note.title.endsWith("tooling sign-off")
    )
    expect(signoffs.length).toBe(world.projects.length)
    const missing = signoffs.flatMap((note) => {
      const have = new Set(
        note.forbiddenTerms.map((term) => term.toLowerCase())
      )
      return required
        .filter((term) => !have.has(term))
        .map((term) => `${note.id}: ${term}`)
    })
    expect(missing).toEqual([])
  })
})

describe("AC22 — complete decoys", () => {
  test("AC22 — every note stating a superseded enclosure vendor is a truth or decoy note of the revised_decision trap on that vendor", () => {
    const superseded = world.facts.filter(
      (fact) =>
        fact.attribute === "enclosure_vendor" && fact.supersededBy !== null
    )
    expect(superseded.length).toBeGreaterThan(0)
    const missing: string[] = []
    for (const fact of superseded) {
      const traps = world.traps.filter(
        (trap) =>
          trap.kind === "revised_decision" && trap.facts.includes(fact.id)
      )
      expect(traps.length).toBeGreaterThan(0)
      const covered = new Set(
        traps.flatMap((trap) => [...trap.truthNotes, ...trap.decoyNotes])
      )
      for (const note of statedBy(world, fact.id)) {
        if (!covered.has(note.id)) missing.push(`${fact.id}: ${note.id}`)
      }
    }
    expect(missing).toEqual([])
  })
})

describe("AC23 — scale", () => {
  for (const scale of SCALES) {
    test(`AC23 — scale ${scale}: generation succeeds, codenames are unique, one price decision per product line at most`, () => {
      expect(() => worldAt(scale)).not.toThrow()
      const w = worldAt(scale)
      const codenames = w.projects.map((project) => project.codename)
      expect(codenames.length).toBeGreaterThan(0)
      expect(new Set(codenames).size).toBe(codenames.length)

      const priceFacts = new Map(
        w.facts
          .filter((fact) => fact.attribute === "list_price")
          .map((fact) => [fact.id, fact.subject])
      )
      const decisions = new Map<string, number>()
      for (const note of w.notes) {
        const lines = new Set(
          note.states.flatMap((id) => {
            const subject = priceFacts.get(id)
            return subject === undefined ? [] : [subject]
          })
        )
        for (const line of lines) {
          decisions.set(line, (decisions.get(line) ?? 0) + 1)
        }
      }
      const repeated = [...decisions.entries()]
        .filter(([, count]) => count > 1)
        .map(([line, count]) => `${line}: ${count} decisions`)
      expect(repeated).toEqual([])
    })
  }
})
