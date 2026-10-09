import { afterAll, describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { CATEGORIES, type Category } from "../evals/schema.ts"
// A namespace import: `FAILURE_INFO` exists once the eval-run revision 3 is
// implemented; until then only the tests that read it fail.
import * as grading from "../src/eval/grade.ts"

const scriptPath = resolve(import.meta.dir, "results-table.ts")

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-results-"))
  tempDirs.push(dir)
  return dir
}

// ---------------------------------------------------------------------------
// Fixtures: hand-written run folders
// ---------------------------------------------------------------------------

/** The failure ids in the order of docs/features/eval-run.md, AC11 and AC12. */
const FAILURE_IDS = [
  "loop_error",
  "context_budget",
  "judge_rejected",
  "not_followed",
  "retrieval_miss",
  "answer_error",
  "false_abstention",
  "wrong_version",
  "missed_contradiction",
  "unsupported_claim",
  "wrong_answer",
] as const

const RETRIEVAL_IDS = FAILURE_IDS.slice(0, 5)

const CATEGORY_N: Record<Category, number> = {
  simple: 12,
  multi_hop: 15,
  temporal: 12,
  contradiction: 11,
  no_answer: 10,
}

interface RunSpec {
  name: string
  config: "A" | "B"
  split: "test" | "tuning"
  commit: string
  /** Correct answers by category. */
  correct: Record<Category, number>
  contextComplete: number
  precision: number
  recall: number
  costUsd: number
  p50: number
  p95: number
  notesInContext: number
  inputTokens: number
  abstentions: { loop: number; answerer: number }
  loop: {
    hops: number
    rewrites: number
    judgeCalls: number
    rules: Record<string, number>
  } | null
  /** Offset of the failure counts, so that every run has its own. */
  failureSeed: number
}

function failuresOf(spec: RunSpec): Record<string, number> {
  return Object.fromEntries(
    FAILURE_IDS.map((id, index) => [
      id,
      ((index * 3 + spec.failureSeed) % 5) + 1,
    ])
  )
}

function familyCounts(spec: RunSpec) {
  const failures = failuresOf(spec)
  const retrieval = RETRIEVAL_IDS.reduce((sum, id) => sum + failures[id]!, 0)
  const total = Object.values(failures).reduce((sum, count) => sum + count, 0)
  return { retrieval, answer: total - retrieval }
}

function metricsOf(
  spec: RunSpec,
  n: number,
  correct: number,
  category: Category | null
) {
  return {
    n,
    accuracy: correct / n,
    meanRecall: category === "no_answer" ? null : spec.recall,
    latencyP50Ms: spec.p50,
    latencyP95Ms: spec.p95,
    meanCostUsd: spec.costUsd,
    meanInputTokens: spec.inputTokens,
    failures: failuresOf(spec),
    meanHops: spec.loop?.hops ?? null,
    meanRewrites: spec.loop?.rewrites ?? null,
    meanJudgeCalls: spec.loop?.judgeCalls ?? null,
    finalRules: spec.loop?.rules ?? {},
    contextCompleteRate: category === "no_answer" ? null : spec.contextComplete,
    meanPrecision: spec.precision,
    meanNotesInContext: spec.notesInContext,
    failuresByFamily: familyCounts(spec),
    abstentions: spec.abstentions,
  }
}

function totalN(): number {
  return Object.values(CATEGORY_N).reduce((sum, n) => sum + n, 0)
}

function totalCorrect(spec: RunSpec): number {
  return Object.values(spec.correct).reduce((sum, n) => sum + n, 0)
}

function summaryOf(spec: RunSpec) {
  return {
    overall: metricsOf(spec, totalN(), totalCorrect(spec), null),
    byCategory: Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        metricsOf(spec, CATEGORY_N[category], spec.correct[category], category),
      ])
    ),
  }
}

/**
 * Writes the run folder: the settings line, two record lines that no one
 * should parse, and the summary. No report.md.
 */
function writeRun(parent: string, spec: RunSpec): string {
  const dir = join(parent, spec.name)
  mkdirSync(dir, { recursive: true })
  const settings = {
    config: spec.config,
    split: spec.split,
    k: 5,
    candidates: 50,
    gitCommit: spec.commit,
    models: { answerer: "claude-haiku-5-5", embedder: "mistral-embed" },
    prices: {},
    thresholds: {},
    index: { vault: "/vaults/larkspur", notes: 202, chunks: 1534, links: 611 },
  }
  writeFileSync(
    join(dir, "trace.jsonl"),
    [
      JSON.stringify(settings),
      '{"id":"q-001","this record is not read',
      "not json at all",
    ].join("\n") + "\n"
  )
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summaryOf(spec)))
  return dir
}

const A_TEST: RunSpec = {
  name: "2026-10-08T19-34-26-262Z-A-test",
  config: "A",
  split: "test",
  commit: "aaa1111",
  correct: {
    simple: 12,
    multi_hop: 2,
    temporal: 8,
    contradiction: 10,
    no_answer: 10,
  },
  contextComplete: 0.8,
  precision: 0.5,
  recall: 0.75,
  costUsd: 0.00025,
  p50: 2100,
  p95: 4000,
  notesInContext: 4.5,
  inputTokens: 1682,
  abstentions: { loop: 0, answerer: 10 },
  loop: null,
  failureSeed: 0,
}

/** An older run of the same config and split, which the default selection skips. */
const A_TEST_OLD: RunSpec = {
  ...A_TEST,
  name: "2026-10-08T19-06-36-566Z-A-test",
  commit: "old0001",
  correct: {
    simple: 5,
    multi_hop: 0,
    temporal: 4,
    contradiction: 3,
    no_answer: 9,
  },
  failureSeed: 2,
}

const A_TUNING: RunSpec = {
  ...A_TEST,
  name: "2026-10-08T19-40-00-000Z-A-tuning",
  split: "tuning",
  commit: "aaa2222",
  correct: {
    simple: 11,
    multi_hop: 3,
    temporal: 9,
    contradiction: 9,
    no_answer: 7,
  },
  contextComplete: 0.7,
  precision: 0.4,
  recall: 0.65,
  abstentions: { loop: 0, answerer: 7 },
  failureSeed: 1,
}

const B_TEST: RunSpec = {
  name: "2026-10-09T08-15-00-000Z-B-test",
  config: "B",
  split: "test",
  commit: "bbb3333",
  correct: {
    simple: 12,
    multi_hop: 10,
    temporal: 10,
    contradiction: 11,
    no_answer: 8,
  },
  contextComplete: 0.9,
  precision: 0.6,
  recall: 0.95,
  costUsd: 0.0031,
  p50: 5200,
  p95: 9100,
  notesInContext: 3.5,
  inputTokens: 1200,
  abstentions: { loop: 5, answerer: 3 },
  loop: { hops: 1.5, rewrites: 0.5, judgeCalls: 4, rules: { sufficient: 40 } },
  failureSeed: 3,
}

const B_TUNING: RunSpec = {
  ...B_TEST,
  name: "2026-10-09T09-00-00-000Z-B-tuning",
  split: "tuning",
  commit: "bbb4444",
  correct: {
    simple: 12,
    multi_hop: 11,
    temporal: 11,
    contradiction: 11,
    no_answer: 9,
  },
  contextComplete: 0.95,
  precision: 0.65,
  abstentions: { loop: 6, answerer: 2 },
  failureSeed: 4,
}

const B_TUNING_OLD: RunSpec = {
  ...B_TUNING,
  name: "2026-10-08T22-00-00-000Z-B-tuning",
  commit: "old0002",
  failureSeed: 1,
}

/** The runs of the default selection: the latest of each config and split. */
const LATEST = [A_TEST, A_TUNING, B_TEST, B_TUNING]

// ---------------------------------------------------------------------------
// Running the script and reading its page
// ---------------------------------------------------------------------------

/** A temporary working directory with a `runs/` folder holding `specs`. */
function workdir(specs: RunSpec[]): { cwd: string; runs: string[] } {
  const cwd = makeTempDir()
  const runs = specs.map((spec) => writeRun(join(cwd, "runs"), spec))
  mkdirSync(join(cwd, "runs"), { recursive: true })
  return { cwd, runs }
}

function runScript(cwd: string, args: string[], env?: Record<string, string>) {
  const result = Bun.spawnSync(["bun", scriptPath, ...args], {
    cwd,
    env: env ?? cleanEnv(),
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

/** No API key, and a proxy to a closed port: a request would fail at once. */
function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  delete env.ANTHROPIC_API_KEY
  delete env.MISTRAL_API_KEY
  env.HTTPS_PROXY = "http://127.0.0.1:9"
  env.HTTP_PROXY = "http://127.0.0.1:9"
  return env
}

const DEFAULT_PAGE = ["docs", "results", "RESULTS.md"]

/** Runs the script, which must succeed, and returns the page it wrote. */
function generate(cwd: string, args: string[] = []): string {
  const { stderr, exitCode } = runScript(cwd, args)
  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  const out = args.includes("--out")
    ? resolve(cwd, args[args.indexOf("--out") + 1]!)
    : join(cwd, ...DEFAULT_PAGE)
  expect(existsSync(out)).toBe(true)
  return readFileSync(out, "utf8")
}

interface Table {
  header: string[]
  rows: string[][]
  /** Index of the first and of the last line of the table in the page. */
  start: number
  end: number
}

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim())
}

/** The markdown tables of the page, in order. */
function tablesOf(page: string): Table[] {
  const lines = page.split("\n")
  const tables: Table[] = []
  let index = 0
  while (index < lines.length) {
    if (!lines[index]!.trimStart().startsWith("|")) {
      index++
      continue
    }
    const start = index
    while (index < lines.length && lines[index]!.trimStart().startsWith("|")) {
      index++
    }
    const [header, , ...rows] = lines.slice(start, index).map(cellsOf) as [
      string[],
      string[],
      ...string[][],
    ]
    tables.push({ header, rows, start, end: index - 1 })
  }
  return tables
}

function threeTables(page: string): [Table, Table, Table] {
  const tables = tablesOf(page)
  expect(tables).toHaveLength(3)
  return tables as [Table, Table, Table]
}

/** The index of the first header cell that matches. */
function column(table: Table, pattern: RegExp): number {
  return table.header.findIndex((cell) => pattern.test(cell))
}

function clean(cell: string): string {
  return cell.replace(/[`*_]/g, "").trim()
}

/** The row of the main table for the config and the split of `spec`. */
function rowOf(table: Table, spec: RunSpec): string[] {
  const config = column(table, /^config/i)
  const split = column(table, /^split/i)
  expect(config).toBeGreaterThanOrEqual(0)
  expect(split).toBeGreaterThanOrEqual(0)
  const row = table.rows.find(
    (cells) =>
      clean(cells[config]!) === spec.config &&
      clean(cells[split]!) === spec.split
  )
  expect(row).toBeDefined()
  return row!
}

/** The runs in the order of the rows of the main table. */
function orderOf(table: Table, specs: RunSpec[]): RunSpec[] {
  const config = column(table, /^config/i)
  const split = column(table, /^split/i)
  return table.rows.map((cells) => {
    const spec = specs.find(
      (candidate) =>
        candidate.config === clean(cells[config]!) &&
        candidate.split === clean(cells[split]!)
    )
    expect(spec).toBeDefined()
    return spec!
  })
}

/** Whether `text` shows a rate, as a percentage (`80%`, `80.0%`) or as a decimal (`0.8`). */
function showsRate(text: string, value: number): boolean {
  const percent = Math.round(value * 100)
  const asPercent = new RegExp(`(^|[^\\d.])${percent}(\\.0+)?\\s?%`)
  const decimal = value.toString().replace(/^0/, "").replace(".", "\\.")
  const asDecimal = new RegExp(`(^|[^\\d.])0?${decimal}0*(?!\\d)`)
  return asPercent.test(text) || asDecimal.test(text)
}

function normalized(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// ---------------------------------------------------------------------------
// AC1 — command
// ---------------------------------------------------------------------------

describe("AC1 — command", () => {
  test("AC1 — writes docs/results/RESULTS.md under the working directory by default", () => {
    const { cwd } = workdir(LATEST)
    const { stderr, exitCode } = runScript(cwd, [])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    const page = join(cwd, ...DEFAULT_PAGE)
    expect(existsSync(page)).toBe(true)
    expect(readFileSync(page, "utf8").trim()).not.toBe("")
  })

  test("AC1 — --out writes the page to the given file and not to the default one", () => {
    const { cwd } = workdir(LATEST)
    const page = generate(cwd, ["--out", "elsewhere.md"])
    expect(threeTables(page)).toHaveLength(3)
    expect(existsSync(join(cwd, ...DEFAULT_PAGE))).toBe(false)
  })

  test("AC1 — --out accepts an absolute path", () => {
    const { cwd } = workdir(LATEST)
    const target = join(makeTempDir(), "absolute.md")
    const { stderr, exitCode } = runScript(cwd, ["--out", target])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(existsSync(target)).toBe(true)
  })

  test("AC1 — without run directories, takes the most recent run of each config and split", () => {
    const { cwd } = workdir([
      A_TEST_OLD,
      B_TUNING_OLD,
      A_TEST,
      A_TUNING,
      B_TEST,
      B_TUNING,
    ])
    const page = generate(cwd)
    const [main] = threeTables(page)
    expect(main.rows).toHaveLength(4)
    for (const spec of LATEST) {
      const row = rowOf(main, spec)
      expect(row.join(" ")).toContain(spec.commit)
    }
    for (const old of [A_TEST_OLD, B_TUNING_OLD]) {
      expect(page).not.toContain(old.commit)
      expect(page).not.toContain(old.name)
    }
  })

  test("AC1 — the most recent run is the one with the latest date in its folder name, not the last created", () => {
    // The older run is written last.
    const { cwd } = workdir([A_TEST, A_TEST_OLD])
    const page = generate(cwd)
    const [main] = threeTables(page)
    expect(main.rows).toHaveLength(1)
    expect(page).toContain(A_TEST.commit)
    expect(page).not.toContain(A_TEST_OLD.commit)
  })

  test("AC1 — a config or split with a single run is taken as it is", () => {
    const { cwd } = workdir([A_TEST, B_TUNING])
    const [main] = threeTables(generate(cwd))
    expect(main.rows).toHaveLength(2)
    expect(rowOf(main, A_TEST).join(" ")).toContain("aaa1111")
    expect(rowOf(main, B_TUNING).join(" ")).toContain("bbb4444")
  })

  test("AC1 — explicit run directories replace the default selection, whatever their age", () => {
    const { cwd, runs } = workdir(LATEST.concat(A_TEST_OLD))
    const oldDir = runs[4]!
    const bTestDir = runs[2]!
    const page = generate(cwd, [oldDir, bTestDir])
    const [main] = threeTables(page)
    expect(main.rows).toHaveLength(2)
    expect(rowOf(main, A_TEST_OLD).join(" ")).toContain("old0001")
    expect(rowOf(main, B_TEST).join(" ")).toContain("bbb3333")
    expect(page).not.toContain("aaa1111")
    expect(page).not.toContain("bbb4444")
  })

  test("AC1 — explicit run directories can live outside runs/", () => {
    const cwd = makeTempDir()
    const elsewhere = makeTempDir()
    const dir = writeRun(elsewhere, A_TEST)
    const page = generate(cwd, ["--out", "page.md", dir])
    const [main] = threeTables(page)
    expect(main.rows).toHaveLength(1)
    expect(page).toContain(A_TEST.name)
  })

  test("AC1 — options and run directories combine", () => {
    const { cwd, runs } = workdir(LATEST)
    const page = generate(cwd, ["--out", "mixed.md", runs[0]!, runs[2]!])
    expect(threeTables(page)[0].rows).toHaveLength(2)
  })

  test("AC1 — rows are ordered by config then split, whatever the order of the arguments", () => {
    const { cwd, runs } = workdir(LATEST)
    // B tuning, A tuning, B test, A test.
    const shuffled = [runs[3]!, runs[1]!, runs[2]!, runs[0]!]
    const [main] = threeTables(generate(cwd, shuffled))
    const order = orderOf(main, LATEST)
    expect(order.map((spec) => spec.config)).toEqual(["A", "A", "B", "B"])
    // The two splits of a config are never interleaved with the other config.
    expect(new Set(order.slice(0, 2).map((spec) => spec.split)).size).toBe(2)
    expect(new Set(order.slice(2).map((spec) => spec.split)).size).toBe(2)
    // Same order from the default selection.
    const defaultOrder = orderOf(threeTables(generate(cwd))[0], LATEST)
    expect(defaultOrder.map((spec) => spec.name)).toEqual(
      order.map((spec) => spec.name)
    )
  })
})

// ---------------------------------------------------------------------------
// AC2 — main table
// ---------------------------------------------------------------------------

describe("AC2 — main table", () => {
  const page = () => generate(workdir(LATEST).cwd)

  test("AC2 — the page opens with the main table before the category and failure tables", () => {
    const [main, categories, failures] = threeTables(page())
    expect(main.start).toBeLessThan(categories.start)
    expect(categories.start).toBeLessThan(failures.start)
    expect(column(main, /^config/i)).toBeGreaterThanOrEqual(0)
    expect(column(categories, /^category/i)).toBeGreaterThanOrEqual(0)
    expect(column(failures, /family/i)).toBeGreaterThanOrEqual(0)
  })

  test("AC2 — the headline columns come first, in order", () => {
    const [main] = threeTables(page())
    const headline = [
      column(main, /^config/i),
      column(main, /^split/i),
      column(main, /date/i),
      column(main, /commit/i),
      column(main, /^(n|questions?)$/i),
      column(main, /context complete/i),
      column(main, /precision/i),
      column(main, /cost/i),
      column(main, /p50/i),
      column(main, /accuracy/i),
    ]
    for (const index of headline) expect(index).toBeGreaterThanOrEqual(0)
    expect([...headline].sort((a, b) => a - b)).toEqual(headline)
    expect(new Set(headline).size).toBe(headline.length)
    // The cost of the headline is per question, not the total.
    expect(main.header[column(main, /cost/i)]!).not.toMatch(/total/i)
    // The first columns are the headline: nothing else slips in between.
    expect(headline[0]).toBe(0)
  })

  test("AC2 — the other columns follow the headline", () => {
    const [main] = threeTables(page())
    const accuracy = column(main, /accuracy/i)
    const others: [string, RegExp][] = [
      ["recall", /recall/i],
      ["notes in the context", /notes/i],
      ["answerer input tokens", /input tokens/i],
      ["latency p95", /p95/i],
      ["total cost", /total/i],
      ["retrieval failures", /retrieval/i],
      ["answer failures", /answer failures?/i],
      ["abstentions", /abstention/i],
      ["hops", /hops/i],
      ["rewrites", /rewrites/i],
      ["judge calls", /judge calls?/i],
    ]
    for (const [label, pattern] of others) {
      const index = column(main, pattern)
      expect({ label, found: index >= 0 }).toEqual({ label, found: true })
      expect({ label, afterHeadline: index > accuracy }).toEqual({
        label,
        afterHeadline: true,
      })
    }
  })

  test("AC2 — config, split, date and commit of each run", () => {
    const [main] = threeTables(page())
    const date = column(main, /date/i)
    const commit = column(main, /commit/i)
    const dates: [RunSpec, string][] = [
      [A_TEST, "2026-10-08"],
      [A_TUNING, "2026-10-08"],
      [B_TEST, "2026-10-09"],
      [B_TUNING, "2026-10-09"],
    ]
    for (const [spec, day] of dates) {
      const row = rowOf(main, spec)
      expect(row[date]!).toContain(day)
      expect(row[commit]!).toContain(spec.commit)
    }
  })

  test("AC2 — the date is the one of the run folder name", () => {
    // Settings carry no date: it can only come from the folder name.
    const { cwd } = workdir([A_TEST, B_TEST])
    const [main] = threeTables(generate(cwd))
    expect(rowOf(main, A_TEST)[column(main, /date/i)]!).toContain("2026-10-08")
    expect(rowOf(main, B_TEST)[column(main, /date/i)]!).toContain("2026-10-09")
  })

  test("AC2 — number of questions and accuracy as correct/n with its percentage", () => {
    const [main] = threeTables(page())
    const n = column(main, /^(n|questions?)$/i)
    const accuracy = column(main, /accuracy/i)
    const expected: [RunSpec, string, number][] = [
      [A_TEST, "42/60", 0.7],
      [A_TUNING, "39/60", 0.65],
      [B_TEST, "51/60", 0.85],
      [B_TUNING, "54/60", 0.9],
    ]
    for (const [spec, ratio, rate] of expected) {
      const row = rowOf(main, spec)
      expect(row[n]!).toBe("60")
      expect(row[accuracy]!).toContain(ratio)
      expect(showsRate(row.slice(accuracy, accuracy + 2).join(" "), rate)).toBe(
        true
      )
    }
  })

  test("AC2 — context complete rate, precision, cost per question and latency p50", () => {
    const [main] = threeTables(page())
    for (const spec of LATEST) {
      const row = rowOf(main, spec)
      expect(
        showsRate(row[column(main, /context complete/i)]!, spec.contextComplete)
      ).toBe(true)
      expect(showsRate(row[column(main, /precision/i)]!, spec.precision)).toBe(
        true
      )
      expect(row[column(main, /p50/i)]!).toMatch(
        new RegExp(
          `${spec.p50}|${(spec.p50 / 1000).toFixed(1)}|${Math.floor(spec.p50 / 1000)},${String(spec.p50 % 1000).padStart(3, "0")}`
        )
      )
      expect(row[column(main, /cost/i)]!).toMatch(/\d/)
    }
    // The cost per question of config A is 0.00025 USD: a few tenths of a
    // thousandth, whatever the number of decimals.
    const cost = rowOf(main, A_TEST)[column(main, /cost/i)]!
    expect(Number(cost.replace(/[^0-9.]/g, ""))).toBeCloseTo(0.00025, 4)
  })

  test("AC2 — recall, notes in the context, input tokens and latency p95", () => {
    const [main] = threeTables(page())
    const row = rowOf(main, A_TEST)
    expect(showsRate(row[column(main, /recall/i)]!, 0.75)).toBe(true)
    expect(row[column(main, /notes/i)]!).toContain("4.5")
    expect(row[column(main, /input tokens/i)]!).toMatch(/1,?682|1\.7k/)
    expect(row[column(main, /p95/i)]!).toMatch(/4000|4\.0|4,000/)
  })

  test("AC2 — total cost is the cost per question times the questions", () => {
    const [main] = threeTables(page())
    const total = rowOf(main, B_TEST)[column(main, /total/i)]!
    // 60 questions at 0.0031 USD.
    expect(Number(total.replace(/[^0-9.]/g, ""))).toBeCloseTo(0.186, 2)
  })

  test("AC2 — retrieval failures and answer failures as counts of the families", () => {
    const [main] = threeTables(page())
    for (const spec of LATEST) {
      const row = rowOf(main, spec)
      const { retrieval, answer } = familyCounts(spec)
      expect(row[column(main, /retrieval/i)]!).toBe(String(retrieval))
      expect(row[column(main, /answer failures?/i)]!).toBe(String(answer))
    }
  })

  test("AC2 — correct abstentions on no-answer questions as correct/n, with the loop's and the answerer's counts", () => {
    const [main] = threeTables(page())
    const cells = (spec: RunSpec) => {
      const row = rowOf(main, spec)
      return main.header
        .flatMap((cell, index) =>
          /abstention/i.test(cell) ? [row[index]!] : []
        )
        .join(" ")
    }
    expect(cells(A_TEST)).toContain("10/10")
    expect(cells(A_TUNING)).toContain("7/10")
    const b = cells(B_TEST)
    expect(b).toContain("8/10")
    expect(b).toMatch(/(^|\D)5(\D|$)/)
    expect(b).toMatch(/(^|\D)3(\D|$)/)
    const bTuning = cells(B_TUNING)
    expect(bTuning).toContain("9/10")
    expect(bTuning).toMatch(/(^|\D)6(\D|$)/)
    expect(bTuning).toMatch(/(^|\D)2(\D|$)/)
  })

  test("AC2 — hops, rewrites and judge calls are empty for config A", () => {
    const [main] = threeTables(page())
    const columns = [/hops/i, /rewrites/i, /judge calls?/i].map((pattern) =>
      column(main, pattern)
    )
    for (const spec of [A_TEST, A_TUNING]) {
      const row = rowOf(main, spec)
      for (const index of columns) expect(row[index]!).toBe("")
    }
  })

  test("AC2 — hops, rewrites and judge calls of a loop config", () => {
    const [main] = threeTables(page())
    for (const spec of [B_TEST, B_TUNING]) {
      const row = rowOf(main, spec)
      expect(row[column(main, /hops/i)]!).toMatch(/^1\.5/)
      expect(row[column(main, /rewrites/i)]!).toMatch(/^0\.5/)
      expect(row[column(main, /judge calls?/i)]!).toMatch(/^4(\.0+)?$/)
    }
  })
})

// ---------------------------------------------------------------------------
// AC3 — per category
// ---------------------------------------------------------------------------

describe("AC3 — per category", () => {
  const specs = LATEST
  const pageAndTables = () => {
    const { cwd } = workdir(specs)
    const page = generate(cwd)
    return threeTables(page)
  }

  test("AC3 — one row per category, in the order of the schema", () => {
    const [, categories] = pageAndTables()
    expect(
      categories.rows
        .slice(0, CATEGORIES.length)
        .map((row) => normalized(row[0]!))
    ).toEqual(CATEGORIES.map(normalized))
  })

  test("AC3 — each run has a column group of context complete rate, context precision and accuracy", () => {
    const [, categories] = pageAndTables()
    const header = categories.header.join(" | ")
    const count = (pattern: RegExp) => header.match(pattern)?.length ?? 0
    expect(count(/context complete/gi)).toBe(specs.length)
    expect(count(/precision/gi)).toBe(specs.length)
    expect(count(/accuracy/gi)).toBe(specs.length)
  })

  test("AC3 — the groups are labelled with the config and the split of their run", () => {
    const [main, categories] = pageAndTables()
    const header = categories.header.join(" | ")
    for (const spec of orderOf(main, specs)) {
      expect(header).toMatch(
        new RegExp(`\\b${spec.config}\\b[^|]*${spec.split}`)
      )
    }
  })

  test("AC3 — accuracy as correct/n for each category and each run, in the order of the main table", () => {
    const [main, categories] = pageAndTables()
    const order = orderOf(main, specs)
    CATEGORIES.forEach((category, index) => {
      const row = categories.rows[index]!
      const ratios = [...(row.join(" ").match(/\d+\/\d+/g) ?? [])]
      expect(ratios).toEqual(
        order.map((spec) => `${spec.correct[category]}/${CATEGORY_N[category]}`)
      )
    })
  })

  test("AC3 — context complete rate and precision of each run", () => {
    const [, categories] = pageAndTables()
    const simple = categories.rows[0]!.join(" ")
    for (const spec of specs) {
      expect(showsRate(simple, spec.contextComplete)).toBe(true)
      expect(showsRate(simple, spec.precision)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// AC4 — failures
// ---------------------------------------------------------------------------

describe("AC4 — failures", () => {
  const tables = () => threeTables(generate(workdir(LATEST).cwd))

  test("AC4 — one row per failure type, retrieval family first, in the order of FAILURES", () => {
    const [, , failures] = tables()
    expect(failures.rows).toHaveLength(FAILURE_IDS.length)
    expect([...grading.FAILURES]).toEqual([...FAILURE_IDS])
    failures.rows.forEach((row, index) => {
      const id = normalized(FAILURE_IDS[index]!)
      expect(row.some((cell) => normalized(cell) === id)).toBe(true)
    })
  })

  test("AC4 — each row has the family, the type and the lever from FAILURE_INFO", () => {
    const [, , failures] = tables()
    const info = grading.FAILURE_INFO as Record<
      string,
      { family: string; lever: string }
    >
    failures.rows.forEach((row, index) => {
      const id = FAILURE_IDS[index]!
      const entry = info[id]!
      expect(entry).toBeDefined()
      expect(row.some((cell) => clean(cell) === entry.family)).toBe(true)
      expect(row.some((cell) => clean(cell).includes(entry.lever))).toBe(true)
    })
  })

  test("AC4 — the header names the family, the type and the lever", () => {
    const [, , failures] = tables()
    const header = failures.header.join(" | ")
    expect(header).toMatch(/family/i)
    expect(header).toMatch(/type|failure/i)
    expect(header).toMatch(/lever/i)
  })

  test("AC4 — one count column per run, in the order of the main table", () => {
    const [main, , failures] = tables()
    const order = orderOf(main, LATEST)
    const counts = failures.header.length - 3
    expect(counts).toBe(order.length)
    failures.rows.forEach((row, index) => {
      const id = FAILURE_IDS[index]!
      expect(row.slice(-order.length)).toEqual(
        order.map((spec) => String(failuresOf(spec)[id]))
      )
    })
  })

  test("AC4 — the column headers label the runs by config and split", () => {
    const [main, , failures] = tables()
    const labels = failures.header.slice(-LATEST.length)
    orderOf(main, LATEST).forEach((spec, index) => {
      expect(labels[index]!).toMatch(
        new RegExp(`\\b${spec.config}\\b[^|]*${spec.split}`)
      )
    })
  })
})

// ---------------------------------------------------------------------------
// AC5 — provenance
// ---------------------------------------------------------------------------

describe("AC5 — provenance", () => {
  test("AC5 — under each table, the run directories it was built from", () => {
    const { cwd } = workdir(LATEST.concat([A_TEST_OLD, B_TUNING_OLD]))
    const page = generate(cwd)
    const lines = page.split("\n")
    const tables = tablesOf(page)
    expect(tables).toHaveLength(3)
    tables.forEach((table, index) => {
      const next = tables[index + 1]?.start ?? lines.length
      const below = lines.slice(table.end + 1, next).join("\n")
      for (const spec of LATEST) expect(below).toContain(spec.name)
      for (const old of [A_TEST_OLD, B_TUNING_OLD]) {
        expect(below).not.toContain(old.name)
      }
    })
  })

  test("AC5 — explicit run directories are the ones listed", () => {
    const { cwd, runs } = workdir(LATEST.concat(A_TEST_OLD))
    const page = generate(cwd, [runs[4]!, runs[2]!])
    const lines = page.split("\n")
    const tables = tablesOf(page)
    tables.forEach((table, index) => {
      const next = tables[index + 1]?.start ?? lines.length
      const below = lines.slice(table.end + 1, next).join("\n")
      expect(below).toContain(basename(runs[4]!))
      expect(below).toContain(basename(runs[2]!))
      expect(below).not.toContain(A_TUNING.name)
    })
  })

  test("AC5 — the page states that it is generated and must not be edited by hand", () => {
    const page = generate(workdir(LATEST).cwd)
    expect(page).toMatch(/generated/i)
    expect(page).toMatch(/(do not|don't|must not|never|not be)\b[^\n]*\bedit/i)
    expect(page).toMatch(/\bby hand\b|\bmanually\b/i)
  })
})

// ---------------------------------------------------------------------------
// AC6 — no model call
// ---------------------------------------------------------------------------

describe("AC6 — no model call", () => {
  test("AC6 — runs without any API key and with the network unreachable", () => {
    const { cwd } = workdir(LATEST)
    const { stderr, exitCode } = runScript(cwd, [], cleanEnv())
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(existsSync(join(cwd, ...DEFAULT_PAGE))).toBe(true)
  })

  test("AC6 — reads the settings line and summary.json only: the record lines may be unreadable and report.md is absent", () => {
    const { cwd, runs } = workdir(LATEST)
    for (const dir of runs) {
      expect(readdirSync(dir).sort()).toEqual(["summary.json", "trace.jsonl"])
    }
    const page = generate(cwd)
    expect(threeTables(page)[0].rows).toHaveLength(4)
  })

  test("AC6 — writes only the page: the run folders are left untouched", () => {
    const { cwd, runs } = workdir(LATEST)
    const before = runs.map((dir) =>
      readFileSync(join(dir, "summary.json"), "utf8")
    )
    generate(cwd)
    expect(
      runs.map((dir) => readFileSync(join(dir, "summary.json"), "utf8"))
    ).toEqual(before)
    for (const dir of runs) {
      expect(readdirSync(dir).sort()).toEqual(["summary.json", "trace.jsonl"])
    }
  })
})
