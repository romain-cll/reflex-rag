import {
  noteResolver,
  parseNote,
  splitFrontmatter,
} from "../../src/vault/parse.ts"
import { FIRST_NAMES } from "./pools.ts"
import type { Fact, NoteSpec, World } from "./schema.ts"

export interface Issue {
  path: string
  rule: string
  message: string
}

export interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
}

/** What the rules need to know about the whole vault. */
interface Context {
  world: World
  notesById: Map<string, NoteSpec>
  factsById: Map<string, Fact>
  resolve: (target: string) => string | undefined
  /** World people, plus every name written in a fact statement. */
  knownPeople: Set<string>
}

/** A file that matches a world note, with its frontmatter and links read. */
interface WrittenNote {
  spec: NoteSpec
  frontmatter: Record<string, unknown>
  body: string
  wikilinks: { target: string; path: string | undefined }[]
}

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

// A date or an amount is one token: "2027-09-01" must not also count as 2027.
const QUANTITY = new RegExp(
  [
    String.raw`(?<iso>\d{4}-\d{2}-\d{2})`,
    String.raw`(?<month>${MONTHS.join("|")}) (?:(?<day>\d{1,2}), )?(?<year>\d{4})`,
    String.raw`\$\d+(?:,\d{3})*(?:\.\d+)?`,
    String.raw`\d+(?:\.\d+)?%`,
    String.raw`\d+(?:,\d{3})*(?:\.\d+)?`,
  ].join("|"),
  "g"
)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const WIKILINK = /!?\[\[[^\]]*\]\]/g
// The second word is a lookahead so that "Yesterday Marcus Okafor" still
// yields "Marcus Okafor".
const NAME_START = /\b([A-Z][a-z]+)(?= ([A-Z][a-z]+)\b)/g

export function validateVault(
  world: World,
  files: Map<string, string>
): ValidationResult {
  const specs = new Map(world.notes.map((spec) => [spec.path, spec]))
  const context: Context = {
    world,
    notesById: new Map(world.notes.map((spec) => [spec.id, spec])),
    factsById: new Map(world.facts.map((fact) => [fact.id, fact])),
    // Notes of the world not written yet still count: they are reported as
    // missing, not as broken links.
    resolve: noteResolver([...files.keys(), ...specs.keys()]),
    knownPeople: knownPeople(world),
  }
  const errors: Issue[] = []
  const warnings: Issue[] = []

  for (const spec of world.notes) {
    if (!files.has(spec.path)) {
      errors.push(issue(spec.path, "missing", "no file for this note"))
    }
  }
  for (const [path, content] of files) {
    errors.push(...absentTopics(context, path, content))
    const spec = specs.get(path)
    if (!spec) {
      errors.push(issue(path, "unexpected", "no such note in the world"))
      continue
    }
    const note = readNote(context, spec, content)
    if (typeof note === "string") {
      errors.push(issue(path, "frontmatter", note))
      continue
    }
    errors.push(
      ...frontmatterDiff(note),
      ...anchors(context, note),
      ...linkIssues(context, note),
      ...forbiddenTerms(note),
      ...unplannedNumbers(context, note)
    )
    warnings.push(
      ...extraLinks(context, note),
      ...unknownPeople(context, note),
      ...lengthIssues(note)
    )
  }
  return { errors, warnings }
}

function issue(path: string, rule: string, message: string): Issue {
  return { path, rule, message }
}

/** The note read from its file, or the reason why its frontmatter is unreadable. */
function readNote(
  context: Context,
  spec: NoteSpec,
  content: string
): WrittenNote | string {
  try {
    const { note, links } = parseNote(spec.path, content)
    return {
      spec,
      frontmatter: note.frontmatter,
      body: splitFrontmatter(spec.path, content).body,
      wikilinks: links.map(({ target }) => ({
        target,
        path: context.resolve(target),
      })),
    }
  } catch (error) {
    return `frontmatter does not parse: ${String(error)}`
  }
}

function frontmatterDiff({ spec, frontmatter }: WrittenNote): Issue[] {
  const keys = new Set([
    ...Object.keys(frontmatter),
    ...Object.keys(spec.frontmatter),
  ])
  const differing = [...keys].filter(
    (key) =>
      JSON.stringify(frontmatter[key]) !== JSON.stringify(spec.frontmatter[key])
  )
  if (differing.length === 0) return []
  return [
    issue(
      spec.path,
      "frontmatter",
      `frontmatter differs from the world on: ${differing.join(", ")}`
    ),
  ]
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

function anchors(context: Context, { spec, body }: WrittenNote): Issue[] {
  const text = normalize(body)
  return spec.states
    .flatMap((id) => context.factsById.get(id) ?? [])
    .flatMap((fact) =>
      fact.anchors
        .filter((anchor) => !text.includes(normalize(anchor)))
        .map((anchor) =>
          issue(
            spec.path,
            "anchor",
            `fact ${fact.id}: anchor "${anchor}" is not in the body`
          )
        )
    )
}

function plannedLinks(context: Context, spec: NoteSpec): NoteSpec[] {
  return spec.links.flatMap(({ target }) => context.notesById.get(target) ?? [])
}

function writtenPaths({ wikilinks }: WrittenNote): Set<string | undefined> {
  return new Set(wikilinks.map(({ path }) => path))
}

function linkIssues(context: Context, note: WrittenNote): Issue[] {
  const { spec, wikilinks } = note
  const written = writtenPaths(note)
  const unresolved = wikilinks
    .filter(({ path }) => path === undefined)
    .map(({ target }) =>
      issue(spec.path, "unresolved-link", `[[${target}]] resolves to no note`)
    )
  const missing = plannedLinks(context, spec)
    .filter((target) => !written.has(target.path))
    .map((target) =>
      issue(spec.path, "link", `no wikilink to "${target.title}"`)
    )
  return [...unresolved, ...missing]
}

function extraLinks(context: Context, note: WrittenNote): Issue[] {
  const { spec } = note
  const planned = new Set(plannedLinks(context, spec).map(({ path }) => path))
  return [...writtenPaths(note)]
    .filter((path) => path !== undefined && !planned.has(path))
    .map((path) =>
      issue(spec.path, "extra-link", `wikilink to "${path}", not in the plan`)
    )
}

function containsWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu"
  ).test(text)
}

function forbiddenTerms({ spec, body }: WrittenNote): Issue[] {
  return spec.forbiddenTerms
    .filter((term) => containsWord(body, term))
    .map((term) =>
      issue(spec.path, "forbidden", `forbidden term "${term}" in the body`)
    )
}

function absentTopics(
  context: Context,
  path: string,
  content: string
): Issue[] {
  return context.world.absent.flatMap(({ topic, forbiddenTerms }) =>
    forbiddenTerms
      .filter((term) => containsWord(content, term))
      .map((term) =>
        issue(
          path,
          "absent-topic",
          `"${term}" belongs to the absent topic "${topic}"`
        )
      )
  )
}

interface Quantity {
  text: string
  /** Equal for two spellings of the same value: "March 15, 2026" and "2026-03-15". */
  key: string
  /** Numbers up to 10 are always allowed. */
  checked: boolean
}

function quantities(text: string): Quantity[] {
  return [...text.matchAll(QUANTITY)].map((match) => {
    const [token] = match
    const { iso, month, day, year } = match.groups!
    if (iso) return { text: token, key: iso, checked: true }
    if (month) {
      const number = String(MONTHS.indexOf(month) + 1).padStart(2, "0")
      const date = day ? `-${day.padStart(2, "0")}` : ""
      return { text: token, key: `${year}-${number}${date}`, checked: true }
    }
    const key = token.replace(/,/g, "")
    const plain = !key.startsWith("$") && !key.endsWith("%")
    return { text: token, key, checked: !plain || Number(key) > 10 }
  })
}

/** An ISO date also covers the month it falls in: "June 2025". */
function coveredKeys(text: string): string[] {
  return quantities(text).flatMap(({ key }) =>
    ISO_DATE.test(key) ? [key, key.slice(0, 7)] : [key]
  )
}

function unplannedNumbers(context: Context, note: WrittenNote): Issue[] {
  const { spec, body } = note
  const written = writtenPaths(note)
  const facts = spec.states.flatMap((id) => context.factsById.get(id) ?? [])
  const linkedTitles = plannedLinks(context, spec)
    .filter((target) => written.has(target.path))
    .map(({ title }) => title)
  const texts = [
    ...facts.flatMap((fact) => [fact.statement, ...fact.anchors]),
    spec.title,
    ...Object.values(spec.frontmatter).flat(),
    spec.context,
    ...linkedTitles,
  ]
  const covered = new Set(texts.flatMap(coveredKeys))
  return quantities(body.replace(WIKILINK, " "))
    .filter(({ checked, key }) => checked && !covered.has(key))
    .map(({ text }) =>
      issue(spec.path, "unplanned-number", `"${text}" is in no planned text`)
    )
}

function namesIn(text: string): string[] {
  return [...text.matchAll(NAME_START)]
    .filter(([, first]) => FIRST_NAMES.includes(first!))
    .map(([, first, last]) => `${first} ${last}`)
}

function knownPeople(world: World): Set<string> {
  return new Set([
    ...world.people.map(({ name }) => name),
    ...world.facts.flatMap(({ statement }) => namesIn(statement)),
  ])
}

function unknownPeople(context: Context, { spec, body }: WrittenNote): Issue[] {
  return [...new Set(namesIn(body))]
    .filter((name) => !context.knownPeople.has(name))
    .map((name) =>
      issue(
        spec.path,
        "unknown-person",
        `"${name}" is not a person of the world`
      )
    )
}

/** Words of the body against the planned range, with some slack. */
function lengthIssues({ spec, body }: WrittenNote): Issue[] {
  const count = body.match(/\S+/g)?.length ?? 0
  const [min, max] = spec.words
  if (count >= 0.8 * min && count <= 1.25 * max) return []
  return [
    issue(spec.path, "length", `${count} words, planned ${min} to ${max}`),
  ]
}
