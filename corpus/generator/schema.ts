import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = z.string().min(1)

export const NOTE_TYPES = [
  "project",
  "meeting",
  "spec",
  "quote",
  "decision",
  "customer",
  "supplier",
  "person",
  "journal",
] as const

export const TRAP_KINDS = [
  "revised_decision",
  "stale_note",
  "divergent_duplicate",
  "contradiction",
  "undecided",
  "vocabulary_shift",
] as const

const PersonSchema = z.object({
  id,
  name: z.string(),
  roles: z
    .array(
      z.object({
        title: z.string(),
        team: z.string(),
        from: isoDate,
        to: isoDate.nullable(),
      })
    )
    .min(1),
})

const FactSchema = z.object({
  id,
  subject: id,
  attribute: z.string(),
  value: z.string(),
  statement: z.string(),
  anchors: z.array(z.string().min(1)).min(1),
  validFrom: isoDate,
  validTo: isoDate.nullable(),
  supersededBy: id.nullable(),
})

const NoteSpecSchema = z.object({
  id,
  path: z.string(),
  type: z.enum(NOTE_TYPES),
  title: z.string(),
  date: isoDate,
  author: id,
  frontmatter: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  context: z.string(),
  states: z.array(id),
  links: z.array(z.object({ target: id, intent: z.string() })),
  forbiddenTerms: z.array(z.string().min(1)),
  words: z.tuple([z.number().int(), z.number().int()]),
})

export const WorldSchema = z.object({
  meta: z.object({
    seed: z.number().int(),
    scale: z.number().int().positive(),
    company: z.string(),
    start: isoDate,
    today: isoDate,
  }),
  people: z.array(PersonSchema),
  customers: z.array(
    z.object({ id, name: z.string(), segment: z.string(), city: z.string() })
  ),
  suppliers: z.array(
    z.object({ id, name: z.string(), category: z.string(), city: z.string() })
  ),
  projects: z.array(
    z.object({
      id,
      codename: z.string(),
      product: z.string(),
      goal: z.string(),
      owner: id,
      start: isoDate,
    })
  ),
  facts: z.array(FactSchema),
  notes: z.array(NoteSpecSchema),
  traps: z.array(
    z.object({
      id,
      kind: z.enum(TRAP_KINDS),
      facts: z.array(id),
      truthNotes: z.array(id),
      decoyNotes: z.array(id),
    })
  ),
  chains: z.array(
    z.object({ id, notes: z.array(id).min(3).max(4), answer: id })
  ),
  absent: z.array(
    z.object({
      id,
      subject: z.string(),
      topic: z.string(),
      forbiddenTerms: z.array(z.string().min(1)).min(1),
    })
  ),
})

export type World = z.infer<typeof WorldSchema>
export type Person = z.infer<typeof PersonSchema>
export type Fact = z.infer<typeof FactSchema>
export type NoteSpec = z.infer<typeof NoteSpecSchema>
export type NoteType = (typeof NOTE_TYPES)[number]
export type TrapKind = (typeof TRAP_KINDS)[number]
export type Customer = World["customers"][number]
export type Supplier = World["suppliers"][number]
export type Project = World["projects"][number]
