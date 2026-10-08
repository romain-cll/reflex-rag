import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { BATCH_SIZE, renderBatches } from "./briefs.ts"
import { WorldSchema, type World } from "./schema.ts"

const cliPath = resolve(import.meta.dir, "cli.ts")
const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const HUB_PATH = "Projects/Falcon Hub.md"
const QUOTE_PATH = "Quotes/Helix Quote.md"

const HUB_BODY = [
  "# Falcon Hub",
  "",
  "This hub tracks the Falcon sensor project for Larkspur Devices. The launch date is March 15, 2026, and the supplier details are in [[Helix Quote]].",
].join("\n")

const QUOTE_BODY = [
  "# Helix Quote",
  "",
  "Helix Components quoted $3.85 per sensor board on 2025-06-10. This note belongs to the [[Falcon Hub]] project and was written by Marcus Okafor.",
].join("\n")

function tinyWorld() {
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
    customers: [],
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
    ],
    notes: [
      {
        id: "n1",
        path: HUB_PATH,
        type: "project",
        title: "Falcon Hub",
        date: "2025-02-03",
        author: "p1",
        frontmatter: {
          title: "Falcon Hub",
          type: "project",
          date: "2025-02-03",
        },
        context: "Hub note for the Falcon project.",
        states: ["f2"],
        links: [{ target: "n2", intent: "Point to the supplier price" }],
        forbiddenTerms: [],
        words: [15, 50],
      },
      {
        id: "n2",
        path: QUOTE_PATH,
        type: "quote",
        title: "Helix Quote",
        date: "2025-06-10",
        author: "p1",
        frontmatter: {
          title: "Helix Quote",
          type: "quote",
          date: "2025-06-10",
        },
        context: "Supplier price for the sensor board.",
        states: ["f1"],
        links: [{ target: "n1", intent: "Point back to the project" }],
        forbiddenTerms: [],
        words: [15, 50],
      },
    ],
    traps: [],
    chains: [],
    absent: [],
  })
}

function renderFile(title: string, type: string, date: string, body: string) {
  return `---\ntitle: "${title}"\ntype: "${type}"\ndate: "${date}"\n---\n${body}\n`
}

/** Writes <out>/<name>/world.json and the vault files (path -> content). */
function makeProject(
  files: Record<string, string>,
  world: World = tinyWorld()
): {
  out: string
  name: string
} {
  const out = mkdtempSync(join(tmpdir(), "reflex-validate-"))
  tempDirs.push(out)
  const name = "demo"
  const root = join(out, name)
  mkdirSync(join(root, "vault"), { recursive: true })
  writeFileSync(join(root, "world.json"), JSON.stringify(world, null, 2))
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, "vault", path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return { out, name }
}

function cleanFiles(): Record<string, string> {
  return {
    [HUB_PATH]: renderFile("Falcon Hub", "project", "2025-02-03", HUB_BODY),
    [QUOTE_PATH]: renderFile("Helix Quote", "quote", "2025-06-10", QUOTE_BODY),
  }
}

function runValidate(
  project: { out: string; name: string },
  extra: string[] = []
) {
  const result = Bun.spawnSync(
    ["bun", cliPath, "validate", project.name, "--out", project.out, ...extra],
    { cwd: tmpdir() }
  )
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

/** The count printed for a kind ("2 errors", "errors: 2"), or null. */
function printedCount(stdout: string, kind: "error" | "warning") {
  const match =
    new RegExp(`(\\d+)\\s+${kind}s?\\b`, "i").exec(stdout) ??
    new RegExp(`\\b${kind}s?\\s*[:=]?\\s*(\\d+)`, "i").exec(stdout)
  return match ? Number(match[1]) : null
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe("AC9 — CLI validate", () => {
  test("AC9 — a clean vault exits 0 and prints zero errors and zero warnings", () => {
    const result = runValidate(makeProject(cleanFiles()))
    expect(result.exitCode).toBe(0)
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(printedCount(result.stdout, "warning")).toBe(0)
  }, 30_000)

  test("AC9 — an error exits 1 and prints the note path, the rule and the counts", () => {
    const files = cleanFiles()
    files[QUOTE_PATH] = renderFile(
      "Helix Quote",
      "quote",
      "2025-06-10",
      QUOTE_BODY.replace("$3.85", "a fair price")
    )
    const result = runValidate(makeProject(files))
    expect(result.stdout).toContain(QUOTE_PATH)
    expect(result.stdout).toContain("anchor")
    expect(result.stdout).toContain("$3.85")
    expect(printedCount(result.stdout, "error")).toBe(1)
    expect(printedCount(result.stdout, "warning")).toBe(0)
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — issues are grouped by note path: each path is printed once", () => {
    const files = cleanFiles()
    files[QUOTE_PATH] = renderFile(
      "Helix Quote",
      "quote",
      "2025-06-10",
      "# Helix Quote\n\nThis note belongs to the [[Falcon Hub]] project."
    )
    const result = runValidate(makeProject(files))
    expect(printedCount(result.stdout, "error")).toBe(2)
    expect(occurrences(result.stdout, QUOTE_PATH)).toBe(1)
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — a missing note exits 1 and is reported", () => {
    const files = cleanFiles()
    delete files[QUOTE_PATH]
    const result = runValidate(makeProject(files))
    expect(result.stdout).toContain(QUOTE_PATH)
    expect(result.stdout).toContain("missing")
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — warnings alone exit 0 and are printed with their count", () => {
    const files = cleanFiles()
    files[HUB_PATH] = renderFile(
      "Falcon Hub",
      "project",
      "2025-02-03",
      `${HUB_BODY} Priya Raman reviewed it.`
    )
    const result = runValidate(makeProject(files))
    expect(result.stdout).toContain(HUB_PATH)
    expect(result.stdout).toContain("unknown-person")
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(printedCount(result.stdout, "warning")).toBe(1)
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("AC9 — files under dot folders are skipped", () => {
    const files = {
      ...cleanFiles(),
      ".obsidian/workspace.md": "# Not a note\n",
      "Projects/.drafts/Draft.md": "# Draft\n",
    }
    const result = runValidate(makeProject(files))
    expect(result.stdout).not.toContain("workspace.md")
    expect(result.stdout).not.toContain("Draft.md")
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("AC9 — a markdown file outside the world is an unexpected error", () => {
    const files = { ...cleanFiles(), "Notes/Stray.md": "# Stray\n" }
    const result = runValidate(makeProject(files))
    expect(result.stdout).toContain("Notes/Stray.md")
    expect(result.stdout).toContain("unexpected")
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — --batch batch-01 checks the notes of that batch (a tiny world is a single batch)", () => {
    const files = cleanFiles()
    files[QUOTE_PATH] = renderFile(
      "Helix Quote",
      "quote",
      "2025-06-10",
      QUOTE_BODY.replace("$3.85", "a fair price")
    )
    const result = runValidate(makeProject(files), ["--batch", "batch-01"])
    expect(result.stdout).toContain(QUOTE_PATH)
    expect(result.stdout).toContain("anchor")
    expect(printedCount(result.stdout, "error")).toBe(1)
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — --batch batch-01 on a clean vault exits 0", () => {
    const result = runValidate(makeProject(cleanFiles()), [
      "--batch",
      "batch-01",
    ])
    expect(result.exitCode).toBe(0)
    expect(printedCount(result.stdout, "error")).toBe(0)
  }, 30_000)

  test("AC9 — --batch batch-01 still reports a missing note of the batch", () => {
    const files = cleanFiles()
    delete files[HUB_PATH]
    const result = runValidate(makeProject(files), ["--batch", "batch-01"])
    expect(result.stdout).toContain(HUB_PATH)
    expect(result.stdout).toContain("missing")
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — --batch batch-01 does not report a file outside the world as unexpected", () => {
    const files = { ...cleanFiles(), "Notes/Stray.md": "# Stray\n" }
    const result = runValidate(makeProject(files), ["--batch", "batch-01"])
    expect(result.stdout).not.toContain("unexpected")
    expect(result.stdout).not.toContain("Notes/Stray.md")
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(result.exitCode).toBe(0)
  }, 30_000)
})

// A world of more than BATCH_SIZE notes, so that it splits in several batches.

const MEMO_BODY = "A short memo about the weekly planning of the Falcon team."

function memoPath(index: number): string {
  return `Memos/Memo ${String.fromCharCode(65 + index)}.md`
}

/** tinyWorld plus BATCH_SIZE memos, none of which states a fact or links. */
function bigWorld(): World {
  const world = tinyWorld()
  for (let index = 0; index < BATCH_SIZE; index++) {
    const title = `Memo ${String.fromCharCode(65 + index)}`
    const date = `2025-08-${String(index + 1).padStart(2, "0")}`
    world.notes.push({
      id: `m${index + 1}`,
      path: memoPath(index),
      type: "journal",
      title,
      date,
      author: "p1",
      frontmatter: { title, type: "journal", date },
      context: "A planning memo.",
      states: [],
      links: [],
      forbiddenTerms: [],
      words: [8, 30],
    })
  }
  return world
}

function memoFile(index: number, body = MEMO_BODY): string {
  const title = `Memo ${String.fromCharCode(65 + index)}`
  const date = `2025-08-${String(index + 1).padStart(2, "0")}`
  return renderFile(title, "journal", date, `# ${title}\n\n${body}`)
}

function bigFiles(): Record<string, string> {
  const files = cleanFiles()
  for (let index = 0; index < BATCH_SIZE; index++) {
    files[memoPath(index)] = memoFile(index)
  }
  return files
}

/** The files of bigWorld where the memo at `path` states an unplanned amount. */
function withBrokenMemo(path: string) {
  const index = [...Array(BATCH_SIZE).keys()].find((i) => memoPath(i) === path)
  if (index === undefined) throw new Error(`fixture: ${path} is no memo`)
  const files = bigFiles()
  files[path] = memoFile(index, `${MEMO_BODY} The budget is $48,200 this year.`)
  return { broken: path, files }
}

/** Splits the notes of bigWorld between batch-01 and batch-02 with renderBatches. */
function batchSplit(world: World) {
  const batches = renderBatches(world, BATCH_SIZE)
  const pathsOf = (name: string) => {
    const batch = batches.find((b) => b.name === name)
    if (!batch) throw new Error(`fixture: no ${name}`)
    return world.notes
      .filter(({ id }) => batch.noteIds.includes(id))
      .map(({ path }) => path)
  }
  return { first: pathsOf("batch-01"), second: pathsOf("batch-02") }
}

describe("AC9 — CLI validate --batch on a world of several batches", () => {
  test("AC9 — the fixture world has a batch-01 and a batch-02 with distinct notes", () => {
    const { first, second } = batchSplit(bigWorld())
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    expect(first.filter((path) => second.includes(path))).toEqual([])
  })

  test("AC9 — an error in a batch-02 note is not reported by --batch batch-01, and the exit code is 0", () => {
    const world = bigWorld()
    const { first, second } = batchSplit(world)
    const { broken, files } = withBrokenMemo(second[0]!)
    const project = makeProject(files, world)

    const result = runValidate(project, ["--batch", "batch-01"])
    expect(first).not.toContain(broken)
    expect(result.stdout).not.toContain(broken)
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("AC9 — --batch batch-02 reports that error and exits 1", () => {
    const world = bigWorld()
    const { second } = batchSplit(world)
    const { broken, files } = withBrokenMemo(second[0]!)
    const project = makeProject(files, world)

    const result = runValidate(project, ["--batch", "batch-02"])
    expect(result.stdout).toContain(broken)
    expect(result.stdout).toContain("unplanned-number")
    expect(printedCount(result.stdout, "error")).toBe(1)
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — without --batch the same vault reports that error and exits 1", () => {
    const world = bigWorld()
    const { second } = batchSplit(world)
    const { broken, files } = withBrokenMemo(second[0]!)
    const result = runValidate(makeProject(files, world))
    expect(result.stdout).toContain(broken)
    expect(result.exitCode).toBe(1)
  }, 30_000)

  test("AC9 — an error in a batch-01 note is not reported by --batch batch-02, and the exit code is 0", () => {
    const world = bigWorld()
    const { first, second } = batchSplit(world)
    const files = bigFiles()
    files[QUOTE_PATH] = renderFile(
      "Helix Quote",
      "quote",
      "2025-06-10",
      QUOTE_BODY.replace("$3.85", "a fair price")
    )
    const result = runValidate(makeProject(files, world), [
      "--batch",
      "batch-02",
    ])
    expect(first).toContain(QUOTE_PATH)
    expect(second).not.toContain(QUOTE_PATH)
    expect(result.stdout).not.toContain(QUOTE_PATH)
    expect(printedCount(result.stdout, "error")).toBe(0)
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("AC9 — a missing note of another batch does not make --batch batch-01 fail", () => {
    const world = bigWorld()
    const { second } = batchSplit(world)
    const files = bigFiles()
    delete files[second[0]!]
    const result = runValidate(makeProject(files, world), [
      "--batch",
      "batch-01",
    ])
    expect(result.stdout).not.toContain(second[0]!)
    expect(result.stdout).not.toContain("missing")
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("AC9 — a stray file does not make --batch batch-02 fail either", () => {
    const world = bigWorld()
    const files = { ...bigFiles(), "Notes/Stray.md": "# Stray\n" }
    const result = runValidate(makeProject(files, world), [
      "--batch",
      "batch-02",
    ])
    expect(result.stdout).not.toContain("unexpected")
    expect(result.exitCode).toBe(0)
  }, 30_000)
})
