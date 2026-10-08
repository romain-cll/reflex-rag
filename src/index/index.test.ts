import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test"
import { cp, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Embedder, Embedding } from "../core/embedder.ts"
import type { Chunk, Link, ModelCall } from "../core/types.ts"
import { parseVault, type ParsedVault } from "../vault/parse.ts"
import { buildIndex } from "./build.ts"
import { openIndex } from "./read.ts"

const fixtureVault = join(import.meta.dir, "fixtures", "vault")

const VENDORS = "procurement/vendors.md"
const PAYMENTS = "finance/payments.md"
const TEMPLATE = "templates/Contract template.md"

const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** Deterministic embedder: the vector is a function of the text alone. */
class FakeEmbedder implements Embedder {
  readonly model = "fake-embed"
  readonly dimensions = 8
  /** The texts received by each call to `embed`. */
  readonly batches: string[][] = []
  /** The `calls` returned by each call to `embed`. */
  readonly returnedCalls: ModelCall[][] = []

  embed(texts: string[]): Promise<Embedding> {
    this.batches.push([...texts])
    const calls: ModelCall[] = [
      {
        model: this.model,
        inputTokens: texts.reduce((n, t) => n + t.split(/\s+/).length, 0),
        outputTokens: 0,
        latencyMs: 3,
      },
    ]
    this.returnedCalls.push(calls)
    return Promise.resolve({
      vectors: texts.map((text) => this.vectorOf(text)),
      calls,
    })
  }

  vectorOf(text: string): Float32Array {
    const vector = new Float32Array(this.dimensions)
    for (let i = 0; i < this.dimensions; i++) {
      let acc = i + 1
      for (const char of text) acc = (acc * 31 + char.codePointAt(0)!) % 100003
      vector[i] = acc / 100003
    }
    return vector
  }
}

const tempDirs: string[] = []
const openedIndexes: { close(): void }[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "reflex-index-test-"))
  tempDirs.push(dir)
  return dir
}

function open(dbPath: string) {
  const index = openIndex(dbPath)
  openedIndexes.push(index)
  return index
}

function closeIndexes() {
  for (const index of openedIndexes.splice(0)) index.close()
}

afterEach(closeIndexes)

afterAll(async () => {
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

async function build(vault: ParsedVault, dbPath: string, vaultPath = "/vault") {
  const embedder = new FakeEmbedder()
  const result = await buildIndex({ vault, embedder, dbPath, vaultPath })
  return { embedder, result }
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function embeddingInput(vault: ParsedVault, chunk: Chunk): string {
  const title = vault.notes.find((n) => n.path === chunk.notePath)!.title
  return chunk.heading === ""
    ? `${title}\n\n${chunk.text}`
    : `${title}\n${chunk.heading}\n\n${chunk.text}`
}

/** `embeddings()` is read as a map from chunk id to vector (Map or record). */
function embeddingMap(raw: unknown): Map<string, Float32Array> {
  if (raw instanceof Map) return new Map(raw as Map<string, Float32Array>)
  return new Map(Object.entries(raw as Record<string, Float32Array>))
}

function leafValues(value: unknown): unknown[] {
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(leafValues)
  }
  return [value]
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries: Record<string, string> = {}
  const glob = new Bun.Glob("**/*")
  for await (const rel of glob.scan({
    cwd: dir,
    dot: true,
    onlyFiles: false,
  })) {
    const full = join(dir, rel)
    const info = await stat(full)
    const content = info.isDirectory() ? "<dir>" : await Bun.file(full).text()
    entries[rel] = `${info.mtimeMs}|${content}`
  }
  return entries
}

let vault: ParsedVault
let dbPath: string
let embedder: FakeEmbedder
let built: Awaited<ReturnType<typeof buildIndex>>
let before: number
let after: number

beforeAll(async () => {
  vault = await parseVault(fixtureVault)
  dbPath = join(await tempDir(), "shared.db")
  before = Date.now()
  ;({ embedder, result: built } = await build(vault, dbPath, fixtureVault))
  after = Date.now()
})

describe("AC1 — fresh build", () => {
  test("AC1 — writes a database at dbPath and creates missing parent folders", async () => {
    const path = join(await tempDir(), "deep", "er", "index.db")
    await build(vault, path)
    expect(await Bun.file(path).exists()).toBe(true)
    expect(open(path).getNote(VENDORS)).not.toBeNull()
  })

  test("AC1 — replaces a file already at dbPath", async () => {
    const path = join(await tempDir(), "index.db")
    await writeFile(path, "this is not a database")
    await build(vault, path)
    const index = open(path)
    expect(index.getNote(VENDORS)).not.toBeNull()
    expect(index.chunksOf(VENDORS).length).toBeGreaterThan(0)
  })

  test("AC1 — replaces the content of a previous index", async () => {
    const path = join(await tempDir(), "index.db")
    const stale: ParsedVault = {
      notes: [
        {
          path: "stale.md",
          title: "Stale",
          date: null,
          summary: "Old note.",
          frontmatter: {},
        },
      ],
      chunks: [
        { id: "stale.md#0", notePath: "stale.md", heading: "", text: "Old." },
      ],
      links: [],
      unresolved: [],
    }
    await build(stale, path)
    await build(vault, path)
    const index = open(path)
    expect(index.getNote("stale.md")).toBeNull()
    expect(index.chunksOf("stale.md")).toEqual([])
    expect(index.getNote(VENDORS)).not.toBeNull()
    expect(embeddingMap(index.embeddings()).has("stale.md#0")).toBe(false)
  })
})

describe("AC2 — notes", () => {
  test("AC2 — returns the parsed note by its path", () => {
    const expected = vault.notes.find((n) => n.path === VENDORS)
    expect(expected?.title).toBe("Vendor onboarding")
    expect(open(dbPath).getNote(VENDORS)).toEqual(expected!)
  })

  test("AC2 — returns the note with its frontmatter, date and summary", () => {
    const note = open(dbPath).getNote(VENDORS)
    expect(note?.date).toBe("2026-02-10")
    expect(note?.summary).toBe("How new suppliers are approved.")
    expect(note?.frontmatter).toEqual({
      title: "Vendor onboarding",
      date: "2026-02-10",
      summary: "How new suppliers are approved.",
      tags: ["procurement"],
    })
  })

  test("AC2 — returns the note by its title, ignoring case", () => {
    const index = open(dbPath)
    const expected = vault.notes.find((n) => n.path === VENDORS)!
    expect(index.getNote("Vendor onboarding")).toEqual(expected)
    expect(index.getNote("vENDOR ONBOARDING")).toEqual(expected)
  })

  test("AC2 — returns a note whose title comes from its file name", () => {
    const expected = vault.notes.find((n) => n.path === TEMPLATE)!
    expect(open(dbPath).getNote("contract TEMPLATE")).toEqual(expected)
  })

  test("AC2 — returns null when there is no such note", () => {
    const index = open(dbPath)
    expect(index.getNote("nowhere.md")).toBeNull()
    expect(index.getNote("No such title")).toBeNull()
  })
})

describe("AC3 — chunks", () => {
  test("AC3 — returns the chunks of a note in document order", () => {
    const expected = vault.chunks.filter((c) => c.notePath === VENDORS)
    expect(expected.map((c) => c.heading)).toEqual(["", "Checks", "Approval"])
    expect(open(dbPath).chunksOf(VENDORS)).toEqual(expected)
  })

  test("AC3 — returns the chunks of every note with id, note path, heading and text", () => {
    const index = open(dbPath)
    for (const note of vault.notes) {
      expect(index.chunksOf(note.path)).toEqual(
        vault.chunks.filter((c) => c.notePath === note.path)
      )
    }
  })

  test("AC3 — keeps nested headings joined in the chunk heading", () => {
    const chunks = open(dbPath).chunksOf(PAYMENTS)
    expect(chunks.map((c) => c.heading)).toEqual([
      "Payments",
      "Payments > Refunds",
    ])
  })
})

describe("AC4 — links", () => {
  test("AC4 — returns the outgoing links of a note in document order", () => {
    const expected = vault.links.filter((l) => l.sourcePath === VENDORS)
    expect(expected.map((l) => l.targetPath)).toEqual([
      PAYMENTS,
      TEMPLATE,
      PAYMENTS,
    ])
    expect(open(dbPath).outgoingLinks(VENDORS)).toEqual(expected)
  })

  test("AC4 — returns links with id, source path, target path and label", () => {
    const [first] = open(dbPath).outgoingLinks(VENDORS)
    expect(first).toEqual({
      id: expect.any(String) as string,
      sourcePath: VENDORS,
      targetPath: PAYMENTS,
      label: "See Payments for the money side.",
    })
  })

  test("AC4 — returns the resolved links that target a note as backlinks", () => {
    const expected = vault.links.filter((l) => l.targetPath === PAYMENTS)
    expect(expected.map((l) => l.sourcePath).sort()).toEqual([
      VENDORS,
      VENDORS,
      TEMPLATE,
    ])
    const backlinks: Link[] = open(dbPath).backlinks(PAYMENTS)
    expect(byId(backlinks)).toEqual(byId(expected))
  })

  test("AC4 — returns no backlink for a note nobody links to", () => {
    expect(open(dbPath).backlinks("nowhere.md")).toEqual([])
  })

  test("AC4 — does not store unresolved links", () => {
    const index = open(dbPath)
    const all = vault.notes.flatMap((n) => index.outgoingLinks(n.path))
    expect(all).toHaveLength(vault.links.length)
    expect(index.outgoingLinks(PAYMENTS).map((l) => l.targetPath)).toEqual([
      VENDORS,
      TEMPLATE,
    ])
  })

  test("AC4 — buildIndex returns the number of unresolved links", () => {
    expect(vault.unresolved).toHaveLength(2)
    expect(built.unresolved).toBe(2)
  })

  test("AC4 — buildIndex returns the counts of notes, chunks and links", () => {
    expect(built.notes).toBe(vault.notes.length)
    expect(built.chunks).toBe(vault.chunks.length)
    expect(built.links).toBe(vault.links.length)
  })
})

describe("AC5 — embeddings", () => {
  test("AC5 — embeds every chunk once through a single embed call", () => {
    expect(embedder.batches).toHaveLength(1)
    expect(embedder.batches[0]).toHaveLength(vault.chunks.length)
  })

  test("AC5 — embeds the note title, the heading and the chunk text", () => {
    const expected = vault.chunks.map((c) => embeddingInput(vault, c)).sort()
    expect([...embedder.batches[0]!].sort()).toEqual(expected)
  })

  test("AC5 — leaves the heading line out when the heading is empty", () => {
    const intro = vault.chunks.find(
      (c) => c.notePath === VENDORS && c.heading === ""
    )!
    const text = `Vendor onboarding\n\n${intro.text}`
    expect(embedder.batches[0]).toContain(text)
    expect(embedder.batches[0]).toContain(
      `Vendor onboarding\nChecks\n\n${vault.chunks.find((c) => c.heading === "Checks")!.text}`
    )
  })

  test("AC5 — embeddings() returns the vector the embedder returned for each chunk id", () => {
    const vectors = embeddingMap(open(dbPath).embeddings())
    expect([...vectors.keys()].sort()).toEqual(
      vault.chunks.map((c) => c.id).sort()
    )
    for (const chunk of vault.chunks) {
      const vector = vectors.get(chunk.id)
      expect(vector).toBeInstanceOf(Float32Array)
      expect(vector).toEqual(embedder.vectorOf(embeddingInput(vault, chunk)))
    }
  })

  test("AC5 — buildIndex returns the embedder's calls", () => {
    expect(embedder.returnedCalls).toHaveLength(1)
    expect(built.calls).toEqual(embedder.returnedCalls[0]!)
  })
})

describe("AC6 — BM25 search", () => {
  const checks = () => vault.chunks.find((c) => c.heading === "Checks")!

  test("AC6 — finds `validate the vendor` from `validated vendors` through stemming", () => {
    expect(checks().text).toContain("validate the vendor")
    const results = open(dbPath).searchBM25("validated vendors", 5)
    expect(results.map((r) => r.chunk)).toContainEqual(checks())
    expect(results[0]!.chunk).toEqual(checks())
    expect(typeof results[0]!.score).toBe("number")
  })

  test("AC6 — returns at most k results", () => {
    const index = open(dbPath)
    expect(index.searchBM25("vendor", 2)).toHaveLength(2)
    expect(index.searchBM25("vendor", 1)).toHaveLength(1)
    expect(index.searchBM25("vendor", 100).length).toBeGreaterThan(2)
  })

  test("AC6 — ranks the best match first", () => {
    const results = open(dbPath).searchBM25("contract", 10)
    expect(results.length).toBeGreaterThan(1)
    expect(results[0]!.chunk.notePath).toBe(TEMPLATE)
    const scores = results.map((r) => r.score)
    const ascending = scores.every((s, i) => i === 0 || s >= scores[i - 1]!)
    const descending = scores.every((s, i) => i === 0 || s <= scores[i - 1]!)
    expect(ascending || descending).toBe(true)
  })

  test("AC6 — matches when any word of the query matches", () => {
    const results = open(dbPath).searchBM25("validated zebra", 5)
    expect(results.map((r) => r.chunk)).toContainEqual(checks())
  })

  test("AC6 — searches the note title", () => {
    const results = open(dbPath).searchBM25("onboarding", 10)
    expect(results.map((r) => r.chunk.id).sort()).toEqual(
      vault.chunks
        .filter((c) => c.notePath === VENDORS)
        .map((c) => c.id)
        .sort()
    )
  })

  test("AC6 — searches the chunk heading", () => {
    const results = open(dbPath).searchBM25("refunds", 10)
    expect(results.map((r) => r.chunk.heading)).toEqual(["Payments > Refunds"])
  })

  test("AC6 — returns nothing when no word matches", () => {
    expect(open(dbPath).searchBM25("zebra", 5)).toEqual([])
  })

  for (const query of [
    '"',
    '"validate',
    "-vendor",
    "vendor:",
    "vendor*",
    "(vendor",
    "vendor)",
    "title:vendor",
    "NEAR(",
    '"a" "b',
    "vendor-onboarding",
  ]) {
    test(`AC6 — never raises on the query ${JSON.stringify(query)}`, () => {
      const results = open(dbPath).searchBM25(query, 5)
      expect(Array.isArray(results)).toBe(true)
    })
  }

  test("AC6 — ignores punctuation and syntax characters around the words", () => {
    const results = open(dbPath).searchBM25('"validate" -vendor: (checks)*', 5)
    expect(results.map((r) => r.chunk)).toContainEqual(checks())
  })

  test("AC6 — returns nothing for a query made only of punctuation", () => {
    expect(open(dbPath).searchBM25('"-:*()', 5)).toEqual([])
  })
})

describe("AC7 — metadata", () => {
  test("AC7 — holds the vault path, embedder model and dimensions", () => {
    const values = leafValues(open(dbPath).meta())
    expect(values).toContain(fixtureVault)
    expect(values).toContain(embedder.model)
    expect(values).toContain(embedder.dimensions)
  })

  test("AC7 — holds the counts of notes, chunks, links and unresolved links", () => {
    const values = leafValues(open(dbPath).meta())
    expect(values).toContain(vault.notes.length)
    expect(values).toContain(vault.chunks.length)
    expect(values).toContain(vault.links.length)
    expect(values).toContain(vault.unresolved.length)
  })

  test("AC7 — holds the build time as an ISO 8601 date", () => {
    const times = leafValues(open(dbPath).meta()).filter(
      (v): v is string => typeof v === "string" && ISO_8601.test(v)
    )
    expect(times).toHaveLength(1)
    const time = Date.parse(times[0]!)
    expect(time).toBeGreaterThanOrEqual(before - 1000)
    expect(time).toBeLessThanOrEqual(after + 1000)
  })
})

describe("AC8 — vault untouched", () => {
  test("AC8 — leaves every file and folder of the vault unchanged", async () => {
    const copy = join(await tempDir(), "vault")
    await cp(fixtureVault, copy, { recursive: true })
    await writeFile(join(copy, ".hidden.md"), "# Hidden\n")
    const beforeBuild = await snapshot(copy)
    expect(Object.keys(beforeBuild).length).toBeGreaterThan(5)

    const copyVault = await parseVault(copy)
    await build(copyVault, join(await tempDir(), "index.db"), copy)

    expect(await snapshot(copy)).toEqual(beforeBuild)
  })
})

describe("AC9 — rebuild", () => {
  function dump(path: string) {
    const index = open(path)
    return {
      notes: vault.notes.map((n) => index.getNote(n.path)),
      chunks: vault.notes.map((n) => index.chunksOf(n.path)),
      outgoing: vault.notes.map((n) => index.outgoingLinks(n.path)),
      backlinks: vault.notes.map((n) => byId(index.backlinks(n.path))),
      search: ["validated vendors", "contract", "payments refunds"].map((q) =>
        index.searchBM25(q, 10)
      ),
      embeddings: [...embeddingMap(index.embeddings())].sort(([a], [b]) =>
        a < b ? -1 : 1
      ),
    }
  }

  test("AC9 — building twice into the same dbPath gives the same index", async () => {
    const path = join(await tempDir(), "index.db")
    await build(vault, path)
    const first = dump(path)
    closeIndexes()
    const { result } = await build(vault, path)
    const second = dump(path)

    expect(second).toEqual(first)
    expect(second.embeddings).toHaveLength(vault.chunks.length)
    expect(result.chunks).toBe(vault.chunks.length)
    const links = vault.notes.flatMap((n) => open(path).outgoingLinks(n.path))
    expect(links).toHaveLength(vault.links.length)
  })
})
