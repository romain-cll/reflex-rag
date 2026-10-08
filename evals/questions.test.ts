import { describe, expect, test } from "bun:test"
import { generateWorld, longDate } from "../corpus/generator/world.ts"
import type { Fact, World } from "../corpus/generator/schema.ts"
import { buildQuestions } from "./questions.ts"
import { QuestionSetSchema } from "./schema.ts"

type QuestionSet = ReturnType<typeof buildQuestions>
type Question = QuestionSet["questions"][number]

const SPLITS = ["tuning", "test"] as const
const COUNTS = {
  simple: 12,
  multi_hop: 15,
  temporal: 12,
  contradiction: 9,
  no_answer: 12,
}
const CATEGORIES = Object.keys(COUNTS) as (keyof typeof COUNTS)[]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const ISO = /^\d{4}-\d{2}-\d{2}$/
const LONG_DATE = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/

const world = generateWorld({ seed: 42, scale: 1 })
const factById = new Map(world.facts.map((f) => [f.id, f]))
const trapById = new Map(world.traps.map((t) => [t.id, t]))
const chainById = new Map(world.chains.map((c) => [c.id, c]))
const absentById = new Map(world.absent.map((a) => [a.id, a]))
const noteById = new Map(world.notes.map((n) => [n.id, n]))
const notePaths = new Set(world.notes.map((n) => n.path))

let cached: QuestionSet | undefined
function questionSet(): QuestionSet {
  cached ??= buildQuestions(world)
  return cached
}

function ofCategory(category: Question["category"]): Question[] {
  return questionSet().questions.filter((q) => q.category === category)
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: missing ${what}`)
  return value
}

function isoOf(longForm: string): string | undefined {
  const match = LONG_DATE.exec(longForm)
  if (!match) return undefined
  const month = MONTHS.indexOf(match[1] ?? "") + 1
  if (month === 0) return undefined
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`
}

/** Every form a fact may legitimately be answered with. */
function forms(fact: Fact): string[] {
  const out = new Set([fact.value, ...fact.anchors])
  for (const form of [...out]) {
    if (ISO.test(form)) out.add(longDate(form))
    const iso = isoOf(form)
    if (iso) out.add(iso)
  }
  return [...out]
}

/** The facts a question's refs point to, directly or through a trap or chain. */
function refFacts(q: Question): Fact[] {
  const found = new Map<string, Fact>()
  const add = (id: string) => {
    const fact = required(factById.get(id), `fact ${id}`)
    found.set(id, fact)
  }
  for (const ref of q.refs) {
    if (factById.has(ref)) add(ref)
    const trap = trapById.get(ref)
    if (trap) trap.facts.forEach(add)
    const chain = chainById.get(ref)
    if (chain) add(chain.answer)
  }
  return [...found.values()]
}

/** The facts superseded, directly or not, by `fact`. */
function predecessors(fact: Fact): Fact[] {
  const out: Fact[] = []
  let frontier = [fact.id]
  while (frontier.length > 0) {
    const next = world.facts.filter(
      (f) => f.supersededBy !== null && frontier.includes(f.supersededBy)
    )
    out.push(...next)
    frontier = next.map((f) => f.id)
  }
  return out
}

/** The fact whose value a `value` question expects. */
function answerFact(q: Question): Fact {
  if (q.category === "multi_hop") {
    const chains = q.refs.filter((ref) => chainById.has(ref))
    expect(chains).toHaveLength(1)
    const chain = required(chainById.get(chains[0] ?? ""), "chain")
    return required(factById.get(chain.answer), "chain answer")
  }
  const facts = refFacts(q)
  if (q.category === "temporal") {
    const latest = facts.filter((f) => f.supersededBy === null)
    expect(latest).toHaveLength(1)
    return required(latest[0], "latest fact")
  }
  expect(facts).toHaveLength(1)
  return required(facts[0], "fact")
}

/**
 * The superseded fact a multi_hop chain's outdated path goes through, and the
 * fact that outdated path leads to:
 * - a supplier chain through a tooling sign-off: the decoy vendor (value of
 *   the superseded `enclosure_vendor` fact of the project) and the same
 *   attribute of its supplier;
 * - an account-owner chain: the former owner (person of the superseded
 *   `account_owner` fact of the customer) and their office.
 */
function outdatedAnswer(
  chainId: string
): { kind: "vendor" | "owner"; fact: Fact } | undefined {
  const chain = required(chainById.get(chainId), `chain ${chainId}`)
  const answer = required(factById.get(chain.answer), "chain answer")
  const notes = chain.notes.map((id) => required(noteById.get(id), id))
  const [first, second] = notes

  if (
    second?.title.endsWith("tooling sign-off") &&
    answer.subject.startsWith("supplier-")
  ) {
    const project = world.projects.find(
      (p) => p.codename === second.frontmatter.project
    )
    const decoy = world.facts.find(
      (f) =>
        f.subject === project?.id &&
        f.attribute === "enclosure_vendor" &&
        f.supersededBy !== null
    )
    const supplier = world.suppliers.find((s) => s.name === decoy?.value)
    const fact = world.facts.find(
      (f) => f.subject === supplier?.id && f.attribute === answer.attribute
    )
    return { kind: "vendor", fact: required(fact, `decoy fact of ${chainId}`) }
  }

  if (
    answer.attribute === "office" &&
    first?.title.endsWith("quarterly review")
  ) {
    const customer = world.customers.find(
      (c) => c.name === first.frontmatter.customer
    )
    const former = world.facts.find(
      (f) =>
        f.subject === customer?.id &&
        f.attribute === "account_owner" &&
        f.supersededBy !== null
    )
    const person = world.people.find((p) => p.name === former?.value)
    const fact = world.facts.find(
      (f) => f.subject === person?.id && f.attribute === "office"
    )
    return {
      kind: "owner",
      fact: required(fact, `former office of ${chainId}`),
    }
  }
  return undefined
}

/** Whether following the outdated path would give the right answer. */
function overlaps(chainId: string): boolean {
  const outdated = outdatedAnswer(chainId)
  if (!outdated) return false
  const chain = required(chainById.get(chainId), `chain ${chainId}`)
  const expected = forms(required(factById.get(chain.answer), "chain answer"))
  const wrong = forms(outdated.fact)
  return expected.some((value) => wrong.includes(value))
}

function chainOf(q: Question): string {
  const chains = q.refs.filter((ref) => chainById.has(ref))
  expect(chains).toHaveLength(1)
  return chains[0] ?? ""
}

function errorMessage(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ""
}

describe("AC1 — determinism", () => {
  test("AC1 — two builds from the same world are deep-equal", () => {
    expect(buildQuestions(world)).toEqual(buildQuestions(world))
  })

  test("AC1 — a world regenerated from the same seed gives the same set", () => {
    const again = generateWorld({ seed: 42, scale: 1 })
    expect(buildQuestions(again)).toEqual(questionSet())
  })

  test("AC1 — building does not modify the world", () => {
    const copy = structuredClone(world)
    buildQuestions(copy)
    expect(copy).toEqual(world)
  })
})

describe("AC2 — schema", () => {
  test("AC2 — the set passes QuestionSetSchema and records the world's seed and scale", () => {
    const parsed = QuestionSetSchema.parse(questionSet())
    expect(parsed.world).toEqual({ seed: 42, scale: 1 })
    expect(parsed.questions.length).toBeGreaterThan(0)
  })

  test("AC2 — question ids look like q-001 and are unique", () => {
    const ids = questionSet().questions.map((q) => q.id)
    for (const id of ids) expect(id).toMatch(/^q-\d{3,}$/)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("AC2 — question texts are unique", () => {
    const texts = questionSet().questions.map((q) => q.question)
    expect(new Set(texts).size).toBe(texts.length)
  })

  test("AC2 — the schema accepts each kind of expected answer", () => {
    const base = {
      split: "tuning",
      category: "simple",
      question: "A question?",
      stale: [],
      sources: [],
      entity: "supplier-0001",
      refs: ["fact-0001"],
    }
    const expected = [
      { kind: "value", values: ["Lyon"] },
      { kind: "conflict", values: ["12 months", "18 months"] },
      { kind: "undecided" },
      { kind: "abstain" },
    ]
    for (const [i, answer] of expected.entries()) {
      const set = {
        world: { seed: 1, scale: 1 },
        questions: [{ ...base, id: `q-00${i + 1}`, expected: answer }],
      }
      expect(QuestionSetSchema.safeParse(set).success).toBe(true)
    }
  })

  test("AC2 — the schema rejects an unknown split, category, kind or a conflict with three values", () => {
    const valid = {
      id: "q-001",
      split: "tuning",
      category: "simple",
      question: "A question?",
      expected: { kind: "value", values: ["Lyon"] },
      stale: [],
      sources: ["Suppliers/Acme.md"],
      entity: "supplier-0001",
      refs: ["fact-0001"],
    }
    const set = (patch: Record<string, unknown>) => ({
      world: { seed: 1, scale: 1 },
      questions: [{ ...valid, ...patch }],
    })
    expect(QuestionSetSchema.safeParse(set({})).success).toBe(true)
    expect(QuestionSetSchema.safeParse(set({ split: "dev" })).success).toBe(
      false
    )
    expect(
      QuestionSetSchema.safeParse(set({ category: "trivia" })).success
    ).toBe(false)
    expect(
      QuestionSetSchema.safeParse(set({ expected: { kind: "maybe" } })).success
    ).toBe(false)
    expect(
      QuestionSetSchema.safeParse(
        set({ expected: { kind: "conflict", values: ["a", "b", "c"] } })
      ).success
    ).toBe(false)
    expect(
      QuestionSetSchema.safeParse(set({ entity: undefined })).success
    ).toBe(false)
  })
})

describe("AC3 — counts", () => {
  test("AC3 — each split holds 12 simple, 15 multi_hop, 12 temporal, 9 contradiction and 12 no_answer questions", () => {
    for (const split of SPLITS) {
      const counts = Object.fromEntries(
        CATEGORIES.map((category) => [
          category,
          questionSet().questions.filter(
            (q) => q.split === split && q.category === category
          ).length,
        ])
      )
      expect(counts).toEqual(COUNTS)
    }
    expect(questionSet().questions).toHaveLength(120)
  })

  const wrap = (patch: Partial<World>): World => ({ ...world, ...patch })
  const copies = world.notes.map((note) => ({
    ...note,
    id: `${note.id}-copy`,
    title: `${note.title} (copy)`,
    path: note.path.replace(/\.md$/, " (copy).md"),
  }))
  const cannotFill: [string, World][] = [
    [
      "simple",
      wrap({
        notes: [...world.notes, ...copies],
        traps: world.traps.filter((t) => t.kind !== "undecided"),
      }),
    ],
    ["multi_hop", wrap({ chains: [] })],
    [
      "temporal",
      wrap({
        facts: world.facts.map((f) => ({
          ...f,
          supersededBy: null,
          validTo: null,
        })),
        traps: world.traps.filter(
          (t) =>
            t.kind !== "revised_decision" &&
            t.kind !== "stale_note" &&
            t.kind !== "vocabulary_shift"
        ),
      }),
    ],
    [
      "contradiction",
      wrap({
        traps: world.traps.filter(
          (t) => t.kind !== "contradiction" && t.kind !== "divergent_duplicate"
        ),
      }),
    ],
    ["no_answer", wrap({ absent: [] })],
  ]

  for (const [category, small] of cannotFill) {
    test(`AC3 — throws an error naming ${category} and a split when the world has no ${category} candidate`, () => {
      const message = errorMessage(() => buildQuestions(small))
      expect(message).toContain(category)
      expect(message).toMatch(/\b(tuning|test)\b/)
    })
  }

  test("AC3 — throws when the world has some but too few candidates for a category", () => {
    const message = errorMessage(() =>
      buildQuestions({ ...world, chains: world.chains.slice(0, 4) })
    )
    expect(message).toContain("multi_hop")
    expect(message).toMatch(/\b(tuning|test)\b/)
  })
})

describe("AC4 — disjoint splits", () => {
  test("AC4 — no entity appears in both splits", () => {
    const splitsOf = new Map<string, Set<string>>()
    for (const q of questionSet().questions) {
      const splits = splitsOf.get(q.entity) ?? new Set<string>()
      splits.add(q.split)
      splitsOf.set(q.entity, splits)
    }
    expect(splitsOf.size).toBeGreaterThan(2)
    for (const [entity, splits] of splitsOf) {
      expect({ entity, splits: splits.size }).toEqual({ entity, splits: 1 })
    }
  })

  test("AC4 — entities of the same kind with consecutive ids go to opposite splits", () => {
    const splitOf = new Map(
      questionSet().questions.map((q) => [q.entity, q.split])
    )
    let checked = 0
    for (const [entity, split] of splitOf) {
      const match = /^(project|customer|supplier|person)-(\d{4})$/.exec(entity)
      if (!match) continue
      const next = `${match[1]}-${String(Number(match[2]) + 1).padStart(4, "0")}`
      const nextSplit = splitOf.get(next)
      if (nextSplit === undefined) continue
      expect({ entity, next, split: nextSplit }).toEqual({
        entity,
        next,
        split: split === "tuning" ? "test" : "tuning",
      })
      checked++
    }
    expect(checked).toBeGreaterThan(3)
  })

  test("AC4 — a question about the company has an entity of the form company:<topic>", () => {
    for (const q of questionSet().questions) {
      const subjects = [
        ...refFacts(q).map((f) => f.subject),
        ...q.refs.map((ref) => absentById.get(ref)?.subject),
      ]
      if (subjects.includes("company")) expect(q.entity).toMatch(/^company:.+/)
      else expect(q.entity.startsWith("company")).toBe(false)
    }
  })
})

describe("AC5 — sources", () => {
  test("AC5 — every source is the path of a world note, and only abstain questions have none", () => {
    for (const q of questionSet().questions) {
      for (const source of q.sources) expect(notePaths.has(source)).toBe(true)
      if (q.expected.kind === "abstain") expect(q.sources).toEqual([])
      else expect(q.sources.length).toBeGreaterThan(0)
    }
  })

  test("AC5 — a simple or temporal value question's sources state its fact", () => {
    const questions = [...ofCategory("simple"), ...ofCategory("temporal")]
    const states = (path: string, factIds: string[]) => {
      const note = required(
        world.notes.find((n) => n.path === path),
        `note ${path}`
      )
      return factIds.some((id) => note.states.includes(id))
    }
    for (const q of questions) {
      const factIds =
        q.expected.kind === "value"
          ? [answerFact(q).id]
          : refFacts(q).map((f) => f.id)
      expect(factIds.length).toBeGreaterThan(0)
      for (const source of q.sources) {
        expect({ id: q.id, source, states: states(source, factIds) }).toEqual({
          id: q.id,
          source,
          states: true,
        })
      }
    }
  })

  test("AC5 — a conflict question's sources are the truth notes of its trap", () => {
    for (const q of ofCategory("contradiction")) {
      const traps = q.refs.filter((ref) => trapById.has(ref))
      expect(traps).toHaveLength(1)
      const trap = required(trapById.get(traps[0] ?? ""), "trap")
      const truth = trap.truthNotes.map(
        (id) => required(noteById.get(id), `note ${id}`).path
      )
      expect([...q.sources].sort()).toEqual([...truth].sort())
    }
  })

  test("AC5 — a multi_hop question's sources are the notes of its chain after the first one, in order", () => {
    const questions = ofCategory("multi_hop")
    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) {
      const chains = q.refs.filter((ref) => chainById.has(ref))
      expect(chains).toHaveLength(1)
      const chain = required(chainById.get(chains[0] ?? ""), "chain")
      const paths = chain.notes
        .slice(1)
        .map((id) => required(noteById.get(id), `note ${id}`).path)
      expect(paths.length).toBeGreaterThan(0)
      expect(q.sources).toEqual(paths)
    }
  })
})

describe("AC6 — expected values", () => {
  test("AC6 — value questions expect values taken from the answer fact (its value or its anchors)", () => {
    const questions = questionSet().questions.filter(
      (q) => q.expected.kind === "value"
    )
    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) {
      if (q.expected.kind !== "value") continue
      const allowed = forms(answerFact(q))
      expect(q.expected.values.length).toBeGreaterThan(0)
      for (const value of q.expected.values) {
        expect({ id: q.id, value, allowed: allowed.includes(value) }).toEqual({
          id: q.id,
          value,
          allowed: true,
        })
      }
    }
  })

  test("AC6 — dates are given both as a long date and in ISO form", () => {
    let dates = 0
    for (const q of questionSet().questions) {
      if (q.expected.kind !== "value") continue
      const values = q.expected.values
      for (const value of values) {
        const iso = isoOf(value)
        if (iso) {
          dates++
          expect(values).toContain(iso)
        }
        if (ISO.test(value)) {
          dates++
          expect(values).toContain(longDate(value))
        }
      }
    }
    expect(dates).toBeGreaterThan(0)
  })

  test("AC6 — a launch date question expects the date in both forms", () => {
    const launches = ofCategory("temporal").filter(
      (q) => answerFact(q).attribute === "launch_date"
    )
    expect(launches.length).toBeGreaterThan(0)
    for (const q of launches) {
      const fact = answerFact(q)
      const values = q.expected.kind === "value" ? q.expected.values : []
      expect(values).toContain(fact.value)
      expect(values).toContain(longDate(fact.value))
    }
  })

  test("AC6 — a conflict question's two values are anchors of the two facts of a contradiction or divergent_duplicate trap", () => {
    for (const q of ofCategory("contradiction")) {
      if (q.expected.kind !== "conflict") continue
      const traps = q.refs
        .map((ref) => trapById.get(ref))
        .filter((t) => t !== undefined)
      expect(traps).toHaveLength(1)
      const trap = required(traps[0], "trap")
      expect(["contradiction", "divergent_duplicate"]).toContain(trap.kind)
      expect(trap.facts).toHaveLength(2)
      const [a, b] = trap.facts.map(
        (id) => required(factById.get(id), `fact ${id}`).anchors
      )
      const [x, y] = q.expected.values
      expect(x).not.toBe(y)
      const straight = a?.includes(x) === true && b?.includes(y) === true
      const crossed = a?.includes(y) === true && b?.includes(x) === true
      expect({ id: q.id, matches: straight || crossed }).toEqual({
        id: q.id,
        matches: true,
      })
    }
  })

  test("AC6 — a temporal question expects the latest fact of a supersession chain and lists the superseded anchors as stale", () => {
    const questions = ofCategory("temporal")
    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) {
      const latest = answerFact(q)
      expect(latest.supersededBy).toBeNull()
      const older = predecessors(latest)
      expect(older.length).toBeGreaterThan(0)
      if (q.expected.kind !== "value") {
        throw new Error(`${q.id}: temporal expects a value`)
      }
      for (const value of q.expected.values) {
        expect(forms(latest)).toContain(value)
      }
      expect(q.stale.length).toBeGreaterThan(0)
      const staleForms = older.flatMap(forms)
      for (const stale of q.stale) expect(staleForms).toContain(stale)
      for (const fact of older) {
        expect(fact.anchors.some((anchor) => q.stale.includes(anchor))).toBe(
          true
        )
      }
      for (const stale of q.stale) {
        expect(q.expected.values).not.toContain(stale)
      }
    }
  })

  test("AC6 — a supplier multi_hop question reached through a tooling sign-off lists the decoy vendor's value as stale", () => {
    const questions = ofCategory("multi_hop").filter(
      (q) => outdatedAnswer(chainOf(q))?.kind === "vendor"
    )
    expect(questions.length).toBeGreaterThan(0)
    const attributes = new Set<string>()
    for (const q of questions) {
      const { fact } = required(outdatedAnswer(chainOf(q)), "outdated answer")
      attributes.add(fact.attribute)
      expect(fact.anchors.length).toBeGreaterThan(0)
      for (const anchor of fact.anchors) {
        expect({ id: q.id, stale: q.stale.includes(anchor) }).toEqual({
          id: q.id,
          stale: true,
        })
      }
    }
    // Both the contact chains and the city chains are exercised.
    expect([...attributes].sort()).toEqual(["account_contact", "city"])
  })

  test("AC6 — an account-owner multi_hop question lists the former owner's office as stale", () => {
    const questions = ofCategory("multi_hop").filter(
      (q) => outdatedAnswer(chainOf(q))?.kind === "owner"
    )
    expect(questions.length).toBeGreaterThan(0)
    for (const q of questions) {
      const { fact } = required(outdatedAnswer(chainOf(q)), "outdated answer")
      expect(fact.attribute).toBe("office")
      for (const anchor of fact.anchors) {
        expect({ id: q.id, stale: q.stale.includes(anchor) }).toEqual({
          id: q.id,
          stale: true,
        })
      }
    }
  })

  test("AC6 — a multi_hop stale value is never the chain's own answer", () => {
    for (const q of ofCategory("multi_hop")) {
      const chain = required(chainById.get(chainOf(q)), "chain")
      const own = forms(required(factById.get(chain.answer), "chain answer"))
      for (const stale of q.stale) expect(own).not.toContain(stale)
    }
  })

  test("AC6 — no question has an expected value that is also one of its stale values", () => {
    expect(questionSet().questions.some((q) => q.stale.length > 0)).toBe(true)
    for (const q of questionSet().questions) {
      const values =
        q.expected.kind === "value" || q.expected.kind === "conflict"
          ? q.expected.values
          : []
      const expected = values.map((value) => value.toLowerCase())
      for (const stale of q.stale) {
        expect({
          id: q.id,
          overlap: expected.includes(stale.toLowerCase()),
        }).toEqual({ id: q.id, overlap: false })
      }
    }
  })

  test("AC6 — a multi_hop candidate whose outdated path gives the right answer is dropped", () => {
    const overlapping = world.chains.filter((c) => overlaps(c.id))
    // The scale-1 world holds such chains (two account owners in the same office).
    expect(overlapping.length).toBeGreaterThan(0)
    const used = new Set(ofCategory("multi_hop").map(chainOf))
    for (const chain of overlapping) {
      expect({ chain: chain.id, used: used.has(chain.id) }).toEqual({
        chain: chain.id,
        used: false,
      })
    }
  })

  test("AC6 — an abstain question is about an absent topic of the world", () => {
    for (const q of ofCategory("no_answer")) {
      expect(q.expected).toEqual({ kind: "abstain" })
      const topics = q.refs.filter((ref) => absentById.has(ref))
      expect(topics).toHaveLength(1)
    }
  })
})

describe("AC7 — categories", () => {
  test("AC7 — multi_hop: one question per chain, about the chain's answer fact", () => {
    const questions = ofCategory("multi_hop")
    const chains = questions.flatMap((q) =>
      q.refs.filter((ref) => chainById.has(ref))
    )
    expect(chains).toHaveLength(questions.length)
    expect(new Set(chains).size).toBe(chains.length)
    for (const q of questions) {
      expect(q.expected.kind).toBe("value")
      expect(answerFact(q)).toBeDefined()
    }
  })

  test("AC7 — temporal: questions about the superseded facts of the world, current value expected", () => {
    const attributes = new Set([
      "enclosure_vendor",
      "launch_date",
      "account_owner",
      "role",
    ])
    const subjects = new Set<string>()
    for (const q of ofCategory("temporal")) {
      expect(q.expected.kind).toBe("value")
      const latest = answerFact(q)
      expect(attributes.has(latest.attribute)).toBe(true)
      const key = `${latest.subject}/${latest.attribute}`
      expect(subjects.has(key)).toBe(false)
      subjects.add(key)
    }
  })

  test("AC7 — temporal: the enclosure-vendor questions use the word quote", () => {
    // 29 superseded facts, 23 of them not about the enclosure vendor: the 24
    // selected questions include at least one vendor question.
    const vendor = ofCategory("temporal").filter(
      (q) => answerFact(q).attribute === "enclosure_vendor"
    )
    expect(vendor.length).toBeGreaterThan(0)
    for (const q of vendor) expect(q.question).toMatch(/\bquote\b/i)
  })

  test("AC7 — contradiction: one conflict question per contradiction or divergent_duplicate trap", () => {
    const questions = ofCategory("contradiction")
    const traps = questions.flatMap((q) =>
      q.refs.filter((ref) => trapById.has(ref))
    )
    expect(traps).toHaveLength(questions.length)
    expect(new Set(traps).size).toBe(traps.length)
    for (const q of questions) {
      expect(q.expected.kind).toBe("conflict")
      const trap = required(
        trapById.get(q.refs.find((ref) => trapById.has(ref)) ?? ""),
        "trap"
      )
      expect(["contradiction", "divergent_duplicate"]).toContain(trap.kind)
    }
  })

  test("AC7 — no_answer: one abstain question per absent topic", () => {
    const questions = ofCategory("no_answer")
    const topics = questions.flatMap((q) =>
      q.refs.filter((ref) => absentById.has(ref))
    )
    expect(topics).toHaveLength(questions.length)
    expect(new Set(topics).size).toBe(topics.length)
    for (const q of questions) expect(q.expected.kind).toBe("abstain")
  })

  test("AC7 — simple: a fact stated by exactly one note, in no trap and no chain, or an undecided trap", () => {
    const inTrap = new Set(world.traps.flatMap((t) => t.facts))
    const inChain = new Set(world.chains.map((c) => c.answer))
    for (const q of ofCategory("simple")) {
      if (q.expected.kind === "undecided") {
        const traps = q.refs
          .map((ref) => trapById.get(ref))
          .filter((t) => t !== undefined)
        expect(traps).toHaveLength(1)
        expect(traps[0]?.kind).toBe("undecided")
        continue
      }
      expect(q.expected.kind).toBe("value")
      const fact = answerFact(q)
      const stating = world.notes.filter((n) => n.states.includes(fact.id))
      expect(stating).toHaveLength(1)
      expect(inTrap.has(fact.id)).toBe(false)
      expect(inChain.has(fact.id)).toBe(false)
    }
  })

  test("AC7 — simple: undecided questions are at most a quarter of the simple questions of a split", () => {
    for (const split of SPLITS) {
      const simple = ofCategory("simple").filter((q) => q.split === split)
      const undecided = simple.filter((q) => q.expected.kind === "undecided")
      expect(undecided.length * 4).toBeLessThanOrEqual(simple.length)
    }
  })
})

describe("AC8 — no leak", () => {
  test("AC8 — no question text contains one of its expected or stale values", () => {
    for (const q of questionSet().questions) {
      const text = q.question.toLowerCase()
      const values =
        q.expected.kind === "value" || q.expected.kind === "conflict"
          ? q.expected.values
          : []
      for (const value of [...values, ...q.stale]) {
        expect({ id: q.id, leaks: text.includes(value.toLowerCase()) }).toEqual(
          { id: q.id, leaks: false }
        )
      }
    }
  })
})
