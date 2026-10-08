import { describe, expect, test } from "bun:test"
import { FIRST_NAMES } from "./pools.ts"
import { WorldSchema, type NoteSpec, type World } from "./schema.ts"
import { validateVault } from "./validate.ts"

// A tiny world: four notes, three facts, a vocabulary trap (the sign-off note
// must not say "quote") and an absent topic (patents).

const BODIES: Record<string, string> = {
  n1: [
    "# Falcon Hub",
    "",
    "This hub tracks the Falcon sensor project for Larkspur Devices. The launch date is March 15, 2026, and the team keeps the supplier details in [[Helix Quote]]. The final vendor choice is in [[Vendor Sign-off]].",
  ].join("\n"),
  n2: [
    "# Helix Quote",
    "",
    "Helix Components quoted $3.85 per sensor board on 2025-06-10. The price holds for the first production run. This note belongs to the [[Falcon Hub]] project and was written by Marcus Okafor.",
  ].join("\n"),
  n3: [
    "# Vendor Sign-off",
    "",
    "Dana Whitfield signed off the Helix Components offer today. Northwind Properties gets a 12% volume discount on every order, and the decision is final. See [[Falcon Hub]] for the project overview.",
  ].join("\n"),
  n4: [
    "# Pilot Batch 500",
    "",
    "The pilot batch ships to Northwind Properties and covers the first office buildings in Denver. Marcus Okafor tracks the units and reports weekly to the Falcon team.",
  ].join("\n"),
}

function buildWorld(): World {
  return WorldSchema.parse({
    meta: {
      seed: 1,
      scale: 1,
      company: "Larkspur Devices, Inc.",
      start: "2025-01-06",
      today: "2026-09-30",
    },
    people: [
      {
        id: "p1",
        name: "Dana Whitfield",
        roles: [
          {
            title: "Product Manager",
            team: "Product",
            from: "2025-01-06",
            to: null,
          },
        ],
      },
      {
        id: "p2",
        name: "Marcus Okafor",
        roles: [
          {
            title: "Head of Procurement",
            team: "Operations",
            from: "2025-01-06",
            to: null,
          },
        ],
      },
    ],
    customers: [
      {
        id: "c1",
        name: "Northwind Properties",
        segment: "Property management",
        city: "Denver",
      },
    ],
    suppliers: [
      {
        id: "s1",
        name: "Helix Components",
        category: "Electronics",
        city: "Shenzhen",
      },
    ],
    projects: [
      {
        id: "pr1",
        codename: "Falcon",
        product: "Wall sensor",
        goal: "Ship the first air-quality sensor",
        owner: "p1",
        start: "2025-01-20",
      },
    ],
    facts: [
      {
        id: "f1",
        subject: "s1",
        attribute: "unit price",
        value: "$3.85",
        statement:
          "Helix Components quoted $3.85 per sensor board on 2025-06-10.",
        anchors: ["$3.85", "Helix Components"],
        validFrom: "2025-06-10",
        validTo: null,
        supersededBy: null,
      },
      {
        id: "f2",
        subject: "pr1",
        attribute: "launch date",
        value: "2026-03-15",
        statement: "The Falcon launch date is March 15, 2026.",
        anchors: ["March 15, 2026"],
        validFrom: "2025-02-03",
        validTo: null,
        supersededBy: null,
      },
      {
        id: "f3",
        subject: "c1",
        attribute: "volume discount",
        value: "12%",
        statement:
          "Northwind Properties gets a 12% volume discount, as agreed with Elena Brennan.",
        anchors: ["12% volume discount"],
        validFrom: "2025-07-01",
        validTo: null,
        supersededBy: null,
      },
    ],
    notes: [
      {
        id: "n1",
        path: "Projects/Falcon Hub.md",
        type: "project",
        title: "Falcon Hub",
        date: "2025-02-03",
        author: "p1",
        frontmatter: {
          title: "Falcon Hub",
          type: "project",
          date: "2025-02-03",
          tags: ["project", "hardware"],
        },
        context: "Hub note for the Falcon project.",
        states: ["f2"],
        links: [
          { target: "n2", intent: "Point to the supplier price" },
          { target: "n3", intent: "Point to the vendor decision" },
        ],
        forbiddenTerms: [],
        words: [20, 60],
      },
      {
        id: "n2",
        path: "Quotes/Helix Quote.md",
        type: "quote",
        title: "Helix Quote",
        date: "2025-06-10",
        author: "p2",
        frontmatter: {
          title: "Helix Quote",
          type: "quote",
          date: "2025-06-10",
        },
        context: "Supplier price for the sensor board.",
        states: ["f1"],
        links: [{ target: "n1", intent: "Point back to the project" }],
        forbiddenTerms: [],
        words: [20, 60],
      },
      {
        id: "n3",
        path: "Decisions/Vendor Sign-off.md",
        type: "decision",
        title: "Vendor Sign-off",
        date: "2025-07-01",
        author: "p1",
        frontmatter: {
          title: "Vendor Sign-off",
          type: "decision",
          date: "2025-07-01",
        },
        context: "The vendor is chosen.",
        states: ["f3"],
        links: [{ target: "n1", intent: "Point to the project overview" }],
        forbiddenTerms: ["quote"],
        words: [20, 60],
      },
      {
        id: "n4",
        path: "Projects/Pilot Batch 500.md",
        type: "project",
        title: "Pilot Batch 500",
        date: "2025-04-14",
        author: "p2",
        frontmatter: {
          title: "Pilot Batch 500",
          type: "project",
          date: "2025-04-14",
        },
        context: "The first pilot units.",
        states: [],
        links: [],
        forbiddenTerms: [],
        words: [20, 60],
      },
    ],
    traps: [
      {
        id: "t1",
        kind: "vocabulary_shift",
        facts: ["f3"],
        truthNotes: ["n3"],
        decoyNotes: ["n2"],
      },
    ],
    chains: [],
    absent: [
      {
        id: "a1",
        subject: "project",
        topic: "patent filing",
        forbiddenTerms: ["patent", "patented"],
      },
    ],
  })
}

function note(world: World, id: string): NoteSpec {
  const found = world.notes.find((n) => n.id === id)
  if (!found) throw new Error(`fixture: no note ${id}`)
  return found
}

function renderFile(
  frontmatter: NoteSpec["frontmatter"],
  body: string
): string {
  const lines = Object.entries(frontmatter).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`
  )
  return `---\n${lines.join("\n")}\n---\n${body}\n`
}

/** The vault of the world, each note written from BODIES unless overridden. */
function buildFiles(
  world: World,
  bodies: Record<string, string> = {}
): Map<string, string> {
  return new Map(
    world.notes.map((n) => [
      n.path,
      renderFile(n.frontmatter, bodies[n.id] ?? BODIES[n.id]!),
    ])
  )
}

/** BODIES[id] with `from` replaced by `to`; fails when `from` is absent. */
function edited(id: string, from: string, to: string): string {
  const body = BODIES[id]!
  if (!body.includes(from)) throw new Error(`fixture: "${from}" not in ${id}`)
  return body.replace(from, to)
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length
}

function run(world: World, bodies: Record<string, string> = {}) {
  return validateVault(world, buildFiles(world, bodies))
}

interface Issue {
  path: string
  rule: string
  message: string
}

function withRule(issues: Issue[], rule: string): Issue[] {
  return issues.filter((issue) => issue.rule === rule)
}

const N1 = "Projects/Falcon Hub.md"
const N2 = "Quotes/Helix Quote.md"
const N3 = "Decisions/Vendor Sign-off.md"
const N4 = "Projects/Pilot Batch 500.md"

describe("AC1 — missing and unexpected notes", () => {
  test("AC1 — a clean vault gives no error and no warning", () => {
    expect(run(buildWorld())).toEqual({ errors: [], warnings: [] })
  })

  test("AC1 — a world note with no file is a missing error", () => {
    const world = buildWorld()
    const files = buildFiles(world)
    files.delete(N4)
    const { errors } = validateVault(world, files)
    const missing = withRule(errors, "missing")
    expect(missing.map((issue) => issue.path)).toEqual([N4])
    expect(withRule(errors, "unexpected")).toEqual([])
  })

  test("AC1 — a file that is no world note is an unexpected error", () => {
    const world = buildWorld()
    const files = buildFiles(world)
    files.set("Notes/Stray.md", "# Stray\n\nNobody planned this note.\n")
    const { errors } = validateVault(world, files)
    const unexpected = withRule(errors, "unexpected")
    expect(unexpected.map((issue) => issue.path)).toEqual(["Notes/Stray.md"])
    expect(withRule(errors, "missing")).toEqual([])
  })
})

describe("AC2 — frontmatter", () => {
  function frontmatterErrors(world: World, path: string, content: string) {
    const files = buildFiles(world)
    files.set(path, content)
    return withRule(validateVault(world, files).errors, "frontmatter")
  }

  test("AC2 — a different value is a frontmatter error", () => {
    const world = buildWorld()
    const content = renderFile(
      { ...note(world, "n1").frontmatter, date: "2025-02-04" },
      BODIES.n1!
    )
    const errors = frontmatterErrors(world, N1, content)
    expect(errors.map((issue) => issue.path)).toEqual([N1])
  })

  test("AC2 — an extra key is a frontmatter error", () => {
    const world = buildWorld()
    const content = renderFile(
      { ...note(world, "n1").frontmatter, status: "draft" },
      BODIES.n1!
    )
    expect(frontmatterErrors(world, N1, content).map((i) => i.path)).toEqual([
      N1,
    ])
  })

  test("AC2 — a missing key is a frontmatter error", () => {
    const world = buildWorld()
    const rest = Object.fromEntries(
      Object.entries(note(world, "n1").frontmatter).filter(
        ([key]) => key !== "tags"
      )
    )
    const content = renderFile(rest, BODIES.n1!)
    expect(frontmatterErrors(world, N1, content).map((i) => i.path)).toEqual([
      N1,
    ])
  })

  test("AC2 — a different string-array value is a frontmatter error", () => {
    const world = buildWorld()
    const content = renderFile(
      { ...note(world, "n1").frontmatter, tags: ["project", "software"] },
      BODIES.n1!
    )
    expect(frontmatterErrors(world, N1, content).map((i) => i.path)).toEqual([
      N1,
    ])
  })

  test("AC2 — a note with no frontmatter is a frontmatter error", () => {
    const world = buildWorld()
    const errors = frontmatterErrors(world, N1, `${BODIES.n1}\n`)
    expect(errors.map((issue) => issue.path)).toEqual([N1])
  })

  test("AC2 — a frontmatter that does not parse is a frontmatter error, not a crash", () => {
    const world = buildWorld()
    const files = buildFiles(world)
    files.set(N1, `---\ntitle: [unclosed\n---\n${BODIES.n1}\n`)
    expect(() => validateVault(world, files)).not.toThrow()
    const errors = withRule(validateVault(world, files).errors, "frontmatter")
    expect(errors.map((issue) => issue.path)).toEqual([N1])
  })

  test("AC2 — key order is ignored", () => {
    const world = buildWorld()
    const reversed = Object.fromEntries(
      Object.entries(note(world, "n1").frontmatter).reverse()
    )
    const files = buildFiles(world)
    files.set(N1, renderFile(reversed, BODIES.n1!))
    expect(validateVault(world, files)).toEqual({ errors: [], warnings: [] })
  })
})

describe("AC3 — anchors", () => {
  test("AC3 — a missing anchor is an anchor error naming the fact and the anchor", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n2: edited("n2", "$3.85", "a fair price"),
    })
    const anchors = withRule(errors, "anchor")
    expect(anchors).toHaveLength(1)
    expect(anchors[0]!.path).toBe(N2)
    expect(anchors[0]!.message).toContain("f1")
    expect(anchors[0]!.message).toContain("$3.85")
  })

  test("AC3 — every missing anchor gets its own error", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n2: "# Helix Quote\n\nThe price holds for the first production run. This note belongs to the [[Falcon Hub]] project and was written by Marcus Okafor.",
    })
    const anchors = withRule(errors, "anchor")
    expect(anchors).toHaveLength(2)
    expect(anchors.some((issue) => issue.message.includes("$3.85"))).toBe(true)
    expect(
      anchors.some((issue) => issue.message.includes("Helix Components"))
    ).toBe(true)
  })

  test("AC3 — anchors match case-insensitively with whitespace collapsed", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n2: edited("n2", "Helix Components", "HELIX \n  components"),
      n3: edited("n3", "12% volume discount", "12% Volume   Discount"),
    })
    expect(withRule(errors, "anchor")).toEqual([])
  })

  test("AC3 — an anchor that only appears in the frontmatter does not count", () => {
    const world = buildWorld()
    note(world, "n2").frontmatter.summary = "Helix Components at $3.85"
    const { errors } = run(world, {
      n2: "# Helix Quote\n\nThe price holds for the first production run. This note belongs to the [[Falcon Hub]] project and was written by Marcus Okafor.",
    })
    expect(withRule(errors, "anchor")).toHaveLength(2)
  })
})

describe("AC4 — links", () => {
  test("AC4 — a world link with no wikilink in the file is a link error", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n1: edited("n1", "[[Vendor Sign-off]]", "the sign-off note"),
    })
    const links = withRule(errors, "link")
    expect(links).toHaveLength(1)
    expect(links[0]!.path).toBe(N1)
    expect(withRule(errors, "unresolved-link")).toEqual([])
  })

  const resolving: [string, string][] = [
    ["an alias", "[[Helix Quote|the Helix offer]]"],
    ["a vault-relative path", "[[Quotes/Helix Quote]]"],
    ["a different case", "[[helix quote]]"],
  ]
  for (const [label, wikilink] of resolving) {
    test(`AC4 — a wikilink written with ${label} resolves to the target note`, () => {
      const world = buildWorld()
      const result = run(world, {
        n1: edited("n1", "[[Helix Quote]]", wikilink),
      })
      expect(result).toEqual({ errors: [], warnings: [] })
    })
  }

  test("AC4 — a wikilink to no note is an unresolved-link error", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n1: `${BODIES.n1} See also [[Nonexistent Note]].`,
    })
    const unresolved = withRule(errors, "unresolved-link")
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0]!.path).toBe(N1)
    expect(withRule(errors, "link")).toEqual([])
  })

  test("AC4 — a wikilink to an existing note the world does not list is an extra-link warning", () => {
    const world = buildWorld()
    const { errors, warnings } = run(world, {
      n3: `${BODIES.n3} The first pilot is [[Pilot Batch 500]].`,
    })
    expect(errors).toEqual([])
    const extra = withRule(warnings, "extra-link")
    expect(extra).toHaveLength(1)
    expect(extra[0]!.path).toBe(N3)
  })
})

describe("AC5 — forbidden terms", () => {
  test("AC5 — a forbidden term in the body is a forbidden error", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n3: `${BODIES.n3} The quote was withdrawn.`,
    })
    const forbidden = withRule(errors, "forbidden")
    expect(forbidden).toHaveLength(1)
    expect(forbidden[0]!.path).toBe(N3)
  })

  test("AC5 — the match is case-insensitive", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n3: `${BODIES.n3} The QUOTE was withdrawn.`,
    })
    expect(withRule(errors, "forbidden").map((i) => i.path)).toEqual([N3])
  })

  test("AC5 — the match is on whole words only", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n3: `${BODIES.n3} The supplier quoted twice and sent two quotes.`,
    })
    expect(withRule(errors, "forbidden")).toEqual([])
  })

  test("AC5 — a term forbidden in one note is allowed in the others", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n1: `${BODIES.n1} The quote is final.`,
    })
    expect(withRule(errors, "forbidden")).toEqual([])
  })

  test("AC5 — an absent-topic term in a body is an absent-topic error", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n4: `${BODIES.n4} The team asked about a patent.`,
    })
    const absent = withRule(errors, "absent-topic")
    expect(absent).toHaveLength(1)
    expect(absent[0]!.path).toBe(N4)
  })

  test("AC5 — an absent-topic term is caught in any note, case-insensitively", () => {
    const world = buildWorld()
    const { errors } = run(world, {
      n1: `${BODIES.n1} Nobody mentioned a PATENTED design.`,
    })
    expect(withRule(errors, "absent-topic").map((i) => i.path)).toEqual([N1])
  })

  test("AC5 — an absent-topic term in the frontmatter is an absent-topic error", () => {
    const world = buildWorld()
    note(world, "n4").frontmatter.summary = "A patented sensor housing"
    const { errors } = run(world)
    expect(withRule(errors, "absent-topic").map((i) => i.path)).toEqual([N4])
    expect(withRule(errors, "frontmatter")).toEqual([])
  })
})

describe("AC6 — unplanned numbers", () => {
  function unplanned(
    id: string,
    sentence: string,
    mutate?: (world: World) => void
  ) {
    const world = buildWorld()
    mutate?.(world)
    const { errors } = run(world, { [id]: `${BODIES[id]} ${sentence}` })
    return withRule(errors, "unplanned-number")
  }

  const uncovered: [string, string][] = [
    ["a money amount", "The budget is $48,200 this year."],
    ["a decimal money amount", "A spare board costs $4.10 each."],
    [
      "a percentage (covered in another note only)",
      "The discount is 12% for everyone.",
    ],
    ["an ISO date", "The review happens on 2027-09-01."],
    ["a long date", "The review happens on September 1, 2027."],
    ["a month and year", "The review happens in August 2027."],
    ["a plain number above 10", "The team ships 37 units."],
    ["the number 11", "The team has 11 desks."],
  ]
  for (const [label, sentence] of uncovered) {
    test(`AC6 — ${label} that no text covers is one unplanned-number error`, () => {
      const errors = unplanned("n1", sentence)
      expect(errors).toHaveLength(1)
      expect(errors[0]!.path).toBe(N1)
    })
  }

  test("AC6 — two uncovered numbers give two errors", () => {
    const errors = unplanned("n1", "It costs $48,200 and ships 37 units.")
    expect(errors).toHaveLength(2)
  })

  const uncoveredFigures: [string, string][] = [
    ["a digit quantity of weeks", "The ramp-up takes about 6 weeks."],
    ["a quantity of weeks in words", "The ramp-up takes six weeks."],
    ["a quantity of hours", "The call lasts 2 hours."],
    ["a quantity of modules", "The kit has 3 modules."],
    ["a quantity of sensors in words", "The site has four sensors."],
    ["a quantity of boards in words", "The order is ten boards."],
    ["a quantity of one month", "The trial lasts one month."],
    ["a quantity of years", "The contract runs 5 years."],
    ["a quantity of packs", "Each carton holds 9 packs."],
    ["a quantity of days", "The delay was 2 days."],
    ["a month and a day without a year", "The review is on December 4."],
    ["a number in words above 10", "The team has twelve desks."],
    ["a compound number in words", "The site has forty-five desks."],
    [
      "a percentage of 10 or less written with the word",
      "A 5 percent fee applies.",
    ],
    ["a percentage above 10 written with the word", "The rate is 12 percent."],
    [
      "a year alone that no date of the texts falls in",
      "The plan runs in 2027.",
    ],
  ]
  for (const [label, sentence] of uncoveredFigures) {
    test(`AC6 — ${label} that no text covers is one unplanned-number error`, () => {
      const errors = unplanned("n1", sentence)
      expect(errors).toHaveLength(1)
      expect(errors[0]!.path).toBe(N1)
    })
  }

  function addAnchor(factId: string, anchor: string) {
    return (world: World) => {
      const fact = world.facts.find((f) => f.id === factId)
      if (!fact) throw new Error(`fixture: no fact ${factId}`)
      fact.anchors.push(anchor)
    }
  }

  test("AC6 — a quantity in digits is covered by the same quantity in an anchor", () => {
    // n1 states f2.
    const errors = unplanned(
      "n1",
      "The ramp-up takes about 6 weeks.",
      addAnchor("f2", "6 weeks")
    )
    expect(errors).toEqual([])
  })

  test("AC6 — a quantity in words is covered by the same quantity in digits in an anchor", () => {
    const errors = unplanned(
      "n1",
      "The ramp-up takes six weeks.",
      addAnchor("f2", "6 weeks")
    )
    expect(errors).toEqual([])
  })

  test("AC6 — a quantity is covered by the same quantity in the context", () => {
    const errors = unplanned("n1", "The ramp-up takes six weeks.", (world) => {
      note(world, "n1").context = "The ramp-up takes 6 weeks."
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a quantity is not covered by the same number with another unit", () => {
    const errors = unplanned(
      "n1",
      "The delay was 6 days.",
      addAnchor("f2", "6 weeks")
    )
    expect(errors).toHaveLength(1)
  })

  test("AC6 — a quantity is not covered by the same unit with another number", () => {
    const errors = unplanned(
      "n1",
      "The ramp-up takes about 7 weeks.",
      addAnchor("f2", "6 weeks")
    )
    expect(errors).toHaveLength(1)
  })

  test("AC6 — a quantity above 10 gives one error, not one for the number and one for the quantity", () => {
    expect(unplanned("n1", "The ramp-up takes 12 weeks.")).toHaveLength(1)
    expect(
      unplanned(
        "n1",
        "The ramp-up takes 12 weeks.",
        addAnchor("f2", "12 weeks")
      )
    ).toEqual([])
  })

  test("AC6 — a bare number from 0 to 10 with no unit is allowed, in digits or in words", () => {
    const errors = unplanned(
      "n1",
      "There were two meetings, 7 teams and ten desks."
    )
    expect(errors).toEqual([])
  })

  test("AC6 — a month and a day is covered by an ISO date of the texts with that month and day", () => {
    const errors = unplanned("n1", "The review is on December 4.", (world) => {
      note(world, "n1").context = "The review is set for 2025-12-04."
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a month and a day is covered by a long date of the texts with that month and day", () => {
    const errors = unplanned("n1", "The review is on December 4.", (world) => {
      note(world, "n1").context = "The review is set for December 4, 2025."
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a month and a day is covered whatever the year of the date in the texts", () => {
    const errors = unplanned("n1", "The review is on December 4.", (world) => {
      note(world, "n1").context = "The review is set for 2024-12-04."
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a month and a day is not covered by another day of the same month", () => {
    const errors = unplanned("n1", "The review is on December 5.", (world) => {
      note(world, "n1").context = "The review is set for 2025-12-04."
    })
    expect(errors).toHaveLength(1)
  })

  test("AC6 — a month and a year is covered by a date of the texts in that month", () => {
    const errors = unplanned(
      "n1",
      "The review is in December 2025.",
      (world) => {
        note(world, "n1").context = "The review is set for 2025-12-04."
      }
    )
    expect(errors).toEqual([])
  })

  test("AC6 — a percentage written with the word is covered by the same percentage with the sign", () => {
    // n3 states f3, whose anchor is "12% volume discount".
    const errors = unplanned("n3", "The rate is 12 percent for everyone.")
    expect(errors).toEqual([])
  })

  test("AC6 — a percentage with the sign is covered by the same percentage written with the word", () => {
    const errors = unplanned("n1", "The rate is 12% for everyone.", (world) => {
      note(world, "n1").context = "The rate is 12 percent."
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a year alone is covered when a date of the texts falls in that year", () => {
    // n1's frontmatter date is 2025-02-03.
    expect(unplanned("n1", "The work began in 2025.")).toEqual([])
  })

  test("AC6 — numbers from 0 to 10 are always allowed", () => {
    const errors = unplanned("n1", "There are 7 teams, 10 desks and 0 delays.")
    expect(errors).toEqual([])
  })

  test("AC6 — numbers of the anchors and statements of the facts it states are covered", () => {
    // n2 states f1: $3.85 is an anchor, 2025-06-10 only appears in the statement.
    const errors = unplanned(
      "n2",
      "The price stays at $3.85 since 2025-06-10 for this run."
    )
    expect(errors).toEqual([])
  })

  test("AC6 — a number of the note's frontmatter values is covered", () => {
    const errors = unplanned("n1", "The cost center is 7700.", (world) => {
      note(world, "n1").frontmatter.summary = "Cost center 7700"
    })
    expect(errors).toEqual([])
  })

  test("AC6 — a number of the note's context is covered", () => {
    const errors = unplanned("n1", "About 42 people work on it.", (world) => {
      note(world, "n1").context = "Hub note, the team has 42 people."
    })
    expect(errors).toEqual([])
    expect(unplanned("n1", "About 42 people work on it.")).toHaveLength(1)
  })

  test("AC6 — a number of the note's own title is covered", () => {
    // n4 is titled "Pilot Batch 500".
    const errors = unplanned("n4", "The pilot batch 500 is the first one.")
    expect(errors).toEqual([])
  })

  test("AC6 — a number in the title of a linked note is covered", () => {
    const world = buildWorld()
    note(world, "n1").links.push({
      target: "n4",
      intent: "Point to the pilot batch",
    })
    const { errors } = run(world, {
      n1: `${BODIES.n1} It follows the 500 pilot run in [[Pilot Batch 500]].`,
    })
    expect(withRule(errors, "unplanned-number")).toEqual([])
  })

  test("AC6 — a number in the title of a note it does not link to is not covered", () => {
    const errors = unplanned("n1", "It follows the 500 pilot run.")
    expect(errors).toHaveLength(1)
  })

  test("AC6 — a long date is covered by its ISO form in the note's texts", () => {
    // n1's frontmatter date is 2025-02-03, n2's statement holds 2025-06-10.
    const errors = unplanned("n1", "The kickoff was on February 3, 2025.")
    expect(errors).toEqual([])
    const { errors: n2Errors } = run(buildWorld(), {
      n2: `${BODIES.n2} The price dates from June 10, 2025.`,
    })
    expect(withRule(n2Errors, "unplanned-number")).toEqual([])
  })

  test("AC6 — a long date is covered by its long form in the note's texts", () => {
    const errors = unplanned("n1", "Again, the launch is March 15, 2026.")
    expect(errors).toEqual([])
  })

  test("AC6 — a number in a wikilink target is ignored", () => {
    // 500 only appears in the title of n4, which n1 does not link to.
    expect(unplanned("n1", "See [[Pilot Batch 500]].")).toEqual([])
    expect(unplanned("n1", "See [[Pilot Batch 500|the pilot run]].")).toEqual(
      []
    )
  })

  test("AC6 — a figure in a wikilink alias is checked like the rest of the body", () => {
    const errors = unplanned("n1", "See [[Falcon Hub|the $4.10 offer]].")
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe(N1)
  })

  test("AC6 — a figure in a wikilink alias is covered when the texts hold it", () => {
    // n2 states f1, whose anchor is $3.85.
    const errors = unplanned("n2", "See [[Falcon Hub|the $3.85 offer]].")
    expect(errors).toEqual([])
  })

  test("AC6 — only the alias of a wikilink is checked, not its target", () => {
    const errors = unplanned("n1", "See [[Pilot Batch 500|the 2027 plan]].")
    expect(errors).toHaveLength(1)
  })

  test("AC6 — a wikilink with a figure in both the target and the alias gives one error", () => {
    const errors = unplanned("n1", "See [[Pilot Batch 500|the $4.10 offer]].")
    expect(errors).toHaveLength(1)
  })
})

describe("AC7 — invented people", () => {
  test("AC7 — an unknown two-word name with a pool first name is an unknown-person warning", () => {
    expect(FIRST_NAMES).toContain("Priya")
    const { errors, warnings } = run(buildWorld(), {
      n4: `${BODIES.n4} Priya Raman reviewed the units.`,
    })
    expect(errors).toEqual([])
    const unknown = withRule(warnings, "unknown-person")
    expect(unknown).toHaveLength(1)
    expect(unknown[0]!.path).toBe(N4)
  })

  test("AC7 — a world person is not flagged", () => {
    const { warnings } = run(buildWorld(), {
      n4: `${BODIES.n4} Dana Whitfield reviewed the units.`,
    })
    expect(withRule(warnings, "unknown-person")).toEqual([])
  })

  test("AC7 — a name written in a fact statement of the world is not flagged, even in another note", () => {
    // Elena Brennan appears in the statement of f3, which n3 states, not n4.
    expect(FIRST_NAMES).toContain("Elena")
    const { warnings } = run(buildWorld(), {
      n4: `${BODIES.n4} Elena Brennan reviewed the units.`,
    })
    expect(withRule(warnings, "unknown-person")).toEqual([])
  })

  test("AC7 — a two-word name whose first word is not a pool first name is not flagged", () => {
    const { warnings } = run(buildWorld(), {
      n4: `${BODIES.n4} Pilot Review reviewed the units.`,
    })
    expect(withRule(warnings, "unknown-person")).toEqual([])
  })
})

describe("AC8 — length", () => {
  const count = wordCount(BODIES.n1!)

  function lengthWarnings(words: [number, number]) {
    const world = buildWorld()
    note(world, "n1").words = words
    const { errors, warnings } = run(world)
    expect(errors).toEqual([])
    return withRule(warnings, "length")
  }

  test("AC8 — a body below 80% of the minimum is a length warning", () => {
    const min = Math.ceil(count / 0.7)
    const warnings = lengthWarnings([min, min + 40])
    expect(warnings.map((issue) => issue.path)).toEqual([N1])
  })

  test("AC8 — a body above 125% of the maximum is a length warning", () => {
    const warnings = lengthWarnings([5, Math.floor(count / 1.4)])
    expect(warnings.map((issue) => issue.path)).toEqual([N1])
  })

  test("AC8 — a body slightly below the minimum is tolerated", () => {
    const min = Math.round(count * 1.1)
    expect(lengthWarnings([min, min + 30])).toEqual([])
  })

  test("AC8 — a body slightly above the maximum is tolerated", () => {
    expect(lengthWarnings([5, Math.round(count / 1.1)])).toEqual([])
  })

  test("AC8 — the frontmatter is not counted in the body", () => {
    const world = buildWorld()
    note(world, "n1").frontmatter.summary = Array(200).fill("word").join(" ")
    note(world, "n1").words = [Math.round(count * 0.9), Math.round(count * 1.1)]
    const { warnings } = run(world)
    expect(withRule(warnings, "length")).toEqual([])
  })
})
