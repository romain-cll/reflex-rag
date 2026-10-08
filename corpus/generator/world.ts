import * as pools from "./pools.ts"
import type { StaffKey } from "./pools.ts"
import { createRandom } from "./random.ts"
import type { Random } from "./random.ts"
import type {
  Customer,
  Fact,
  NoteSpec,
  NoteType,
  Person,
  Project,
  Supplier,
  TrapKind,
  World,
} from "./schema.ts"

/** Minimum counts per category, sized for two question sets (tuning + test). */
export const DEFAULT_QUOTAS = {
  chains: 30,
  superseded: 24,
  contradictions: 18,
  absent: 24,
  undecided: 6,
}

export type Quotas = typeof DEFAULT_QUOTAS

export interface GenerateOptions {
  seed: number
  scale: number
  quotas?: Partial<Quotas>
}

const COMPANY = "Larkspur Devices, Inc."
const START = "2025-01-06"
const TODAY = "2026-09-30"

const WORDS: Record<NoteType, [number, number]> = {
  project: [150, 300],
  meeting: [180, 400],
  spec: [300, 600],
  quote: [120, 250],
  decision: [120, 250],
  customer: [150, 300],
  supplier: [100, 200],
  person: [80, 180],
  journal: [80, 200],
}

// Dates are ISO strings (YYYY-MM-DD) computed in UTC.

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

export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

export function longDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`
}

function usd(amount: number): string {
  return `$${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length]
  if (item === undefined) throw new Error("index into an empty list")
  return item
}

/** The role held on `date`; on the day of a change, the new one. */
export function roleAt(person: Person, date: string) {
  const role =
    person.roles.findLast(
      (r) => r.from <= date && (r.to === null || date <= r.to)
    ) ?? person.roles[0]
  if (!role) throw new Error(`${person.name} has no role`)
  return role
}

interface NoteInput {
  folder: string
  title: string
  type: NoteType
  date: string
  author: Person
  frontmatter: Record<string, string | string[]>
  context: string
  states?: Fact[]
  links?: { to: NoteSpec; intent: string }[]
  forbiddenTerms?: string[]
}

class Builder {
  readonly people: Person[] = []
  readonly customers: Customer[] = []
  readonly suppliers: Supplier[] = []
  readonly projects: Project[] = []
  readonly facts: Fact[] = []
  readonly notes: NoteSpec[] = []
  readonly traps: World["traps"] = []
  readonly chains: World["chains"] = []
  readonly absent: World["absent"] = []
  private readonly counters = new Map<string, number>()
  private readonly titles = new Set<string>()
  private readonly names = new Set<string>()
  private readonly firstNames = new Set<string>()
  private readonly lastNames = new Set<string>()

  constructor(readonly rng: Random) {}

  nextId(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, n)
    return `${prefix}-${String(n).padStart(4, "0")}`
  }

  /**
   * A full name used by nobody else in the world, employee or contact. First
   * and last names are not reused either while the pools last, so that no two
   * people are easy to confuse.
   */
  personName(): string {
    for (let attempt = 0; ; attempt++) {
      const first = this.rng.pick(pools.FIRST_NAMES)
      const last = this.rng.pick(pools.LAST_NAMES)
      const name = `${first} ${last}`
      const fresh = !this.firstNames.has(first) && !this.lastNames.has(last)
      if (!this.names.has(name) && (fresh || attempt > 200)) {
        this.names.add(name)
        this.firstNames.add(first)
        this.lastNames.add(last)
        return name
      }
    }
  }

  fact(input: Omit<Fact, "id" | "validTo" | "supersededBy">): Fact {
    const fact: Fact = {
      id: this.nextId("fact"),
      ...input,
      validTo: null,
      supersededBy: null,
    }
    this.facts.push(fact)
    return fact
  }

  supersede(older: Fact, newer: Fact): void {
    older.validTo = newer.validFrom
    older.supersededBy = newer.id
  }

  note(input: NoteInput): NoteSpec {
    const title = this.uniqueTitle(input.title)
    const note: NoteSpec = {
      id: this.nextId("note"),
      path: `${input.folder}/${title}.md`,
      type: input.type,
      title,
      date: input.date,
      author: input.author.id,
      frontmatter: input.frontmatter,
      context: input.context,
      states: (input.states ?? []).map((fact) => fact.id),
      links: (input.links ?? []).map((link) => ({
        target: link.to.id,
        intent: link.intent,
      })),
      forbiddenTerms: input.forbiddenTerms ?? [],
      words: WORDS[input.type],
    }
    this.notes.push(note)
    return note
  }

  link(from: NoteSpec, to: NoteSpec, intent: string): void {
    from.links.push({ target: to.id, intent })
  }

  trap(
    kind: TrapKind,
    facts: Fact[],
    truth: NoteSpec[],
    decoys: NoteSpec[]
  ): void {
    this.traps.push({
      id: this.nextId("trap"),
      kind,
      facts: facts.map((fact) => fact.id),
      truthNotes: truth.map((note) => note.id),
      decoyNotes: decoys.map((note) => note.id),
    })
  }

  chain(notes: NoteSpec[], answer: Fact): void {
    this.chains.push({
      id: this.nextId("chain"),
      notes: notes.map((note) => note.id),
      answer: answer.id,
    })
  }

  absentTopic(subject: string, topic: string, terms: string[]): void {
    this.absent.push({
      id: this.nextId("absent"),
      subject,
      topic,
      forbiddenTerms: terms,
    })
  }

  private uniqueTitle(title: string): string {
    let candidate = title
    for (let n = 2; this.titles.has(candidate.toLowerCase()); n++) {
      candidate = `${title} (${n})`
    }
    this.titles.add(candidate.toLowerCase())
    return candidate
  }
}

interface Staff {
  ceo: Person
  coo: Person
  vpSales: Person
  procurementHead: Person
  successHead: Person
  byKey: Record<StaffKey, Person[]>
  journalists: Person[]
  personNotes: Map<string, NoteSpec>
  offices: Map<string, Fact>
  allHands: { date: string; promoted: Person[] }[]
}

/** Hands out journal entries to the journalists in turn, never to `not`. */
class JournalDesk {
  private turn = 0

  constructor(
    private readonly b: Builder,
    private readonly journalists: Person[]
  ) {}

  write(
    date: string,
    states: Fact[],
    links: { to: NoteSpec; intent: string }[],
    context: string,
    project?: string,
    not?: Person
  ): NoteSpec {
    let author = at(this.journalists, this.turn++)
    if (author === not) author = at(this.journalists, this.turn++)
    const frontmatter: Record<string, string> = {
      type: "journal",
      date,
      author: author.name,
    }
    if (project) frontmatter.project = project
    return this.b.note({
      folder: `Journal/${author.name}`,
      title: `${date} ${author.name} journal`,
      type: "journal",
      date,
      author,
      frontmatter,
      context,
      states,
      links,
    })
  }
}

export function generateWorld(options: GenerateOptions): World {
  const { seed, scale } = options
  const b = new Builder(createRandom(seed))

  const staff = hireStaff(b, scale)
  const desk = new JournalDesk(b, staff.journalists)
  const suppliers = buildSuppliers(b, staff, scale)
  const customerNotes = buildCustomers(b, staff, scale)
  for (let i = 0; i < 6 * scale; i++) {
    buildProject(b, staff, desk, suppliers, customerNotes, i, scale)
  }
  buildCompany(b, staff, desk, scale)

  const world: World = {
    meta: { seed, scale, company: COMPANY, start: START, today: TODAY },
    people: b.people,
    customers: b.customers,
    suppliers: b.suppliers,
    projects: b.projects,
    facts: b.facts,
    notes: b.notes,
    traps: b.traps,
    chains: b.chains,
    absent: b.absent,
  }
  checkQuotas(world, options.quotas)
  return world
}

function checkQuotas(world: World, overrides: Partial<Quotas> = {}): void {
  const count = (kinds: TrapKind[]) =>
    world.traps.filter((trap) => kinds.includes(trap.kind)).length
  const actual: Quotas = {
    chains: world.chains.length,
    superseded: world.facts.filter((fact) => fact.supersededBy !== null).length,
    contradictions: count(["contradiction", "divergent_duplicate"]),
    absent: world.absent.length,
    undecided: count(["undecided"]),
  }
  for (const key of Object.keys(DEFAULT_QUOTAS) as (keyof Quotas)[]) {
    const minimum = overrides[key] ?? DEFAULT_QUOTAS[key]
    if (actual[key] < minimum) {
      throw new Error(`Quota "${key}" not met: ${actual[key]} < ${minimum}`)
    }
  }
}

// People: executives, staff, promotions announced at all-hands meetings,
// and one profile note each (stale for the people promoted later).

function hireStaff(b: Builder, scale: number): Staff {
  const hire = (title: string, team: string): Person => {
    const person: Person = {
      id: b.nextId("person"),
      name: b.personName(),
      roles: [{ title, team, from: START, to: null }],
    }
    b.people.push(person)
    return person
  }

  const [ceo, coo, , vpSales, procurementHead, successHead] =
    pools.EXECUTIVES.map((role) => hire(role.title, role.team))
  if (!ceo || !coo || !vpSales || !procurementHead || !successHead) {
    throw new Error("missing executive")
  }

  const byKey = {} as Record<StaffKey, Person[]>
  for (const key of Object.keys(pools.STAFF) as StaffKey[]) {
    const role = pools.STAFF[key]
    byKey[key] = Array.from({ length: role.count * scale }, () =>
      hire(role.title, role.team)
    )
  }

  const meetings = 3 * scale
  const step = Math.floor(daysBetween(addDays(START, 100), TODAY) / meetings)
  const allHands = Array.from({ length: meetings }, (_, i) => ({
    date: addDays(START, 100 + i * step + b.rng.int(0, Math.floor(step / 3))),
    promoted: [] as Person[],
  }))

  const promotedAt = new Map<string, string>()
  for (let k = 0; k < 5 * scale; k++) {
    const promotion = at(pools.PROMOTIONS, k)
    const person = at(byKey[promotion.from], Math.floor(k / 5))
    const meeting = at(allHands, k)
    const current = at(person.roles, 0)
    current.to = meeting.date
    person.roles.push({
      title: promotion.title,
      team: promotion.team,
      from: meeting.date,
      to: null,
    })
    promotedAt.set(person.id, meeting.date)
    meeting.promoted.push(person)
  }

  const personNotes = new Map<string, NoteSpec>()
  const offices = new Map<string, Fact>()
  for (const person of b.people) {
    const promotion = promotedAt.get(person.id)
    const latest = promotion
      ? daysBetween(START, promotion) - 10
      : Math.min(200, daysBetween(START, TODAY))
    const date = addDays(START, b.rng.int(5, Math.max(5, latest)))
    const role = roleAt(person, date)
    const office = b.rng.pick(pools.OFFICES)
    const roleFact = b.fact({
      subject: person.id,
      attribute: "role",
      value: role.title,
      statement:
        role.team === "Executive"
          ? `${person.name} is the ${role.title}.`
          : `${person.name} works as ${role.title} on the ${role.team} team.`,
      anchors: [role.title],
      validFrom: START,
    })
    const officeFact = b.fact({
      subject: person.id,
      attribute: "office",
      value: office,
      statement: `${person.name} works out of the ${office} office.`,
      anchors: [office],
      validFrom: START,
    })
    offices.set(person.id, officeFact)
    personNotes.set(
      person.id,
      b.note({
        folder: "People",
        title: person.name,
        type: "person",
        date,
        author: person,
        frontmatter: {
          type: "person",
          role: role.title,
          team: role.team,
          office,
        },
        context: promotion
          ? `Profile page ${person.name} wrote early on and never updated since: it still gives the old role.`
          : `Short profile page: role, team and office.`,
        states: [roleFact, officeFact],
      })
    )
  }

  const journalists = [
    ...byKey.me,
    ...byKey.ee,
    ...byKey.pm,
    ...byKey.fw,
  ].slice(0, 4 * scale)

  return {
    ceo,
    coo,
    vpSales,
    procurementHead,
    successHead,
    byKey,
    journalists,
    personNotes,
    offices,
    allHands,
  }
}

function personNote(staff: Staff, person: Person): NoteSpec {
  const note = staff.personNotes.get(person.id)
  if (!note) throw new Error(`no profile for ${person.name}`)
  return note
}

// Suppliers: one note each with its city and Larkspur's contact there.

interface SupplierEntry {
  supplier: Supplier
  note: NoteSpec
  city: Fact
  contact: Fact
}

function buildSuppliers(
  b: Builder,
  staff: Staff,
  scale: number
): SupplierEntry[] {
  const prefixes = b.rng.shuffle(pools.SUPPLIER_PREFIXES)
  const entries: SupplierEntry[] = []
  for (const category of pools.SUPPLIER_CATEGORIES) {
    for (let i = 0; i < category.perScale * scale; i++) {
      const name = `${at(prefixes, entries.length)} ${b.rng.pick(category.suffixes)}`
      const city = b.rng.pick(
        category.overseas ? pools.OVERSEAS_CITIES : pools.LAB_CITIES
      )
      const supplier: Supplier = {
        id: b.nextId("supplier"),
        name,
        category: category.category,
        city,
      }
      b.suppliers.push(supplier)
      const date = addDays(START, b.rng.int(0, 20))
      const contactName = b.personName()
      const cityFact = b.fact({
        subject: supplier.id,
        attribute: "city",
        value: city,
        statement: `${name}, a ${category.label} supplier, is based in ${city}.`,
        anchors: [city],
        validFrom: date,
      })
      const contact = b.fact({
        subject: supplier.id,
        attribute: "account_contact",
        value: contactName,
        statement: `${contactName} is Larkspur's account contact at ${name}.`,
        anchors: [contactName],
        validFrom: date,
      })
      const note = b.note({
        folder: "Suppliers",
        title: name,
        type: "supplier",
        date,
        author: staff.procurementHead,
        frontmatter: { type: "supplier", category: category.category, city },
        context: `Supplier page kept by procurement: who ${name} is, where it is based and who to call there.`,
        states: [cityFact, contact],
      })
      entries.push({ supplier, note, city: cityFact, contact })
    }
  }
  const half = Math.ceil(entries.length / 2)
  entries.slice(0, half).forEach((entry, i) => {
    const topic = at(pools.ABSENT_TOPICS.supplier, i)
    b.absentTopic(
      entry.supplier.id,
      `${entry.supplier.name} ${topic.topic}`,
      topic.terms
    )
  })
  return entries
}

// Customers: an account page that goes stale after a handoff, the handoff
// meeting, and a quarterly review that often contradicts the contract value.

interface CustomerEntry {
  customer: Customer
  note: NoteSpec
  contact: Fact
}

function buildCustomers(
  b: Builder,
  staff: Staff,
  scale: number
): CustomerEntry[] {
  const entries: CustomerEntry[] = []
  const used = new Set<string>()
  const prefixes = b.rng.shuffle(pools.CUSTOMER_PREFIXES)
  const accountExecs = staff.byKey.ae

  for (let i = 0; i < 12 * scale; i++) {
    const segment = at(pools.CUSTOMER_SEGMENTS, i)
    let name = ""
    for (let k = 0; name === "" || used.has(name); k++) {
      name = `${at(prefixes, i + k)} ${b.rng.pick(segment.suffixes)}`
    }
    used.add(name)
    const city = b.rng.pick(pools.CUSTOMER_CITIES)
    const customer: Customer = {
      id: b.nextId("customer"),
      name,
      segment: segment.segment,
      city,
    }
    b.customers.push(customer)

    const first = at(accountExecs, i)
    const second = at(
      accountExecs,
      i + 1 + b.rng.int(0, accountExecs.length - 2)
    )
    const opened = addDays(START, b.rng.int(20, 300))
    const handoff = addDays(opened, b.rng.int(90, 150))
    const review = addDays(handoff, b.rng.int(30, 80))
    const contactName = b.personName()
    const contactTitle = b.rng.pick(pools.CONTACT_TITLES)
    const value = b.rng.int(24, 180) * 1000

    const segmentFact = b.fact({
      subject: customer.id,
      attribute: "segment",
      value: segment.segment,
      statement: `${name} is a ${segment.segment} customer based in ${city}.`,
      anchors: [city],
      validFrom: opened,
    })
    const contact = b.fact({
      subject: customer.id,
      attribute: "facilities_contact",
      value: contactName,
      statement: `${contactName}, ${contactTitle}, is the main contact at ${name}.`,
      anchors: [contactName],
      validFrom: opened,
    })
    const owner = b.fact({
      subject: customer.id,
      attribute: "account_owner",
      value: first.name,
      statement: `${first.name} owns the ${name} account.`,
      anchors: [first.name],
      validFrom: opened,
    })
    const newOwner = b.fact({
      subject: customer.id,
      attribute: "account_owner",
      value: second.name,
      statement: `${second.name} took over the ${name} account from ${first.name}.`,
      anchors: [second.name],
      validFrom: handoff,
    })
    b.supersede(owner, newOwner)
    const contract = b.fact({
      subject: customer.id,
      attribute: "annual_contract_value",
      value: usd(value),
      statement: `${name} has an annual contract worth ${usd(value)}.`,
      anchors: [usd(value)],
      validFrom: opened,
    })

    const note = b.note({
      folder: "Customers",
      title: name,
      type: "customer",
      date: opened,
      author: first,
      frontmatter: {
        type: "customer",
        segment: segment.segment,
        city,
        account_owner: first.name,
      },
      context: `Account page written when the deal closed. It still names ${first.name} as the account owner: nobody updated it after the handoff.`,
      states: [segmentFact, contact, owner, contract],
      links: [
        {
          to: personNote(staff, first),
          intent: `${first.name} owns the relationship`,
        },
      ],
    })
    const handoffNote = b.note({
      folder: "Meetings",
      title: `${handoff} ${name} account handoff`,
      type: "meeting",
      date: handoff,
      author: second,
      frontmatter: {
        type: "meeting",
        date: handoff,
        customer: name,
        attendees: [first.name, second.name],
      },
      context: `Handoff meeting: ${first.name} passes the ${name} account to ${second.name}.`,
      states: [newOwner],
      links: [
        { to: note, intent: "the account page has the background" },
        {
          to: personNote(staff, second),
          intent: `${second.name} is the new account owner`,
        },
      ],
    })

    const contradicts = i % 3 !== 2
    const reviewFact = contradicts
      ? b.fact({
          subject: customer.id,
          attribute: "annual_contract_value",
          value: usd(value + b.rng.int(5, 40) * 1000),
          statement: "",
          anchors: [],
          validFrom: review,
        })
      : b.fact({
          subject: customer.id,
          attribute: "sensors_deployed",
          value: String(b.rng.int(40, 400)),
          statement: "",
          anchors: [],
          validFrom: review,
        })
    if (contradicts) {
      reviewFact.statement = `The annual contract with ${name} is worth ${reviewFact.value}.`
      reviewFact.anchors = [reviewFact.value]
    } else {
      const sensors = `${reviewFact.value} Larkspur sensors`
      reviewFact.statement = `${name} has ${sensors} deployed.`
      reviewFact.anchors = [sensors]
    }
    const reviewNote = b.note({
      folder: "Meetings",
      title: `${review} ${name} quarterly review`,
      type: "meeting",
      date: review,
      author: second,
      frontmatter: {
        type: "meeting",
        date: review,
        customer: name,
        attendees: [second.name, contactName],
      },
      context: contradicts
        ? `Quarterly business review with ${name}. The contract value comes from finance and is given as a plain figure, without mentioning any change.`
        : `Quarterly business review with ${name}: deployment status and next steps.`,
      states: [reviewFact],
      links: [
        {
          to: handoffNote,
          intent: `${second.name} has run the account since the handoff`,
        },
        { to: note, intent: "account background" },
      ],
    })

    b.trap("stale_note", [owner, newOwner], [handoffNote], [note])
    if (contradicts) {
      b.trap("contradiction", [contract, reviewFact], [note, reviewNote], [])
    }
    b.chain(
      [reviewNote, handoffNote, personNote(staff, second)],
      office(staff, second)
    )
    const topic = at(pools.ABSENT_TOPICS.customer, i)
    b.absentTopic(customer.id, `${name} ${topic.topic}`, topic.terms)
    entries.push({ customer, note, contact })
  }
  return entries
}

function office(staff: Staff, person: Person): Fact {
  const fact = staff.offices.get(person.id)
  if (!fact) throw new Error(`no office for ${person.name}`)
  return fact
}

// Projects: the full lifecycle of a product, with most of the traps.

function buildProject(
  b: Builder,
  staff: Staff,
  desk: JournalDesk,
  suppliers: SupplierEntry[],
  customers: CustomerEntry[],
  i: number,
  scale: number
): void {
  const { rng } = b
  const count = 6 * scale
  const lastStart = addDays(TODAY, -200)
  const step = Math.floor(daysBetween(START, lastStart) / count)
  const d0 = addDays(START, i * step + rng.int(0, Math.floor(step / 3)))
  const day = (offset: number) => addDays(d0, offset)

  const codename = at(pools.CODENAMES, i)
  const line = at(pools.PRODUCT_LINES, i)
  const product = `Larkspur ${line} Gen ${2 + Math.floor(i / pools.PRODUCT_LINES.length)}`
  const goal = rng.pick(pools.PROJECT_GOALS)
  const pm = at(staff.byKey.pm, i)
  const me = at(staff.byKey.me, i)
  const ee = at(staff.byKey.ee, i)
  const fw = at(staff.byKey.fw, i)
  const buyer = at(staff.byKey.procurement, i)
  const qe = at(staff.byKey.qe, i)
  const team = [pm, me, ee, fw, buyer].map((person) => person.name)

  const project: Project = {
    id: b.nextId("project"),
    codename,
    product,
    goal: goal.goal,
    owner: pm.id,
    start: d0,
  }
  b.projects.push(project)
  const subject = project.id

  const enclosures = rng.shuffle(
    suppliers.filter((s) => s.supplier.category === "enclosure")
  )
  const vendorA = at(enclosures, 0)
  const vendorB = at(enclosures, 1)
  const component = at(pools.COMPONENTS, i)
  const componentVendor = rng.pick(
    suppliers.filter((s) => s.supplier.category === component.category)
  )
  const lab = at(
    suppliers.filter((s) => s.supplier.category === "certification lab"),
    i
  )
  const pilotCustomer = at(customers, i)
  const A = vendorA.supplier.name
  const B = vendorB.supplier.name

  // Facts
  const goalFact = b.fact({
    subject,
    attribute: "goal",
    value: goal.goal,
    statement: `${codename} is the project to build ${goal.goal}, sold as the ${product}.`,
    anchors: [goal.anchor, product],
    validFrom: d0,
  })
  const ownerFact = b.fact({
    subject,
    attribute: "owner",
    value: pm.name,
    statement: `${pm.name} is the product owner of ${codename}.`,
    anchors: [pm.name],
    validFrom: d0,
  })
  const launch = day(300 + rng.int(0, 30))
  const launchFact = b.fact({
    subject,
    attribute: "launch_date",
    value: launch,
    statement: `${codename} is scheduled to launch on ${longDate(launch)}.`,
    anchors: [longDate(launch)],
    validFrom: d0,
  })
  const months = rng.pick([12, 18, 24, 36])
  const copyMonths = months === 36 ? 24 : months + 6
  const battery = (value: number, from: string) =>
    b.fact({
      subject,
      attribute: "battery_life_requirement",
      value: `${value} months`,
      statement: `The ${codename} requirements call for a battery life of ${value} months.`,
      anchors: [`${value} months`],
      validFrom: from,
    })
  const batteryFact = battery(months, day(10))
  const copyBatteryFact = battery(copyMonths, day(12))
  const cost = rng.int(28, 95)
  const costFact = b.fact({
    subject,
    attribute: "unit_cost_target",
    value: usd(cost),
    statement: `The target unit cost for ${codename} is ${usd(cost)}.`,
    anchors: [usd(cost)],
    validFrom: day(10),
  })

  const tooling = (vendor: SupplierEntry, from: string) => {
    const price = rng.int(36, 70) * 1000 + rng.int(0, 9) * 100
    const weeks = rng.int(6, 14)
    const name = vendor.supplier.name
    return [
      b.fact({
        subject,
        attribute: `enclosure_tooling_price:${vendor.supplier.id}`,
        value: usd(price),
        statement: `${name} quoted ${usd(price)} for the ${codename} enclosure tooling.`,
        anchors: [usd(price)],
        validFrom: from,
      }),
      b.fact({
        subject,
        attribute: `enclosure_lead_time:${vendor.supplier.id}`,
        value: `${weeks} weeks`,
        statement: `${name} needs ${weeks} weeks to deliver the ${codename} enclosure tooling.`,
        anchors: [`${weeks} weeks`],
        validFrom: from,
      }),
    ]
  }
  const toolingA = tooling(vendorA, day(25))
  const toolingB = tooling(vendorB, day(28))
  const unitPrice = (rng.int(150, 1400) / 100).toFixed(2)
  const componentFact = b.fact({
    subject,
    attribute: `${component.category} price:${componentVendor.supplier.id}`,
    value: `$${unitPrice}`,
    statement: `${componentVendor.supplier.name} quoted $${unitPrice} per ${component.unit} for the ${codename} ${component.label}.`,
    anchors: [`$${unitPrice}`],
    validFrom: day(30),
  })
  const preferred = b.fact({
    subject,
    attribute: "enclosure_vendor",
    value: A,
    statement: `The team chose to move forward with ${A} for the ${codename} enclosure.`,
    anchors: [A],
    validFrom: day(40),
  })
  const final = b.fact({
    subject,
    attribute: "enclosure_vendor",
    value: B,
    statement: `${B} received the tooling go-ahead for the ${codename} enclosure after the drop tests.`,
    anchors: [B],
    validFrom: day(75),
  })
  b.supersede(preferred, final)
  const open = at(pools.PROJECT_UNDECIDED, i)
  const undecided = b.fact({
    subject,
    attribute: `open_question:${open.anchor}`,
    value: "undecided",
    statement: `The team discussed ${open.phrase} for ${codename} but made no decision.`,
    anchors: [open.anchor],
    validFrom: day(60),
  })
  const evtUnits = rng.int(4, 12) * 5
  const evt = (units: number, from: string) =>
    b.fact({
      subject,
      attribute: "evt_units",
      value: String(units),
      statement: `The ${codename} EVT build produced ${units} units.`,
      anchors: [`${units} units`],
      validFrom: from,
    })
  const evtFact = evt(evtUnits, day(95))
  const evtJournalFact = evt(evtUnits + 5, day(97))
  const pilotUnits = rng.int(3, 12) * 10
  const pilot = b.fact({
    subject,
    attribute: "pilot",
    value: pilotCustomer.customer.name,
    statement: `${pilotCustomer.customer.name} is piloting ${codename} with ${pilotUnits} units.`,
    anchors: [pilotCustomer.customer.name, `${pilotUnits} units`],
    validFrom: day(140),
  })
  const finding = at(pools.DVT_FINDINGS, i)
  const dvt = b.fact({
    subject,
    attribute: "dvt_finding",
    value: finding.text,
    statement: `The ${codename} DVT units showed ${finding.text}.`,
    anchors: [finding.anchor],
    validFrom: day(150),
  })
  const newLaunch = addDays(launch, 70 + rng.int(0, 20))
  const slipped = b.fact({
    subject,
    attribute: "launch_date",
    value: newLaunch,
    statement: `${codename} will now launch on ${longDate(newLaunch)}.`,
    anchors: [longDate(newLaunch)],
    validFrom: day(175),
  })
  b.supersede(launchFact, slipped)
  const slipReason = b.fact({
    subject,
    attribute: "slip_reason",
    value: lab.supplier.name,
    statement: `The ${codename} launch slipped because of a certification retest at ${lab.supplier.name}.`,
    anchors: [lab.supplier.name],
    validFrom: day(175),
  })

  // Notes, in date order
  const meeting = (
    date: string,
    title: string,
    author: Person,
    attendees: string[]
  ) => ({
    folder: "Meetings",
    title: `${date} ${title}`,
    type: "meeting" as const,
    date,
    author,
    frontmatter: { type: "meeting", date, project: codename, attendees },
  })

  const kickoff = b.note({
    ...meeting(d0, `${codename} kickoff`, pm, team),
    context: `Kickoff meeting of ${codename}: goal, owner and target launch date.`,
    states: [goalFact, ownerFact, launchFact],
    links: [
      {
        to: personNote(staff, pm),
        intent: `${pm.name} owns the project`,
      },
    ],
  })
  const requirements = b.note({
    folder: "Specs",
    title: `${codename} requirements`,
    type: "spec",
    date: day(10),
    author: pm,
    frontmatter: {
      type: "spec",
      date: day(10),
      project: codename,
      owner: pm.name,
      status: "approved",
    },
    context: `Requirements document of ${codename}, with sections for power, cost and enclosure. A short "Decisions" section at the end was added later, after the enclosure vendor was settled.`,
    states: [batteryFact, costFact],
    links: [
      {
        to: kickoff,
        intent: "the requirements build on what the kickoff agreed",
      },
    ],
  })
  const copy = b.note({
    folder: "Specs",
    title: `${codename} requirements (copy)`,
    type: "spec",
    date: day(12),
    author: me,
    frontmatter: {
      type: "spec",
      date: day(12),
      project: codename,
      owner: pm.name,
      status: "draft",
    },
    context: `An old working copy of the ${codename} requirements that was never deleted. Same structure as the main requirements, but it asks for ${copyMonths} months of battery life.`,
    states: [copyBatteryFact],
    links: [{ to: kickoff, intent: "written right after the kickoff" }],
  })
  const quote = (
    vendor: SupplierEntry,
    facts: Fact[],
    date: string,
    what: string
  ) =>
    b.note({
      folder: "Quotes",
      title: `${codename} ${what} - ${vendor.supplier.name}`,
      type: "quote",
      date,
      author: buyer,
      frontmatter: {
        type: "quote",
        date,
        project: codename,
        supplier: vendor.supplier.name,
      },
      context: `Summary of the quote ${vendor.supplier.name} sent for the ${codename} ${what}.`,
      states: facts,
      links: [
        {
          to: requirements,
          intent: `answers the ${what} section of the requirements`,
        },
        { to: vendor.note, intent: "supplier details" },
      ],
    })
  const quoteA = quote(vendorA, toolingA, day(25), "enclosure")
  const quoteB = quote(vendorB, toolingB, day(28), "enclosure")
  quote(componentVendor, [componentFact], day(30), component.label)
  const review = b.note({
    ...meeting(day(40), `${codename} enclosure review`, me, [
      me.name,
      pm.name,
      buyer.name,
    ]),
    context: `Enclosure vendor review comparing the two tooling quotes. The team leans toward ${A}, mainly on price.`,
    states: [preferred],
    links: [
      { to: quoteA, intent: `the offer from ${A}` },
      { to: quoteB, intent: `the offer from ${B}` },
      { to: requirements, intent: "the enclosure requirements being checked" },
    ],
  })
  const hub = b.note({
    folder: "Projects",
    title: codename,
    type: "project",
    date: day(45),
    author: pm,
    frontmatter: {
      type: "project",
      product,
      owner: pm.name,
      status: "active",
      updated: day(45),
    },
    context: `Project page of ${codename}, last edited on ${day(45)} and never updated since: it still shows ${A} as the enclosure vendor and the original launch date.`,
    states: [launchFact, preferred],
    links: [
      { to: kickoff, intent: "how the project started" },
      { to: requirements, intent: "the requirements" },
      { to: review, intent: "where the enclosure vendor was discussed" },
    ],
  })
  desk.write(
    day(50),
    [preferred],
    [{ to: review, intent: "what came out of the enclosure review" }],
    `Personal note: heard in the hallway that ${codename} is going with ${A} for the enclosure.`,
    codename
  )
  const designReview = b.note({
    ...meeting(day(60), `${codename} design review`, ee, [
      ee.name,
      me.name,
      fw.name,
      pm.name,
    ]),
    context: `Design review of ${codename}. One open question is debated at length and left open.`,
    states: [undecided],
    links: [
      { to: hub, intent: "open questions are tracked on the project page" },
    ],
  })
  const journalOpen = desk.write(
    day(62),
    [undecided],
    [{ to: designReview, intent: "the question came up in the design review" }],
    `Personal note: frustrated that the team still has not settled ${open.phrase} for ${codename}.`,
    codename
  )
  const signoff = b.note({
    ...meeting(day(75), `${codename} tooling sign-off`, me, [
      me.name,
      pm.name,
      buyer.name,
      qe.name,
    ]),
    context: `Vendor validation after the drop tests: the team gives ${B} the tooling go-ahead for the ${codename} enclosure. Talk about sign-off, validation and go-ahead.`,
    states: [final],
    links: [
      {
        to: requirements,
        intent: "this settles the enclosure section of the requirements",
      },
      { to: vendorB.note, intent: `${B} is now the validated vendor` },
    ],
    forbiddenTerms: pools.QUOTE_TERMS,
  })
  b.link(
    requirements,
    signoff,
    "the enclosure supplier decision is recorded in the tooling sign-off"
  )
  const evtReview = b.note({
    ...meeting(day(95), `${codename} EVT review`, ee, [
      ee.name,
      me.name,
      fw.name,
      qe.name,
    ]),
    context: `Review of the first engineering validation build of ${codename}.`,
    states: [evtFact],
    links: [
      { to: signoff, intent: "enclosures built as agreed at the sign-off" },
    ],
  })
  const journalEvt = desk.write(
    day(97),
    [evtJournalFact],
    [{ to: evtReview, intent: "notes from the EVT review" }],
    `Personal note after the ${codename} EVT build, counting the units on the bench.`,
    codename
  )
  const pilotMeeting = b.note({
    ...meeting(
      day(140),
      `${codename} pilot kickoff with ${pilotCustomer.customer.name}`,
      pm,
      [pm.name, qe.name]
    ),
    context: `Kickoff of the ${codename} pilot at ${pilotCustomer.customer.name}: scope and number of units.`,
    states: [pilot],
    links: [
      { to: pilotCustomer.note, intent: "who the customer is" },
      { to: hub, intent: "the project page" },
    ],
  })
  const dvtReview = b.note({
    ...meeting(day(150), `${codename} DVT review`, qe, [
      qe.name,
      ee.name,
      me.name,
      pm.name,
    ]),
    context: `Design validation review of ${codename}: the main issue found on the DVT units.`,
    states: [dvt],
    links: [{ to: pilotMeeting, intent: "DVT units also went to the pilot" }],
  })
  const schedule = b.note({
    ...meeting(day(175), `${codename} schedule review`, pm, [
      pm.name,
      qe.name,
      staff.coo.name,
    ]),
    context: `Schedule review of ${codename}: the launch moves because a certification test has to be run again.`,
    states: [slipped, slipReason],
    links: [
      { to: lab.note, intent: "the lab running the retest" },
      { to: hub, intent: "the project page" },
    ],
  })
  const decision = b.note({
    folder: "Decisions",
    title: `${codename} launch date change`,
    type: "decision",
    date: day(177),
    author: pm,
    frontmatter: {
      type: "decision",
      date: day(177),
      project: codename,
      decided_by: pm.name,
    },
    context: `Decision record of the new ${codename} launch date.`,
    states: [slipped],
    links: [{ to: schedule, intent: "the reasons are in the schedule review" }],
  })

  b.trap("revised_decision", [preferred, final], [signoff], [review])
  b.trap("stale_note", [preferred, final], [signoff], [hub])
  b.trap("vocabulary_shift", [final], [signoff], [quoteA, quoteB, review])
  b.trap(
    "revised_decision",
    [launchFact, slipped],
    [schedule, decision],
    [kickoff, hub]
  )
  b.trap(
    "divergent_duplicate",
    [batteryFact, copyBatteryFact],
    [requirements, copy],
    []
  )
  b.trap(
    "contradiction",
    [evtFact, evtJournalFact],
    [evtReview, journalEvt],
    []
  )
  b.trap("undecided", [undecided], [designReview, journalOpen], [])

  b.chain([requirements, signoff, vendorB.note], vendorB.contact)
  b.chain([review, quoteB, vendorB.note], vendorB.city)
  b.chain([decision, schedule, lab.note], lab.contact)
  b.chain([dvtReview, pilotMeeting, pilotCustomer.note], pilotCustomer.contact)

  for (const k of [i, i + 1]) {
    const topic = at(pools.ABSENT_TOPICS.project, k)
    b.absentTopic(subject, `${codename} ${topic.topic}`, topic.terms)
  }
}

// Company: all-hands meetings announcing promotions, price changes and
// operations reviews that leave questions open.

function buildCompany(
  b: Builder,
  staff: Staff,
  desk: JournalDesk,
  scale: number
): void {
  const execs = [staff.ceo, staff.coo, staff.vpSales].map((p) => p.name)
  for (const meeting of staff.allHands) {
    const promotions = meeting.promoted.map((person) => {
      const role = roleAt(person, meeting.date)
      const fact = b.fact({
        subject: person.id,
        attribute: "role",
        value: role.title,
        statement: `${person.name} works as ${role.title} on the ${role.team} team.`,
        anchors: [role.title],
        validFrom: meeting.date,
      })
      const old = b.facts.find(
        (f) => f.subject === person.id && f.attribute === "role" && f !== fact
      )
      if (!old) throw new Error(`no previous role for ${person.name}`)
      b.supersede(old, fact)
      return { person, fact, old }
    })
    const note = b.note({
      folder: "Meetings",
      title: `${meeting.date} All-hands`,
      type: "meeting",
      date: meeting.date,
      author: staff.ceo,
      frontmatter: { type: "meeting", date: meeting.date, attendees: execs },
      context: `Company all-hands. Among the updates, the CEO announces new roles.`,
      states: promotions.map((p) => p.fact),
      links: promotions.map((p) => ({
        to: personNote(staff, p.person),
        intent: `congratulations to ${p.person.name} on the new role`,
      })),
    })
    for (const { person, fact, old } of promotions) {
      const gossip = desk.write(
        addDays(meeting.date, b.rng.int(1, 6)),
        [fact],
        [{ to: note, intent: "announced at the all-hands" }],
        `Personal note: thoughts on ${person.name}'s new role.`,
        undefined,
        person
      )
      b.trap(
        "stale_note",
        [old, fact],
        [note, gossip],
        [personNote(staff, person)]
      )
    }
  }

  for (let i = 0; i < scale; i++) {
    const line = at(pools.PRODUCT_LINES, i)
    const date = addDays(TODAY, -b.rng.int(30, 200))
    const effective = addDays(date, 30)
    const price = b.rng.int(19, 45) * 10 - 1
    const fact = b.fact({
      subject: `line:${line}`,
      attribute: "list_price",
      value: usd(price),
      statement: `The list price of the Larkspur ${line} rises to ${usd(price)} on ${longDate(effective)}.`,
      anchors: [usd(price), longDate(effective)],
      validFrom: date,
    })
    b.note({
      folder: "Decisions",
      title: `${line} price update`,
      type: "decision",
      date,
      author: staff.vpSales,
      frontmatter: {
        type: "decision",
        date,
        decided_by: staff.vpSales.name,
      },
      context: `Decision record of a list price change for the ${line} product line.`,
      states: [fact],
      links: [
        { to: personNote(staff, staff.ceo), intent: "approved by the CEO" },
      ],
    })
  }

  for (let i = 0; i < 2 * scale; i++) {
    const open = at(pools.COMPANY_UNDECIDED, i)
    const date = addDays(START, 150 + i * 90 + b.rng.int(0, 30))
    const fact = b.fact({
      subject: "company",
      attribute: `open_question:${open.anchor}`,
      value: "undecided",
      statement: `The leadership team discussed ${open.phrase} but made no decision.`,
      anchors: [open.anchor],
      validFrom: date,
    })
    const note = b.note({
      folder: "Meetings",
      title: `${date} Operations review`,
      type: "meeting",
      date,
      author: staff.coo,
      frontmatter: {
        type: "meeting",
        date,
        attendees: [
          staff.coo.name,
          staff.procurementHead.name,
          staff.successHead.name,
        ],
      },
      context: `Monthly operations review. One proposal is debated and left open.`,
      states: [fact],
    })
    b.trap("undecided", [fact], [note], [])
  }

  for (const topic of pools.ABSENT_TOPICS.company) {
    b.absentTopic("company", `Larkspur ${topic.topic}`, topic.terms)
  }
}
