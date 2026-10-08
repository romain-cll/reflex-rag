import {
  COMPANY_UNDECIDED,
  COMPONENTS,
  PROJECT_UNDECIDED,
} from "../corpus/generator/pools.ts"
import { createRandom, type Random } from "../corpus/generator/random.ts"
import type { Fact, NoteSpec, World } from "../corpus/generator/schema.ts"
import { longDate } from "../corpus/generator/world.ts"
import {
  CATEGORIES,
  SPLITS,
  type Category,
  type Question,
  type QuestionSet,
  type Split,
} from "./schema.ts"
import {
  CONTRADICTION,
  MULTI_HOP,
  NO_ANSWER,
  SIMPLE,
  TEMPORAL,
  UNDECIDED,
  fill,
  type Vars,
} from "./templates.ts"

/** Per split. */
const COUNTS: Record<Category, number> = {
  simple: 12,
  multi_hop: 15,
  temporal: 12,
  contradiction: 9,
  no_answer: 12,
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type Chain = World["chains"][number]

/** A question before it gets its split and its id. */
type Candidate = Omit<Question, "id" | "split">

interface Index {
  world: World
  facts: Map<string, Fact>
  notes: Map<string, NoteSpec>
  /** The notes stating each fact. */
  statedBy: Map<string, NoteSpec[]>
}

function indexWorld(world: World): Index {
  const notes = new Map(world.notes.map((note) => [note.id, note]))
  const statedBy = new Map<string, NoteSpec[]>()
  for (const note of world.notes) {
    for (const id of note.states) {
      statedBy.set(id, [...(statedBy.get(id) ?? []), note])
    }
  }
  return {
    world,
    facts: new Map(world.facts.map((fact) => [fact.id, fact])),
    notes,
    statedBy,
  }
}

function lookup<T>(items: Map<string, T>, id: string): T {
  const item = items.get(id)
  if (item === undefined) throw new Error(`Unknown id ${id} in the world`)
  return item
}

function paths(ix: Index, ids: string[]): string[] {
  return ids.map((id) => lookup(ix.notes, id).path)
}

/** The names the subject of a fact stands for, to fill a template. */
function subjectVars(world: World, subject: string): Vars {
  const project = world.projects.find((p) => p.id === subject)
  const customer = world.customers.find((c) => c.id === subject)
  const supplier = world.suppliers.find((s) => s.id === subject)
  const person = world.people.find((p) => p.id === subject)
  return {
    ...(project && { codename: project.codename }),
    ...(customer && { customer: customer.name }),
    ...(supplier && { supplier: supplier.name }),
    ...(person && { person: person.name }),
    ...(subject.startsWith("line:") && { line: subject.slice(5) }),
  }
}

/** The template key of an attribute: `pcb assembly price:supplier-0007` is a component price. */
function attributeKey(attribute: string): string {
  const base = attribute.split(":")[0] ?? attribute
  return COMPONENTS.some((c) => base === `${c.category} price`)
    ? "component_price"
    : base
}

function factVars(world: World, fact: Fact): Vars {
  // Tooling and component facts carry the id of their supplier or, for an
  // open question, its anchor.
  const qualifier = fact.attribute.split(":")[1] ?? ""
  const component = COMPONENTS.find((c) =>
    fact.attribute.startsWith(`${c.category} price`)
  )
  const open = [...PROJECT_UNDECIDED, ...COMPANY_UNDECIDED].find(
    (o) => o.anchor === fact.anchors[0]
  )
  return {
    ...subjectVars(world, fact.subject),
    ...subjectVars(world, qualifier),
    ...(component && { unit: component.unit, label: component.label }),
    ...(open && { phrase: open.phrase }),
  }
}

/** Company questions have no entity id: the topic stands for it. */
function entityOf(subject: string, topic: string): string {
  return subject === "company" ? `company:${topic}` : subject
}

function answer(fact: Fact): string {
  const first = fact.anchors[0]
  if (first === undefined) throw new Error(`Fact ${fact.id} has no anchor`)
  return first
}

/** The answer of a fact; a date in both its long and its ISO form. */
function answerForms(fact: Fact): string[] {
  return ISO_DATE.test(fact.value)
    ? [longDate(fact.value), fact.value]
    : [answer(fact)]
}

/** The facts superseded by `id`, directly or not. */
function superseded(world: World, id: string): Fact[] {
  return world.facts
    .filter((fact) => fact.supersededBy === id)
    .flatMap((fact) => [fact, ...superseded(world, fact.id)])
}

function simpleQuestions(ix: Index): Candidate[] {
  const { facts, traps, chains } = ix.world
  const inTrap = new Set(traps.flatMap((trap) => trap.facts))
  const inChain = new Set(chains.map((chain) => chain.answer))

  const values = facts.flatMap((fact): Candidate[] => {
    const template = SIMPLE[attributeKey(fact.attribute)]
    const notes = ix.statedBy.get(fact.id) ?? []
    if (!template || notes.length !== 1) return []
    if (inTrap.has(fact.id) || inChain.has(fact.id)) return []
    return [
      {
        category: "simple",
        question: fill(template, factVars(ix.world, fact)),
        expected: { kind: "value", values: answerForms(fact) },
        stale: [],
        sources: notes.map((note) => note.path),
        entity: fact.subject,
        refs: [fact.id],
      },
    ]
  })

  const undecided = traps
    .filter((trap) => trap.kind === "undecided")
    .map((trap): Candidate => {
      const fact = lookup(ix.facts, trap.facts[0] ?? "")
      const company = fact.subject === "company"
      return {
        category: "simple",
        question: fill(
          company ? UNDECIDED.company : UNDECIDED.project,
          factVars(ix.world, fact)
        ),
        expected: { kind: "undecided" },
        stale: [],
        sources: paths(ix, trap.truthNotes),
        entity: entityOf(fact.subject, answer(fact)),
        refs: [trap.id],
      }
    })

  return [...values, ...undecided]
}

/** The value of the first superseded fact of a subject and attribute. */
function supersededValue(
  world: World,
  subject: string | undefined,
  attribute: string
): string | undefined {
  return world.facts.find(
    (fact) =>
      fact.subject === subject &&
      fact.attribute === attribute &&
      fact.supersededBy !== null
  )?.value
}

/**
 * The anchors of the answer the outdated path of a chain leads to, or none
 * when the chain does not go through a superseded fact:
 * - a supplier chain through a tooling sign-off ends at the decoy enclosure
 *   vendor, the one of the superseded `enclosure_vendor` fact of the project;
 * - an account-owner chain ends at the office of the former account owner.
 */
function outdatedAnswer(ix: Index, chain: Chain): string[] {
  const { world } = ix
  const [first, second] = chain.notes.map((id) => lookup(ix.notes, id))
  const answerFact = lookup(ix.facts, chain.answer)
  const current = (subject: string | undefined, attribute: string) =>
    world.facts
      .filter(
        (fact) =>
          fact.subject === subject &&
          fact.attribute === attribute &&
          fact.supersededBy === null
      )
      .flatMap((fact) => fact.anchors)

  if (
    second?.title.endsWith("tooling sign-off") &&
    answerFact.subject.startsWith("supplier-")
  ) {
    const project = world.projects.find(
      (p) => p.codename === second.frontmatter.project
    )
    const vendor = supersededValue(world, project?.id, "enclosure_vendor")
    const supplier = world.suppliers.find((s) => s.name === vendor)
    return current(supplier?.id, answerFact.attribute)
  }
  if (
    answerFact.attribute === "office" &&
    first?.title.endsWith("quarterly review")
  ) {
    const customer = world.customers.find(
      (c) => c.name === first.frontmatter.customer
    )
    const owner = supersededValue(world, customer?.id, "account_owner")
    const person = world.people.find((p) => p.name === owner)
    return current(person?.id, "office")
  }
  return []
}

function multiHopQuestions(ix: Index): Candidate[] {
  const { chains, projects, customers } = ix.world
  return chains.flatMap((chain): Candidate[] => {
    const first = lookup(ix.notes, chain.notes[0] ?? "")
    const found = MULTI_HOP.find(([suffix]) => first.title.endsWith(suffix))
    const project = projects.find(
      (p) => p.codename === first.frontmatter.project
    )
    const customer = customers.find(
      (c) => c.name === first.frontmatter.customer
    )
    const entity = project?.id ?? customer?.id
    if (!found || entity === undefined) return []
    return [
      {
        category: "multi_hop",
        question: fill(found[1], {
          ...(project && { codename: project.codename }),
          ...(customer && { customer: customer.name }),
        }),
        expected: {
          kind: "value",
          values: answerForms(lookup(ix.facts, chain.answer)),
        },
        stale: outdatedAnswer(ix, chain),
        // The entry note is one way in, not a note the answer needs.
        sources: paths(ix, chain.notes.slice(1)),
        entity,
        refs: [chain.id],
      },
    ]
  })
}

function temporalQuestions(ix: Index): Candidate[] {
  return ix.world.facts.flatMap((latest): Candidate[] => {
    const template = TEMPORAL[attributeKey(latest.attribute)]
    const older = superseded(ix.world, latest.id)
    if (!template || latest.supersededBy !== null || older.length === 0) {
      return []
    }
    return [
      {
        category: "temporal",
        question: fill(template, factVars(ix.world, latest)),
        expected: { kind: "value", values: answerForms(latest) },
        stale: older.flatMap((fact) => fact.anchors),
        sources: (ix.statedBy.get(latest.id) ?? []).map((note) => note.path),
        entity: latest.subject,
        refs: [latest.id],
      },
    ]
  })
}

function contradictionQuestions(ix: Index): Candidate[] {
  return ix.world.traps.flatMap((trap): Candidate[] => {
    if (trap.kind !== "contradiction" && trap.kind !== "divergent_duplicate") {
      return []
    }
    const [one, other] = trap.facts.map((id) => lookup(ix.facts, id))
    const template = one && CONTRADICTION[attributeKey(one.attribute)]
    if (!one || !other || !template) return []
    return [
      {
        category: "contradiction",
        question: fill(template, factVars(ix.world, one)),
        expected: { kind: "conflict", values: [answer(one), answer(other)] },
        stale: [],
        sources: paths(ix, trap.truthNotes),
        entity: one.subject,
        refs: [trap.id],
      },
    ]
  })
}

function noAnswerQuestions(ix: Index): Candidate[] {
  return ix.world.absent.flatMap((absent): Candidate[] => {
    const found = NO_ANSWER.find(([topic]) => absent.topic.endsWith(topic))
    if (!found) return []
    return [
      {
        category: "no_answer",
        question: fill(found[1], subjectVars(ix.world, absent.subject)),
        expected: { kind: "abstain" },
        stale: [],
        sources: [],
        entity: entityOf(absent.subject, found[0]),
        refs: [absent.id],
      },
    ]
  })
}

/** Whether the wording gives away an expected or a stale value. */
function leaks(candidate: Candidate): boolean {
  const { expected, stale, question } = candidate
  const values = "values" in expected ? [...expected.values, ...stale] : stale
  return values.some((value) =>
    question.toLowerCase().includes(value.toLowerCase())
  )
}

/** Whether following the outdated path would give the right answer. */
function overlaps(candidate: Candidate): boolean {
  const { expected, stale } = candidate
  if (!("values" in expected)) return false
  const wrong = stale.map((value) => value.toLowerCase())
  return expected.values.some((value) => wrong.includes(value.toLowerCase()))
}

const COLLECTORS: Record<Category, (ix: Index) => Candidate[]> = {
  simple: simpleQuestions,
  multi_hop: multiHopQuestions,
  temporal: temporalQuestions,
  contradiction: contradictionQuestions,
  no_answer: noAnswerQuestions,
}

/**
 * Entities of a kind (project, customer, ...) go to the splits in turn, in
 * id order, so that a question never shares its entity with the other split.
 */
function assignSplits(entities: string[]): Map<string, Split> {
  const byKind = new Map<string, string[]>()
  for (const entity of [...new Set(entities)].sort()) {
    const kind = entity.split(/[-:]/)[0] ?? entity
    byKind.set(kind, [...(byKind.get(kind) ?? []), entity])
  }
  const splits = new Map<string, Split>()
  for (const group of byKind.values()) {
    group.forEach((entity, i) => {
      splits.set(entity, i % 2 === 0 ? "tuning" : "test")
    })
  }
  return splits
}

function select(
  category: Category,
  split: Split,
  pool: Candidate[],
  rng: Random
): Candidate[] {
  const count = COUNTS[category]
  let chosen = rng.shuffle(pool)
  if (category === "simple") {
    // At most a quarter of the simple questions ask about a missing decision.
    const undecided = chosen
      .filter((q) => q.expected.kind === "undecided")
      .slice(0, Math.floor(count / 4))
    chosen = chosen.filter(
      (q) => q.expected.kind !== "undecided" || undecided.includes(q)
    )
  }
  if (chosen.length < count) {
    throw new Error(
      `Cannot build ${count} ${category} questions for the ${split} split: only ${chosen.length} candidates`
    )
  }
  return chosen.slice(0, count)
}

export function buildQuestions(world: World): QuestionSet {
  const ix = indexWorld(world)
  const rng = createRandom(world.meta.seed)
  const candidates = CATEGORIES.map((category) =>
    COLLECTORS[category](ix).filter((q) => !leaks(q) && !overlaps(q))
  )
  const splitOf = assignSplits(candidates.flat().map((q) => q.entity))

  const questions = SPLITS.flatMap((split) =>
    CATEGORIES.flatMap((category, i) => {
      const pool = (candidates[i] ?? []).filter(
        (q) => splitOf.get(q.entity) === split
      )
      return select(category, split, pool, rng).map((q) => ({ ...q, split }))
    })
  ).map((q, i) => ({ ...q, id: `q-${String(i + 1).padStart(3, "0")}` }))

  return {
    world: { seed: world.meta.seed, scale: world.meta.scale },
    questions,
  }
}
