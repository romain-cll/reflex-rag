import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const scriptPath = resolve(import.meta.dir, "compare-runs.ts")

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-compare-"))
  tempDirs.push(dir)
  return dir
}

const FAILURES = {
  retrieval_miss: 0,
  false_abstention: 0,
  wrong_version: 0,
  missed_contradiction: 0,
  unsupported_claim: 0,
  wrong_answer: 0,
  answer_error: 0,
}

interface Loop {
  meanHops: number | null
  meanRewrites: number | null
  meanJudgeCalls: number | null
  finalRules: Record<string, number>
}

const NO_LOOP: Loop = {
  meanHops: null,
  meanRewrites: null,
  meanJudgeCalls: null,
  finalRules: {},
}

function metrics(
  n: number,
  accuracy: number,
  recall: number | null,
  p50: number,
  p95: number,
  cost: number,
  loop: Loop
) {
  return {
    n,
    accuracy,
    meanRecall: recall,
    latencyP50Ms: p50,
    latencyP95Ms: p95,
    meanCostUsd: cost,
    meanInputTokens: 2000,
    failures: FAILURES,
    ...loop,
  }
}

function settings(config: string, split: string) {
  return {
    config,
    split,
    k: 8,
    models: { answerer: "claude-haiku-5-5", embedder: "mistral-embed" },
    prices: {},
    thresholds: {},
    gitCommit: "abc1234",
    index: { vault: "/vaults/larkspur", notes: 202, chunks: 1534, links: 611 },
  }
}

/** A hand-written run folder: the settings line of the trace and the summary. */
function makeRun(
  name: string,
  runSettings: ReturnType<typeof settings>,
  summary: unknown
): string {
  const dir = join(makeTempDir(), "runs", name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "trace.jsonl"), JSON.stringify(runSettings) + "\n")
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2))
  return dir
}

/** Config A on the test split: 3 simple (2 correct) and 4 temporal (3 correct). */
function runA(): string {
  return makeRun("2026-10-08T10-00-00-000Z-A-test", settings("A", "test"), {
    overall: metrics(7, 5 / 7, 0.75, 1100, 2000, 0.00123, NO_LOOP),
    byCategory: {
      simple: metrics(3, 2 / 3, 1, 900, 1500, 0.001, NO_LOOP),
      temporal: metrics(4, 3 / 4, 0.5, 1300, 2000, 0.0014, NO_LOOP),
    },
  })
}

/** Config B on the test split, same categories. */
function runB(split = "test"): string {
  return makeRun(`2026-10-08T11-00-00-000Z-B-${split}`, settings("B", split), {
    overall: metrics(7, 6 / 7, 0.9, 4200, 9100, 0.01234, {
      meanHops: 1.5,
      meanRewrites: 0.25,
      meanJudgeCalls: 4,
      finalRules: { sufficient: 7 },
    }),
    byCategory: {
      simple: metrics(3, 3 / 3, 1, 3000, 5000, 0.009, {
        meanHops: 0.5,
        meanRewrites: 0,
        meanJudgeCalls: 2,
        finalRules: { sufficient: 3 },
      }),
      temporal: metrics(4, 3 / 4, 0.8, 5000, 9100, 0.0152, {
        meanHops: 2.25,
        meanRewrites: 0.5,
        meanJudgeCalls: 5.5,
        finalRules: { sufficient: 4 },
      }),
    },
  })
}

function compare(args: string[]) {
  const result = Bun.spawnSync(["bun", scriptPath, ...args], {
    cwd: makeTempDir(),
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

/** Runs the script on `args`, which must succeed, and parses its table. */
function tableOf(args: string[]): Table {
  const { stdout, stderr, exitCode } = compare(args)
  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  return parseTable(stdout)
}

interface Table {
  header: string[]
  /** The rows in order, as cells. */
  rows: string[][]
  /** Number of lines of the output that belong to a table. */
  tableLines: number
}

function parseTable(stdout: string): Table {
  const lines = stdout.split("\n").filter((line) => line.startsWith("|"))
  const cells = lines.map((line) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
  )
  const [header, , ...rows] = cells as [string[], string[], ...string[][]]
  return { header, rows, tableLines: lines.length }
}

/** The value of the column of `run` (matched by config and split) on `row`. */
function valueOf(
  table: Table,
  run: { config: string; split: string },
  metric: string,
  row: string
): string {
  const index = columnsOf(table, run, metric)[0]
  expect(index).toBeDefined()
  const cells = table.rows.find((cells) => cells[0] === row)
  expect(cells).toBeDefined()
  return cells![index!]!
}

/**
 * Indexes of the header cells that name `metric` and carry the config and the
 * split of `run`, e.g. "A test correct/n".
 */
function columnsOf(
  table: Table,
  { config, split }: { config: string; split: string },
  metric: string
): number[] {
  const label = new RegExp(`\\b${config}\\b.*\\b${split}\\b`)
  return table.header.flatMap((cell, index) =>
    label.test(cell) && cell.includes(metric) ? [index] : []
  )
}

const A = { config: "A", split: "test" }
const B = { config: "B", split: "test" }

describe("AC6 — compare-runs", () => {
  test("AC6 — prints one markdown table with a row per category, then an overall row", () => {
    const { stdout, stderr, exitCode } = compare([runA(), runB()])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    const table = parseTable(stdout)
    expect(table.rows.map((cells) => cells[0])).toEqual([
      "simple",
      "temporal",
      "overall",
    ])
    // Header, separator and the three rows: a single table.
    expect(table.tableLines).toBe(5)
  })

  test("AC6 — each run has a group of columns labelled with its config and split", () => {
    const table = tableOf([runA(), runB()])
    for (const run of [A, B]) {
      for (const metric of ["correct/n", "recall", "p50", "p95", "cost"]) {
        expect(columnsOf(table, run, metric)).toHaveLength(1)
      }
    }
  })

  test("AC6 — accuracy is shown as correct/n", () => {
    const table = tableOf([runA(), runB()])
    expect(valueOf(table, A, "correct/n", "simple")).toBe("2/3")
    expect(valueOf(table, A, "correct/n", "temporal")).toBe("3/4")
    expect(valueOf(table, A, "correct/n", "overall")).toBe("5/7")
    expect(valueOf(table, B, "correct/n", "simple")).toBe("3/3")
    expect(valueOf(table, B, "correct/n", "overall")).toBe("6/7")
  })

  test("AC6 — recall, latency p50 and p95 and cost per question of each run", () => {
    const table = tableOf([runA(), runB()])
    expect(valueOf(table, A, "recall", "temporal")).toBe("50.0%")
    expect(valueOf(table, A, "recall", "overall")).toBe("75.0%")
    expect(valueOf(table, A, "p50", "overall")).toBe("1100")
    expect(valueOf(table, A, "p95", "overall")).toBe("2000")
    expect(valueOf(table, A, "cost", "overall")).toBe("0.00123")
    expect(valueOf(table, B, "recall", "temporal")).toBe("80.0%")
    expect(valueOf(table, B, "p50", "simple")).toBe("3000")
    expect(valueOf(table, B, "p95", "temporal")).toBe("9100")
    expect(valueOf(table, B, "cost", "overall")).toBe("0.01234")
  })

  test("AC6 — mean hops appears for a loop config only", () => {
    const table = tableOf([runA(), runB()])
    expect(columnsOf(table, A, "hops")).toHaveLength(0)
    expect(columnsOf(table, B, "hops")).toHaveLength(1)
    expect(Number(valueOf(table, B, "hops", "simple"))).toBeCloseTo(0.5, 9)
    expect(Number(valueOf(table, B, "hops", "temporal"))).toBeCloseTo(2.25, 9)
    expect(Number(valueOf(table, B, "hops", "overall"))).toBeCloseTo(1.5, 9)
  })

  test("AC6 — the groups follow the order of the arguments", () => {
    const [dirA, dirB] = [runA(), runB()]
    const ab = tableOf([dirA, dirB])
    const ba = tableOf([dirB, dirA])
    expect(columnsOf(ab, A, "correct/n")[0]!).toBeLessThan(
      columnsOf(ab, B, "correct/n")[0]!
    )
    expect(columnsOf(ba, B, "correct/n")[0]!).toBeLessThan(
      columnsOf(ba, A, "correct/n")[0]!
    )
  })

  test("AC6 — runs on different splits are labelled with their own split", () => {
    const tuningB = { config: "B", split: "tuning" }
    const table = tableOf([runA(), runB("tuning")])
    expect(columnsOf(table, A, "correct/n")).toHaveLength(1)
    expect(columnsOf(table, tuningB, "correct/n")).toHaveLength(1)
    expect(valueOf(table, tuningB, "correct/n", "overall")).toBe("6/7")
  })

  test("AC6 — a single run gives a table with one group of columns", () => {
    const { stdout, exitCode } = compare([runB()])
    expect(exitCode).toBe(0)
    const table = parseTable(stdout)
    expect(columnsOf(table, B, "correct/n")).toHaveLength(1)
    expect(valueOf(table, B, "correct/n", "overall")).toBe("6/7")
  })

  test("AC6 — reads only settings and summary.json, whatever the trace holds after the settings line", () => {
    const dir = runA()
    writeFileSync(
      join(dir, "trace.jsonl"),
      JSON.stringify(settings("A", "test")) +
        "\n" +
        JSON.stringify({ id: "q-001" }) +
        "\n"
    )
    const { exitCode } = compare([dir, runB()])
    expect(exitCode).toBe(0)
  })
})
