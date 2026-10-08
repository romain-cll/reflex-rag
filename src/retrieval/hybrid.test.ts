import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Embedder, Embedding } from "../core/embedder.ts"
import type { ModelCall } from "../core/types.ts"
import { buildIndex } from "../index/build.ts"
import { openIndex, type Index } from "../index/read.ts"
import { parseVault } from "../vault/parse.ts"
import { HybridRetriever } from "./hybrid.ts"

const fixtureVault = join(import.meta.dir, "fixtures", "vault")

/**
 * Seven one-chunk notes (`a.md#0` … `g.md#0`). The chunk vectors below are
 * deliberately not normalized, and `g` is a zero vector.
 *
 * For the query "turbine", BM25 ranks a, b, c (the other chunks do not match).
 * For a query vector of direction (1, 0, 0), cosine ranks d, c, a, e, g, b, f.
 */
const CHUNK_VECTORS: Record<string, number[]> = {
  a: [0.3, 0.4, 0],
  b: [-0.6, 0.8, 0],
  c: [8, 6, 0],
  d: [3, 0, 0],
  e: [0.1, 1, 0],
  f: [-5, 0, 0],
  g: [0, 0, 0],
}

const ALL_IDS = ["a", "b", "c", "d", "e", "f", "g"].map((n) => `${n}.md#0`)

/** Deterministic embedder for the index: the vector depends on the title. */
class IndexEmbedder implements Embedder {
  readonly model = "fake-index-embed"
  readonly dimensions = 3

  embed(texts: string[]): Promise<Embedding> {
    const vectors = texts.map((text) => {
      const title = text.split("\n")[0]!
      return new Float32Array(CHUNK_VECTORS[title]!)
    })
    return Promise.resolve({ vectors, calls: [] })
  }
}

/** Query embedder: one chosen vector per query text, every call recorded. */
class QueryEmbedder implements Embedder {
  readonly model = "fake-query-embed"
  readonly dimensions = 3
  readonly batches: string[][] = []
  readonly returnedCalls: ModelCall[][] = []

  constructor(private readonly vectors: Record<string, number[]>) {}

  embed(texts: string[]): Promise<Embedding> {
    this.batches.push([...texts])
    const calls: ModelCall[] = [
      {
        model: this.model,
        inputTokens: 10 + this.batches.length,
        outputTokens: 0,
        latencyMs: 100 + this.batches.length,
      },
    ]
    this.returnedCalls.push(calls)
    return Promise.resolve({
      vectors: texts.map((text) => new Float32Array(this.vectors[text]!)),
      calls,
    })
  }
}

const QUERY_VECTORS: Record<string, number[]> = {
  // Cosine order: d, c, a, e, g, b, f.
  turbine: [2, 0, 0],
  // Same direction as chunk a.
  harvest: [0.6, 0.8, 0],
  // Matches "turbine" in BM25 (a, b, c); same direction as chunk f.
  "turbine backwards": [-1, 0, 0],
  // No chunk contains this word.
  quasar: [2, 0, 0],
  "zero vector": [0, 0, 0],
}

const BACKWARDS = "turbine backwards"

let dir: string
let dbPath: string
const openedIndexes: Index[] = []

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "reflex-hybrid-test-"))
  dbPath = join(dir, "index.db")
  await buildIndex({
    vault: await parseVault(fixtureVault),
    embedder: new IndexEmbedder(),
    dbPath,
    vaultPath: fixtureVault,
  })
})

afterAll(async () => {
  for (const index of openedIndexes) index.close()
  await rm(dir, { recursive: true, force: true })
})

function open(): Index {
  const index = openIndex(dbPath)
  openedIndexes.push(index)
  return index
}

function setup(options?: { candidates?: number; rrfK?: number }) {
  const index = open()
  const embedder = new QueryEmbedder(QUERY_VECTORS)
  const retriever = new HybridRetriever(index, embedder, options)
  return { index, embedder, retriever }
}

function rrf(k: number, ...ranks: number[]): number {
  return ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0)
}

function ids(result: { chunks: { chunk: { id: string } }[] }): string[] {
  return result.chunks.map((item) => item.chunk.id)
}

describe("AC1 — candidates", () => {
  test("AC1 — the BM25 ranks follow searchBM25, the vector ranks follow the cosine order", async () => {
    const { index, retriever } = setup()
    const result = await retriever.retrieve("turbine", 10)

    const bm25 = index.searchBM25("turbine", 50).map((r) => r.chunk.id)
    expect(bm25).toEqual(["a.md#0", "b.md#0", "c.md#0"])
    const byId = new Map(result.chunks.map((item) => [item.chunk.id, item]))
    bm25.forEach((id, i) => expect(byId.get(id)!.bm25Rank).toBe(i + 1))

    const vector = ["d", "c", "a", "e", "g", "b", "f"].map((n) => `${n}.md#0`)
    vector.forEach((id, i) => expect(byId.get(id)!.vectorRank).toBe(i + 1))
  })

  test("AC1 — each item carries the full chunk of the index", async () => {
    const { index, retriever } = setup()
    const result = await retriever.retrieve("turbine", 10)

    const first = result.chunks[0]!
    expect(first.chunk).toEqual(index.chunksOf("a.md")[0]!)
    expect(first.chunk.text).toContain("Turbine turbine turbine")
  })

  test("AC1 — candidates defaults to 50: every chunk of a small index is a vector candidate", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("turbine", 100)

    expect(result.chunks.every((item) => item.vectorRank !== null)).toBe(true)
  })

  test("AC1 — the candidates option limits both lists", async () => {
    const { retriever } = setup({ candidates: 2 })
    const result = await retriever.retrieve("turbine", 10)

    // BM25 list: a, b. Vector list: d, c. Nothing else is a candidate.
    expect(ids(result).sort()).toEqual(["a.md#0", "b.md#0", "c.md#0", "d.md#0"])
    const byId = new Map(result.chunks.map((item) => [item.chunk.id, item]))
    expect(byId.get("a.md#0")).toMatchObject({ bm25Rank: 1, vectorRank: null })
    expect(byId.get("b.md#0")).toMatchObject({ bm25Rank: 2, vectorRank: null })
    expect(byId.get("d.md#0")).toMatchObject({ bm25Rank: null, vectorRank: 1 })
    expect(byId.get("c.md#0")).toMatchObject({ bm25Rank: null, vectorRank: 2 })
  })
})

describe("AC2 — fusion", () => {
  test("AC2 — score is the sum of 1 / (60 + rank) over the lists, sorted highest first", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("turbine", 10)

    // [id, bm25Rank, vectorRank]
    const expected: [string, number | null, number][] = [
      ["a.md#0", 1, 3],
      ["c.md#0", 3, 2],
      ["b.md#0", 2, 6],
      ["d.md#0", null, 1],
      ["e.md#0", null, 4],
      ["g.md#0", null, 5],
      ["f.md#0", null, 7],
    ]
    expect(
      result.chunks.map((item) => [
        item.chunk.id,
        item.bm25Rank,
        item.vectorRank,
      ])
    ).toEqual(expected)
    result.chunks.forEach((item, i) => {
      const [, bm25, vector] = expected[i]!
      const ranks = [bm25, vector].filter((r): r is number => r !== null)
      expect(item.score).toBeCloseTo(rrf(60, ...ranks), 12)
    })
  })

  test("AC2 — the rrfK option replaces 60", async () => {
    const { retriever } = setup({ rrfK: 1 })
    const result = await retriever.retrieve("turbine", 10)

    const byId = new Map(result.chunks.map((item) => [item.chunk.id, item]))
    expect(byId.get("a.md#0")!.score).toBeCloseTo(rrf(1, 1, 3), 12)
    expect(byId.get("b.md#0")!.score).toBeCloseTo(rrf(1, 2, 6), 12)
    expect(byId.get("d.md#0")!.score).toBeCloseTo(rrf(1, 1), 12)
    expect(byId.get("f.md#0")!.score).toBeCloseTo(rrf(1, 7), 12)
    // With a small constant the top ranks weigh more: d now beats b.
    expect(ids(result).slice(0, 4)).toEqual([
      "a.md#0",
      "c.md#0",
      "d.md#0",
      "b.md#0",
    ])
  })

  test("AC2 — results are cut to k", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("turbine", 2)

    expect(ids(result)).toEqual(["a.md#0", "c.md#0"])
  })

  test("AC2 — equal scores are ordered by chunk id, whichever list the chunk comes from", async () => {
    // BM25 list: a. Vector list: f. Both score 1 / 61, a comes first.
    const first = setup({ candidates: 1 })
    const bm25First = await first.retriever.retrieve(BACKWARDS, 10)
    expect(ids(bm25First)).toEqual(["a.md#0", "f.md#0"])
    expect(bm25First.chunks[0]!.score).toBe(bm25First.chunks[1]!.score)

    // BM25 list: d. Vector list: a. Both score 1 / 61, a comes first.
    const second = setup({ candidates: 1 })
    const vectorFirst = await second.retriever.retrieve("harvest", 10)
    expect(ids(vectorFirst)).toEqual(["a.md#0", "d.md#0"])
    expect(vectorFirst.chunks[0]!.score).toBe(vectorFirst.chunks[1]!.score)
  })

  test("AC2 — ties are also ordered by id inside a longer ranking, and k cuts after the tie-break", async () => {
    // BM25 list: a, b. Vector list: d, c. Scores: a = d > b = c.
    const { retriever } = setup({ candidates: 2 })
    const result = await retriever.retrieve("turbine", 10)
    expect(ids(result)).toEqual(["a.md#0", "d.md#0", "b.md#0", "c.md#0"])

    const cut = await retriever.retrieve("turbine", 3)
    expect(ids(cut)).toEqual(["a.md#0", "d.md#0", "b.md#0"])
  })
})

describe("AC3 — cosine", () => {
  test("AC3 — vectors need not be normalized: the order depends on the angle, not the length", async () => {
    // c = (8, 6, 0) is much longer than a = (0.3, 0.4, 0), but a points the
    // same way as the query: the vector list must put a first, then c.
    const { retriever } = setup()
    const result = await retriever.retrieve("harvest", 10)

    const byId = new Map(result.chunks.map((item) => [item.chunk.id, item]))
    expect(byId.get("a.md#0")!.vectorRank).toBe(1)
    expect(byId.get("c.md#0")!.vectorRank).toBe(2)
    // d = (3, 0, 0) is longer than e = (0.1, 1, 0) but points elsewhere.
    expect(byId.get("e.md#0")!.vectorRank).toBe(3)
    expect(byId.get("d.md#0")!.vectorRank).toBe(4)
    // Scaling a query changes nothing: "turbine" is (2, 0, 0).
    const turbine = await retriever.retrieve("turbine", 10)
    const first = turbine.chunks.find((item) => item.vectorRank === 1)!
    expect(first.chunk.id).toBe("d.md#0")
  })

  test("AC3 — a zero chunk vector has similarity 0: between a positive and a negative similarity", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("turbine", 10)

    const byId = new Map(result.chunks.map((item) => [item.chunk.id, item]))
    // e has a small positive similarity, g (zero vector) 0, b a negative one.
    expect(byId.get("e.md#0")!.vectorRank).toBe(4)
    expect(byId.get("g.md#0")!.vectorRank).toBe(5)
    expect(byId.get("b.md#0")!.vectorRank).toBe(6)
    for (const item of result.chunks) {
      expect(Number.isFinite(item.score)).toBe(true)
    }
  })

  test("AC3 — a zero query vector gives every chunk a finite score and a vector rank", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("zero vector", 10)

    expect(result.chunks).toHaveLength(ALL_IDS.length)
    for (const item of result.chunks) {
      expect(Number.isFinite(item.score)).toBe(true)
      expect(item.vectorRank).not.toBeNull()
    }
    expect(
      result.chunks.map((item) => item.vectorRank).sort((x, y) => x! - y!)
    ).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe("AC4 — calls", () => {
  test("AC4 — retrieve embeds the query with exactly one embed([query]) call", async () => {
    const { embedder, retriever } = setup()
    await retriever.retrieve("turbine", 5)

    expect(embedder.batches).toEqual([["turbine"]])
  })

  test("AC4 — calls are the ModelCalls returned by that embed call", async () => {
    const { embedder, retriever } = setup()
    const result = await retriever.retrieve("turbine", 5)

    expect(result.calls).toEqual(embedder.returnedCalls[0]!)
    expect(result.calls).toHaveLength(1)
  })

  test("AC4 — each retrieve makes its own embed call and returns its own calls", async () => {
    const { embedder, retriever } = setup()
    const first = await retriever.retrieve("turbine", 5)
    const second = await retriever.retrieve("harvest", 5)

    expect(embedder.batches).toEqual([["turbine"], ["harvest"]])
    expect(first.calls).toEqual(embedder.returnedCalls[0]!)
    expect(second.calls).toEqual(embedder.returnedCalls[1]!)
    expect(second.calls).not.toEqual(first.calls)
  })
})

describe("AC5 — edge cases", () => {
  test("AC5 — fewer than k chunks found: all of them are returned", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("turbine", 100)

    expect(result.chunks).toHaveLength(ALL_IDS.length)
    expect(ids(result).sort()).toEqual(ALL_IDS)
  })

  test("AC5 — fewer than k chunks found with a small candidates limit", async () => {
    const { retriever } = setup({ candidates: 2 })
    const result = await retriever.retrieve("turbine", 100)

    expect(result.chunks).toHaveLength(4)
  })

  test("AC5 — a query with no BM25 match still returns the vector candidates", async () => {
    const { retriever } = setup()
    const result = await retriever.retrieve("quasar", 10)

    expect(ids(result)).toEqual(
      ["d", "c", "a", "e", "g", "b", "f"].map((n) => `${n}.md#0`)
    )
    result.chunks.forEach((item, i) => {
      expect(item.bm25Rank).toBeNull()
      expect(item.vectorRank).toBe(i + 1)
      expect(item.score).toBeCloseTo(rrf(60, i + 1), 12)
    })
  })

  test("AC5 — a query with no BM25 match respects k and candidates", async () => {
    const { retriever } = setup({ candidates: 3 })
    const result = await retriever.retrieve("quasar", 10)

    expect(ids(result)).toEqual(["d.md#0", "c.md#0", "a.md#0"])
  })
})

describe("AC6 — loading", () => {
  /** The index with a counter on `embeddings()`. */
  function spied() {
    const index = open()
    const counter = { embeddings: 0 }
    const spy: Index = {
      ...index,
      embeddings() {
        counter.embeddings++
        return index.embeddings()
      },
    }
    return { spy, counter }
  }

  test("AC6 — embeddings() is read once across two retrieve calls", async () => {
    const { spy, counter } = spied()
    const retriever = new HybridRetriever(spy, new QueryEmbedder(QUERY_VECTORS))

    const first = await retriever.retrieve("turbine", 5)
    const second = await retriever.retrieve("harvest", 5)

    expect(counter.embeddings).toBe(1)
    expect(ids(first)).toEqual([
      "a.md#0",
      "c.md#0",
      "b.md#0",
      "d.md#0",
      "e.md#0",
    ])
    expect(ids(second).slice(0, 2)).toEqual(["d.md#0", "a.md#0"])
  })
})
