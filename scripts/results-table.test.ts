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
  config: "A" | "B" | "C"
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
  /** Abstentions of the `no_answer` category: the ones the main table shows. */
  abstentions: { loop: number; answerer: number }
  /** Abstentions over all the questions: distinct, they must not be shown. */
  overallAbstentions: { loop: number; answerer: number }
  /** Summary without a `no_answer` category. */
  withoutNoAnswer?: boolean
  loop: {
    hops: number
    rewrites: number
    judgeCalls: number
    rules: Record<string, number>
  } | null
  /** Offset of the failure counts, so that every run has its own. */
  failureSeed: number
  /** The share of judged notes, and of questions, judged again; `null` for a run without a fallback. */
  fallback?: { noteRate: number; questionRate: number }
  /** Median and mean wall-clock time of each stage, and mean cost of each role. */
  stage?: StageProfile
  /** A summary from before the stage and fallback metrics: it has none of their fields. */
  legacy?: boolean
  /**
   * The retrieval measures of the summary (Revision 2): cost per question and
   * latency percentiles without the answerer. Absent from the summaries written
   * before them, `null` for a run whose records could not give them.
   */
  retrieval?: {
    costUsd: number | null
    p50: number | null
    p95: number | null
  }
  /**
   * The `loop` part of the settings line (Revision 3): absent from the settings
   * of a run without a loop. `fallbackLow` is absent for A and B, a threshold
   * for C, `null` for C without fallback; `fallbackWhen` is only recorded with
   * a threshold.
   */
  loopSettings?: {
    maxHops?: number
    fallbackLow?: number | null
    fallbackWhen?: "uncertain" | "nothing-kept" | "no-answer"
  }
}

const STAGES = ["searchMs", "judgeMs", "fallbackMs", "rewriteMs", "answerMs"]
const ROLES = ["embed", "judge", "fallback", "rewrite", "answer"]

interface StageProfile {
  medianMs: Record<(typeof STAGES)[number], number>
  meanMs: Record<(typeof STAGES)[number], number>
  costUsd: Record<(typeof ROLES)[number], number>
}

const NO_STAGE: StageProfile = {
  medianMs: {
    searchMs: 0,
    judgeMs: 0,
    fallbackMs: 0,
    rewriteMs: 0,
    answerMs: 0,
  },
  meanMs: {
    searchMs: 0,
    judgeMs: 0,
    fallbackMs: 0,
    rewriteMs: 0,
    answerMs: 0,
  },
  costUsd: { embed: 0, judge: 0, fallback: 0, rewrite: 0, answer: 0 },
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
    abstentions:
      category === "no_answer"
        ? spec.abstentions
        : category === null
          ? spec.overallAbstentions
          : { loop: 17, answerer: 19 },
    ...(spec.legacy
      ? {}
      : {
          fallbackNoteRate: spec.fallback?.noteRate ?? null,
          fallbackQuestionRate: spec.fallback?.questionRate ?? null,
          stageMedianMs: (spec.stage ?? NO_STAGE).medianMs,
          stageMeanMs: (spec.stage ?? NO_STAGE).meanMs,
          costByRole: (spec.stage ?? NO_STAGE).costUsd,
        }),
    ...(spec.legacy || !spec.retrieval
      ? {}
      : {
          meanRetrievalCostUsd: spec.retrieval.costUsd,
          retrievalP50Ms: spec.retrieval.p50,
          retrievalP95Ms: spec.retrieval.p95,
        }),
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
      CATEGORIES.filter(
        (category) => !(spec.withoutNoAnswer && category === "no_answer")
      ).map((category) => [
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
    ...(spec.loopSettings ? { loop: spec.loopSettings } : {}),
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
  retrieval: { costUsd: 0.00005, p50: 400, p95: 900 },
  notesInContext: 4.5,
  inputTokens: 1682,
  abstentions: { loop: 0, answerer: 10 },
  overallAbstentions: { loop: 0, answerer: 13 },
  loop: null,
  failureSeed: 0,
  stage: {
    medianMs: {
      searchMs: 85,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 1900,
    },
    meanMs: {
      searchMs: 97,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 2050,
    },
    costUsd: {
      embed: 0.0002,
      judge: 0,
      fallback: 0,
      rewrite: 0,
      answer: 0.0021,
    },
  },
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
  retrieval: { costUsd: 0.00006, p50: 410, p95: 950 },
  abstentions: { loop: 0, answerer: 7 },
  overallAbstentions: { loop: 0, answerer: 16 },
  failureSeed: 1,
  stage: {
    medianMs: {
      searchMs: 92,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 1650,
    },
    meanMs: {
      searchMs: 104,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 1720,
    },
    costUsd: {
      embed: 0.0003,
      judge: 0,
      fallback: 0,
      rewrite: 0,
      answer: 0.0018,
    },
  },
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
  retrieval: { costUsd: 0.0011, p50: 2500, p95: 6200 },
  notesInContext: 3.5,
  inputTokens: 1200,
  abstentions: { loop: 5, answerer: 3 },
  overallAbstentions: { loop: 11, answerer: 14 },
  loop: { hops: 1.5, rewrites: 0.5, judgeCalls: 4, rules: { sufficient: 40 } },
  failureSeed: 3,
  stage: {
    medianMs: {
      searchMs: 310,
      judgeMs: 2400,
      fallbackMs: 0,
      rewriteMs: 640,
      answerMs: 1750,
    },
    meanMs: {
      searchMs: 330,
      judgeMs: 2650,
      fallbackMs: 0,
      rewriteMs: 880,
      answerMs: 1810,
    },
    costUsd: {
      embed: 0.0004,
      judge: 0.0016,
      fallback: 0,
      rewrite: 0.0007,
      answer: 0.0027,
    },
  },
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
  retrieval: { costUsd: 0.0012, p50: 2600, p95: 6300 },
  abstentions: { loop: 6, answerer: 2 },
  overallAbstentions: { loop: 12, answerer: 15 },
  failureSeed: 4,
}

const B_TUNING_OLD: RunSpec = {
  ...B_TUNING,
  name: "2026-10-08T22-00-00-000Z-B-tuning",
  commit: "old0002",
  failureSeed: 1,
}

/** A loop run whose summary has no `no_answer` category. */
const B_NO_NO_ANSWER: RunSpec = {
  ...B_TEST,
  name: "2026-10-09T10-00-00-000Z-B-test",
  commit: "bbb5555",
  withoutNoAnswer: true,
}

/** Config C: the system-one judge with its fallback. */
const C_TEST: RunSpec = {
  ...B_TEST,
  name: "2026-10-09T11-00-00-000Z-C-test",
  config: "C",
  commit: "ccc6666",
  failureSeed: 2,
  retrieval: { costUsd: 0.0006, p50: 1400, p95: 3100 },
  fallback: { noteRate: 0.35, questionRate: 0.6 },
  stage: {
    medianMs: {
      searchMs: 290,
      judgeMs: 520,
      fallbackMs: 0,
      rewriteMs: 610,
      answerMs: 1710,
    },
    meanMs: {
      searchMs: 305,
      judgeMs: 575,
      fallbackMs: 940,
      rewriteMs: 690,
      answerMs: 1760,
    },
    costUsd: {
      embed: 0.0005,
      judge: 0.0008,
      fallback: 0.0012,
      rewrite: 0.0006,
      answer: 0.0024,
    },
  },
}

/** A second run of config B on the test split, from another commit. */
const B_TEST_OTHER_COMMIT: RunSpec = {
  ...B_TEST,
  name: "2026-10-09T12-00-00-000Z-B-test",
  commit: "bbb7777",
  failureSeed: 1,
}

/** A run whose summary predates the stage and fallback metrics. */
const B_LEGACY: RunSpec = {
  ...B_TEST,
  name: "2026-10-07T08-00-00-000Z-B-test",
  commit: "leg0001",
  legacy: true,
}

/** A run whose records gave no retrieval measure: the summary holds them as null. */
const B_RETRIEVAL_NULL: RunSpec = {
  ...B_TEST,
  name: "2026-10-09T13-00-00-000Z-B-test",
  commit: "bbb8888",
  retrieval: { costUsd: null, p50: null, p95: null },
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

/**
 * The main, the per-category and the failure tables, found by their header:
 * the page may hold other tables ("By stage") wherever it likes.
 */
function threeTables(page: string): [Table, Table, Table] {
  const tables = tablesOf(page)
  const find = (what: string, matches: (table: Table) => boolean): Table => {
    const table = tables.find(matches)
    expect({ what, found: table !== undefined }).toEqual({ what, found: true })
    return table!
  }
  const has = (table: Table, pattern: RegExp) =>
    table.header.some((cell) => pattern.test(cell))
  return [
    find(
      "main",
      (table) =>
        /^config/i.test(table.header[0]!) &&
        has(table, /accuracy/i) &&
        has(table, /date/i)
    ),
    find("categories", (table) => /^category/i.test(table.header[0]!)),
    find("failures", (table) => has(table, /family/i)),
  ]
}

/** The "By stage" table: the one with a column for the search stage and one for the embed role. */
function stageTable(page: string): Table {
  const table = tablesOf(page).find(
    (candidate) =>
      candidate.header.some((cell) => /search/i.test(cell)) &&
      candidate.header.some((cell) => /embed/i.test(cell))
  )
  expect({ found: table !== undefined }).toEqual({ found: true })
  return table!
}

/**
 * The column of a stage in "By stage": its header names the stage and `kind`
 * (median or mean), in ms. The order of the columns is not pinned.
 */
function stageColumn(
  table: Table,
  stage: string,
  kind: "median" | "mean"
): number {
  const index = table.header.findIndex(
    (cell) =>
      new RegExp(`\\b${stage.replace("Ms", "")}\\b`, "i").test(cell) &&
      new RegExp(`\\b${kind}\\b`, "i").test(cell) &&
      /\bms\b/i.test(cell) &&
      !/cost|usd/i.test(cell)
  )
  expect({ stage, kind, found: index >= 0 }).toEqual({
    stage,
    kind,
    found: true,
  })
  return index
}

/** The column of the mean cost of a role in "By stage". */
function costColumn(table: Table, role: string): number {
  const index = table.header.findIndex(
    (cell) =>
      new RegExp(`\\b${role}\\b`, "i").test(cell) && /cost|usd/i.test(cell)
  )
  expect({ role, found: index >= 0 }).toEqual({ role, found: true })
  return index
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
      column(main, /^retrieval cost/i),
      column(main, /^retrieval latency p50/i),
      column(main, /^retrieval latency p95/i),
      column(main, /accuracy/i),
    ]
    for (const index of headline) expect(index).toBeGreaterThanOrEqual(0)
    expect([...headline].sort((a, b) => a - b)).toEqual(headline)
    expect(new Set(headline).size).toBe(headline.length)
    // The cost of the headline is per question, not the total.
    expect(main.header[column(main, /^retrieval cost/i)]!).not.toMatch(/total/i)
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
      ["latency p95", /^end-to-end latency p95/i],
      ["total cost", /total/i],
      ["retrieval failures", /retrieval failures/i],
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
      expect(row[column(main, /^end-to-end latency p50/i)]!).toMatch(
        new RegExp(
          `${spec.p50}|${(spec.p50 / 1000).toFixed(1)}|${Math.floor(spec.p50 / 1000)},${String(spec.p50 % 1000).padStart(3, "0")}`
        )
      )
      expect(row[column(main, /^end-to-end cost/i)]!).toMatch(/\d/)
    }
    // The cost per question of config A is 0.00025 USD: a few tenths of a
    // thousandth, whatever the number of decimals.
    const cost = rowOf(main, A_TEST)[column(main, /^end-to-end cost/i)]!
    expect(Number(cost.replace(/[^0-9.]/g, ""))).toBeCloseTo(0.00025, 4)
  })

  test("AC2 — recall, notes in the context, input tokens and latency p95", () => {
    const [main] = threeTables(page())
    const row = rowOf(main, A_TEST)
    expect(showsRate(row[column(main, /recall/i)]!, 0.75)).toBe(true)
    expect(row[column(main, /notes/i)]!).toContain("4.5")
    expect(row[column(main, /input tokens/i)]!).toMatch(/1,?682|1\.7k/)
    expect(row[column(main, /^end-to-end latency p95/i)]!).toMatch(
      /4000|4\.0|4,000/
    )
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
      expect(row[column(main, /retrieval failures/i)]!).toBe(String(retrieval))
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

  test("AC2 — the loop's and the answerer's counts come from the no_answer category, not from the overall metrics", () => {
    const [main] = threeTables(page())
    const cells = (spec: RunSpec) => {
      const row = rowOf(main, spec)
      return main.header
        .flatMap((cell, index) =>
          /abstention/i.test(cell) ? [row[index]!] : []
        )
        .join(" ")
    }
    const shown = (spec: RunSpec): string[] => cells(spec).match(/\d+/g) ?? []
    // The overall counts (and the other categories') never show up.
    for (const spec of LATEST) {
      const numbers = shown(spec)
      for (const forbidden of [
        spec.overallAbstentions.loop,
        spec.overallAbstentions.answerer,
        17,
        19,
      ]) {
        if (
          forbidden === spec.abstentions.loop ||
          forbidden === spec.abstentions.answerer
        )
          continue
        expect(numbers).not.toContain(String(forbidden))
      }
    }
    // The no_answer counts do, next to correct/n.
    for (const count of ["8", "10", "5", "3"])
      expect(shown(B_TEST)).toContain(count)
    for (const count of ["9", "10", "6", "2"])
      expect(shown(B_TUNING)).toContain(count)
    expect(shown(A_TUNING)).toContain("7")
  })

  test("AC2 — without a no_answer category, the loop's and the answerer's counts are - and the overall counts are not shown", () => {
    const { cwd } = workdir([B_NO_NO_ANSWER])
    const [main] = threeTables(generate(cwd))
    const row = rowOf(main, B_NO_NO_ANSWER)
    const text = main.header
      .flatMap((cell, index) => (/abstention/i.test(cell) ? [row[index]!] : []))
      .join(" ")
    expect(text).toContain("-")
    const numbers: string[] = text.match(/\d+/g) ?? []
    expect(numbers).not.toContain(
      String(B_NO_NO_ANSWER.overallAbstentions.loop)
    )
    expect(numbers).not.toContain(
      String(B_NO_NO_ANSWER.overallAbstentions.answerer)
    )
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
    expect(tables.length).toBeGreaterThanOrEqual(3)
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

// ---------------------------------------------------------------------------
// eval-config-c AC9 — results page
// ---------------------------------------------------------------------------

const WITH_C = [...LATEST, C_TEST]

/** A number shown in a cell, with or without thousands separators. */
function numberIn(cell: string): number {
  return Number(cell.replace(/[,\s]/g, ""))
}

/** A cell that shows `value`, to `digits` decimals at most; a zero may also be left empty or "-". */
function expectShows(cell: string, value: number, digits: number) {
  if (value === 0) {
    expect(cell).toMatch(/^(0(\.0*)?|-)?$/)
    return
  }
  expect(numberIn(cell)).toBeCloseTo(value, digits)
}

describe("eval-config-c AC9 — fallback rates in the main table", () => {
  const main = () => threeTables(generate(workdir(WITH_C).cwd))[0]

  test("eval-config-c AC9 — the main table gains a fallback note rate and a fallback question rate column, after the headline", () => {
    const table = main()
    const note = column(table, /^fallback note rate$/i)
    const question = column(table, /^fallback question rate$/i)
    expect(note).toBeGreaterThan(column(table, /accuracy/i))
    expect(question).toBeGreaterThan(column(table, /accuracy/i))
    expect(note).not.toBe(question)
  })

  test("eval-config-c AC9 — config C shows the share of notes and the share of questions judged again", () => {
    const table = main()
    const row = rowOf(table, C_TEST)
    const note = row[column(table, /^fallback note rate$/i)]!
    const question = row[column(table, /^fallback question rate$/i)]!
    expect(showsRate(note, 0.35)).toBe(true)
    expect(showsRate(question, 0.6)).toBe(true)
    expect(showsRate(note, 0.6)).toBe(false)
    expect(showsRate(question, 0.35)).toBe(false)
  })

  test("eval-config-c AC9 — the rates are empty for A and B", () => {
    const table = main()
    const columns = [
      column(table, /^fallback note rate$/i),
      column(table, /^fallback question rate$/i),
    ]
    for (const spec of LATEST) {
      const row = rowOf(table, spec)
      for (const index of columns) expect(row[index]!).toBe("")
    }
  })

  test("eval-config-c AC9 — the other columns of the main table are still there", () => {
    const table = main()
    for (const pattern of [
      /hops/i,
      /rewrites/i,
      /judge calls?/i,
      /accuracy/i,
      /p50/i,
    ]) {
      expect(column(table, pattern)).toBeGreaterThanOrEqual(0)
    }
  })

  test("eval-config-c AC9 — a summary from before the fallback metrics gives empty or - cells and no crash", () => {
    const { cwd } = workdir([B_LEGACY])
    const table = threeTables(generate(cwd))[0]
    const row = rowOf(table, B_LEGACY)
    expect(row[column(table, /^fallback note rate$/i)]!).toMatch(/^-?$/)
    expect(row[column(table, /^fallback question rate$/i)]!).toMatch(/^-?$/)
  })
})

describe("eval-config-c AC9 — By stage", () => {
  const page = () => generate(workdir(WITH_C).cwd)

  test("eval-config-c AC9 — the page holds a fourth table, under a By stage heading", () => {
    const text = page()
    // The repeated runs table (Revision 5) comes on top of these four.
    expect(
      tablesOf(text).filter((candidate) => !candidate.header.includes("runs"))
    ).toHaveLength(4)
    const table = stageTable(text)
    const lines = text.split("\n")
    const heading = lines.findIndex((l) => /^#{1,6}\s+by stage\b/i.test(l))
    expect(heading).toBeGreaterThanOrEqual(0)
    expect(heading).toBeLessThan(table.start)
    // No other table between the heading and the table.
    const between = lines.slice(heading, table.start)
    expect(between.some((l) => l.trimStart().startsWith("|"))).toBe(false)
  })

  test("eval-config-c AC9 — one row per run, in the order of the main table", () => {
    const text = page()
    const [main] = threeTables(text)
    const stage = stageTable(text)
    expect(stage.rows).toHaveLength(WITH_C.length)
    expect(orderOf(stage, WITH_C).map((spec) => spec.name)).toEqual(
      orderOf(main, WITH_C).map((spec) => spec.name)
    )
  })

  test("eval-config-c AC9 — the row starts with the config, the split and the commit of the run", () => {
    const stage = stageTable(page())
    expect(stage.header[0]!).toMatch(/^config/i)
    expect(stage.header[1]!).toMatch(/^split/i)
    expect(stage.header[2]!).toMatch(/^commit/i)
    for (const spec of WITH_C) {
      const row = rowOf(stage, spec)
      expect(clean(row[2]!)).toBe(spec.commit)
    }
  })

  test("eval-config-c AC9 — then the median of each stage in ms: search, judge, fallback, rewrite, answer", () => {
    const stage = stageTable(page())
    const columns = STAGES.map((name) => stageColumn(stage, name, "median"))
    expect(columns).toEqual([...columns].sort((a, b) => a - b))
    for (const spec of WITH_C) {
      const row = rowOf(stage, spec)
      STAGES.forEach((name, offset) => {
        expectShows(row[columns[offset]!]!, spec.stage!.medianMs[name]!, 0)
      })
    }
  })

  test("eval-config-c AC12 — and the mean of each stage in ms, in the same order", () => {
    const stage = stageTable(page())
    const columns = STAGES.map((name) => stageColumn(stage, name, "mean"))
    expect(columns).toEqual([...columns].sort((a, b) => a - b))
    for (const spec of WITH_C) {
      const row = rowOf(stage, spec)
      STAGES.forEach((name, offset) => {
        expectShows(row[columns[offset]!]!, spec.stage!.meanMs[name]!, 0)
      })
    }
  })

  test("eval-config-c AC12 — the median and the mean of a stage are two columns of their own", () => {
    const stage = stageTable(page())
    const columns = STAGES.flatMap((name) => [
      stageColumn(stage, name, "median"),
      stageColumn(stage, name, "mean"),
    ])
    expect(new Set(columns).size).toBe(STAGES.length * 2)
  })

  test("eval-config-c AC12 — a fallback that runs on fewer than half the questions has a median of 0 and a mean that shows its cost", () => {
    const stage = stageTable(page())
    const row = rowOf(stage, C_TEST)
    expectShows(row[stageColumn(stage, "fallbackMs", "median")]!, 0, 0)
    expect(numberIn(row[stageColumn(stage, "fallbackMs", "mean")]!)).toBe(940)
    // The other stages of the same run keep their own median and mean.
    expect(numberIn(row[stageColumn(stage, "judgeMs", "median")]!)).toBe(520)
    expect(numberIn(row[stageColumn(stage, "judgeMs", "mean")]!)).toBe(575)
  })

  test("eval-config-c AC9 — then the mean cost of each role in USD: embed, judge, fallback, rewrite, answer", () => {
    const stage = stageTable(page())
    const columns = ROLES.map((role) => costColumn(stage, role))
    expect(columns).toEqual([...columns].sort((a, b) => a - b))
    expect(new Set(columns).size).toBe(ROLES.length)
    for (const spec of WITH_C) {
      const row = rowOf(stage, spec)
      ROLES.forEach((name, offset) => {
        expectShows(row[columns[offset]!]!, spec.stage!.costUsd[name]!, 4)
      })
    }
  })

  test("eval-config-c AC9 — the cells come from the run of their row", () => {
    const stage = stageTable(page())
    const b = rowOf(stage, B_TEST)
    const c = rowOf(stage, C_TEST)
    const median = (name: string) => stageColumn(stage, name, "median")
    const mean = (name: string) => stageColumn(stage, name, "mean")
    expect(numberIn(b[median("judgeMs")]!)).toBe(2400)
    expect(numberIn(c[median("judgeMs")]!)).toBe(520)
    expect(numberIn(c[mean("fallbackMs")]!)).toBe(940)
    expect(numberIn(rowOf(stage, A_TEST)[median("searchMs")]!)).toBe(85)
    expect(numberIn(rowOf(stage, A_TUNING)[median("searchMs")]!)).toBe(92)
    expect(numberIn(rowOf(stage, A_TEST)[mean("searchMs")]!)).toBe(97)
    expect(numberIn(rowOf(stage, A_TUNING)[mean("searchMs")]!)).toBe(104)
    expect(numberIn(b[mean("answerMs")]!)).toBe(1810)
  })

  test("eval-config-c AC9 — the run folders it was built from are listed under it", () => {
    const text = page()
    const lines = text.split("\n")
    const tables = tablesOf(text)
    const stage = stageTable(text)
    const index = tables.findIndex((table) => table.start === stage.start)
    const next = tables[index + 1]?.start ?? lines.length
    const below = lines.slice(stage.end + 1, next).join("\n")
    for (const spec of WITH_C) expect(below).toContain(spec.name)
  })

  test("eval-config-c AC9 — a summary from before the stage metrics gives empty or - cells and no crash", () => {
    const { cwd } = workdir([B_LEGACY, C_TEST])
    const text = generate(cwd)
    const stage = stageTable(text)
    expect(stage.rows).toHaveLength(2)
    const row = rowOf(stage, B_LEGACY)
    for (const cell of row.slice(3)) expect(cell).toMatch(/^-?$/)
    // The other run is not affected.
    const c = rowOf(stage, C_TEST)
    expect(numberIn(c[stageColumn(stage, "judgeMs", "median")]!)).toBe(520)
    expect(numberIn(c[stageColumn(stage, "judgeMs", "mean")]!)).toBe(575)
  })
})

describe("eval-config-c AC9 — labels with the commit when two runs share config and split", () => {
  const runs = [A_TEST, B_TEST, B_TEST_OTHER_COMMIT]
  const tables = () => {
    const { cwd, runs: dirs } = workdir(runs)
    return threeTables(generate(cwd, dirs))
  }

  test("eval-config-c AC9 — the column groups of the per-category table carry the commit of their run", () => {
    const [, categories] = tables()
    const header = categories.header.join(" | ")
    // Three measures per run.
    expect(header.match(/bbb3333/g)).toHaveLength(3)
    expect(header.match(/bbb7777/g)).toHaveLength(3)
    expect(new Set(categories.header.slice(1)).size).toBe(
      categories.header.length - 1
    )
  })

  test("eval-config-c AC9 — the count columns of the failure table carry the commit of their run", () => {
    const [, , failures] = tables()
    const labels = failures.header.slice(-runs.length)
    expect(new Set(labels).size).toBe(runs.length)
    const b3 = labels.filter((label) => label.includes("bbb3333"))
    const b7 = labels.filter((label) => label.includes("bbb7777"))
    expect(b3).toHaveLength(1)
    expect(b7).toHaveLength(1)
    for (const label of [...b3, ...b7]) {
      expect(label).toMatch(/\bB\b[^|]*test/)
    }
  })

  test("eval-config-c AC9 — the other runs are still labelled by their config and split", () => {
    const [, categories, failures] = tables()
    expect(categories.header.join(" | ")).toMatch(/\bA\b[^|]*test/)
    expect(failures.header.slice(-runs.length).join(" | ")).toMatch(
      /\bA\b[^|]*test/
    )
  })

  test("eval-config-c AC9 — the counts of each run stay in their column", () => {
    const [main, , failures] = tables()
    const labels = failures.header.slice(-runs.length)
    const commits = main.rows.map((row) => clean(row[column(main, /commit/i)]!))
    expect(new Set(commits)).toEqual(new Set(["aaa1111", "bbb3333", "bbb7777"]))
    for (const spec of [B_TEST, B_TEST_OTHER_COMMIT]) {
      const index = labels.findIndex((label) => label.includes(spec.commit))
      failures.rows.forEach((row, failure) => {
        const id = FAILURE_IDS[failure]!
        expect(row.slice(-runs.length)[index]!).toBe(
          String(failuresOf(spec)[id])
        )
      })
    }
  })
})

describe("eval-config-c AC13 — labels with the time when two runs share config, split and commit", () => {
  /** The same config, split and commit as B_TEST, run again later (the variance measurement). */
  const B_TEST_REPEAT: RunSpec = {
    ...B_TEST,
    name: "2026-10-09T15-29-47-950Z-B-test",
    failureSeed: 1,
  }
  const runs = [A_TEST, B_TEST, B_TEST_REPEAT]
  const tables = () => {
    const { cwd, runs: dirs } = workdir(runs)
    return threeTables(generate(cwd, dirs))
  }

  test("eval-config-c AC13 — the column groups of the per-category table carry the time of their run", () => {
    const [, categories] = tables()
    const header = categories.header.join(" | ")
    // B_TEST: 2026-10-09T08-15-00-000Z. Three measures per run.
    expect(header.match(/\b08:15\b/g)).toHaveLength(3)
    expect(header.match(/\b15:29\b/g)).toHaveLength(3)
    expect(new Set(categories.header.slice(1)).size).toBe(
      categories.header.length - 1
    )
  })

  test("eval-config-c AC13 — the count columns of the failure table carry the time of their run", () => {
    const [, , failures] = tables()
    const labels = failures.header.slice(-runs.length)
    expect(new Set(labels).size).toBe(runs.length)
    const early = labels.filter((label) => label.includes("08:15"))
    const late = labels.filter((label) => label.includes("15:29"))
    expect(early).toHaveLength(1)
    expect(late).toHaveLength(1)
    for (const label of [...early, ...late]) {
      expect(label).toMatch(/\bB\b[^|]*test/)
      expect(label).toContain("bbb3333")
    }
  })

  test("eval-config-c AC13 — the time is the HH:MM of the folder name, without the seconds", () => {
    const [, , failures] = tables()
    const label = failures.header.find((cell) => cell.includes("15:29")) ?? ""
    expect(label).toContain("15:29")
    expect(label).not.toContain("15:29:47")
    expect(label).not.toContain("47")
  })

  test("eval-config-c AC13 — the counts of each run stay in their column", () => {
    const [, , failures] = tables()
    const labels = failures.header.slice(-runs.length)
    for (const [spec, time] of [
      [B_TEST, "08:15"],
      [B_TEST_REPEAT, "15:29"],
    ] as const) {
      const index = labels.findIndex((label) => label.includes(time))
      failures.rows.forEach((row, failure) => {
        const id = FAILURE_IDS[failure]!
        expect(row.slice(-runs.length)[index]!).toBe(
          String(failuresOf(spec)[id])
        )
      })
    }
  })

  test("eval-config-c AC13 — a run that shares nothing keeps its label of config and split, without a time", () => {
    const [, categories, failures] = tables()
    const labels = failures.header.slice(-runs.length)
    const a = labels.filter((label) => /\bA\b[^|]*test/.test(label))
    expect(a).toHaveLength(1)
    expect(a[0]!).not.toMatch(/\d\d:\d\d/)
    const aGroups = categories.header.filter((cell) =>
      /\bA\b[^|]*test/.test(cell)
    )
    expect(aGroups).toHaveLength(3)
    for (const cell of aGroups) expect(cell).not.toMatch(/\d\d:\d\d/)
  })
})

// ---------------------------------------------------------------------------
// Revision 2 — retrieval cost and latency first
// ---------------------------------------------------------------------------

/** The main table of docs/features/results-table.md, Revision 2, AC7. */
const REVISION_2_HEADER = [
  "config",
  "split",
  "date",
  "commit",
  "fallback",
  "questions",
  "context complete",
  "context precision",
  "retrieval cost/question (USD)",
  "retrieval latency p50 (ms)",
  "retrieval latency p95 (ms)",
  "accuracy",
  "end-to-end cost/question (USD)",
  "end-to-end latency p50 (ms)",
  "end-to-end latency p95 (ms)",
  "fallback note rate",
  "fallback question rate",
  "recall",
  "notes in context",
  "answerer input tokens",
  "total cost (USD)",
  "retrieval failures",
  "answer failures",
  "abstentions (correct/n)",
  "abstentions by the loop",
  "abstentions by the answerer",
  "hops",
  "rewrites",
  "judge calls",
]

describe("Revision 2 AC7 — headline columns", () => {
  const mainOf = (specs: RunSpec[]) =>
    threeTables(generate(workdir(specs).cwd))[0]

  test("Revision 2 AC7 — the main table has exactly the headline, the end-to-end group, then the other columns in their order", () => {
    expect(mainOf(WITH_C).header).toEqual(REVISION_2_HEADER)
  })

  test("Revision 2 AC7 — the p95 of the whole question moves into the end-to-end group: no other latency p95 column", () => {
    const { header } = mainOf(LATEST)
    expect(header.filter((cell) => /p95/i.test(cell))).toEqual([
      "retrieval latency p95 (ms)",
      "end-to-end latency p95 (ms)",
    ])
    expect(header.filter((cell) => /p50/i.test(cell))).toEqual([
      "retrieval latency p50 (ms)",
      "end-to-end latency p50 (ms)",
    ])
  })

  test("Revision 2 AC7 — each run shows its retrieval cost per question and its retrieval latency p50 and p95", () => {
    const main = mainOf(WITH_C)
    for (const spec of WITH_C) {
      const row = rowOf(main, spec)
      const { costUsd, p50, p95 } = spec.retrieval!
      expect(numberIn(row[column(main, /^retrieval cost/i)]!)).toBeCloseTo(
        costUsd!,
        7
      )
      expect(numberIn(row[column(main, /^retrieval latency p50/i)]!)).toBe(p50!)
      expect(numberIn(row[column(main, /^retrieval latency p95/i)]!)).toBe(p95!)
    }
  })

  test("Revision 2 AC7 — the retrieval measures differ from the end-to-end ones, which keep the whole question's cost and latencies", () => {
    const main = mainOf(WITH_C)
    for (const spec of WITH_C) {
      const row = rowOf(main, spec)
      expect(numberIn(row[column(main, /^end-to-end cost/i)]!)).toBeCloseTo(
        spec.costUsd,
        7
      )
      expect(numberIn(row[column(main, /^end-to-end latency p50/i)]!)).toBe(
        spec.p50
      )
      expect(numberIn(row[column(main, /^end-to-end latency p95/i)]!)).toBe(
        spec.p95
      )
    }
  })

  test("Revision 2 AC7 — a summary without the retrieval measures shows - in those three columns and keeps the end-to-end ones", () => {
    const main = mainOf([A_TEST, B_LEGACY])
    const row = rowOf(main, B_LEGACY)
    for (const pattern of [
      /^retrieval cost/i,
      /^retrieval latency p50/i,
      /^retrieval latency p95/i,
    ]) {
      expect(row[column(main, pattern)]!).toBe("-")
    }
    expect(numberIn(row[column(main, /^end-to-end latency p50/i)]!)).toBe(
      B_LEGACY.p50
    )
    // The run next to it, which has them, still shows them.
    expect(
      numberIn(rowOf(main, A_TEST)[column(main, /^retrieval latency p50/i)]!)
    ).toBe(A_TEST.retrieval!.p50!)
  })

  test("Revision 2 AC7 — null retrieval measures show - too", () => {
    const main = mainOf([B_RETRIEVAL_NULL])
    const row = rowOf(main, B_RETRIEVAL_NULL)
    for (const pattern of [
      /^retrieval cost/i,
      /^retrieval latency p50/i,
      /^retrieval latency p95/i,
    ]) {
      expect(row[column(main, pattern)]!).toBe("-")
    }
  })
})

describe("Revision 2 AC8 — what retrieval means", () => {
  /** The lines between the main table and the next heading, without the provenance line. */
  function noteUnderMainTable(page: string): string {
    const [main] = threeTables(page)
    const lines = page.split("\n")
    const following: string[] = []
    for (const line of lines.slice(main.end + 1)) {
      if (line.startsWith("#")) break
      following.push(line)
    }
    return following
      .filter((line) => line.trim() !== "" && !/^built from/i.test(line))
      .join("\n")
  }

  test("Revision 2 AC8 — a line under the main table says that retrieval counts the search, the judge, its fallback and the rewrites", () => {
    const note = noteUnderMainTable(generate(workdir(LATEST).cwd))
    for (const word of [
      /retrieval/i,
      /search/i,
      /judge/i,
      /fallback/i,
      /rewrit/i,
    ]) {
      expect(note).toMatch(word)
    }
  })

  test("Revision 2 AC8 — the line says that the answerer is not counted", () => {
    const note = noteUnderMainTable(generate(workdir(LATEST).cwd))
    expect(note).toMatch(/answerer/i)
    expect(note).toMatch(/\b(not|without|excludes?|excluding)\b/i)
  })

  test("Revision 2 AC8 — the provenance line stays under the main table", () => {
    const page = generate(workdir(LATEST).cwd)
    const [main] = threeTables(page)
    const after = page.split("\n").slice(main.end + 1)
    const heading = after.findIndex((line) => line.startsWith("#"))
    expect(after.slice(0, heading).join("\n")).toMatch(/built from/i)
  })
})

// ---------------------------------------------------------------------------
// Revision 3 — the fallback of each run
// ---------------------------------------------------------------------------

/** Config C on the tuning split, as the threshold sweep runs it. */
function sweepRun(
  name: string,
  commit: string,
  loopSettings: NonNullable<RunSpec["loopSettings"]> | undefined,
  failureSeed: number
): RunSpec {
  return {
    ...C_TEST,
    name: `${name}-C-tuning`,
    split: "tuning",
    commit,
    loopSettings,
    failureSeed,
    // Tells the rows of the main table apart: the other measures are C_TEST's.
    precision: 0.5 + failureSeed / 100,
  }
}

/** Two runs of the sweep at the same commit and in the same minute. */
const C_FALLBACK_085 = sweepRun(
  "2026-10-10T09-00-12-000Z",
  "ccc7777",
  { fallbackLow: 0.85 },
  1
)
const C_FALLBACK_NONE = sweepRun(
  "2026-10-10T09-00-47-000Z",
  "ccc7777",
  { fallbackLow: null },
  3
)
const C_FALLBACK_08_NOTHING_KEPT = sweepRun(
  "2026-10-10T09-30-00-000Z",
  "ccc7777",
  { fallbackLow: 0.8, fallbackWhen: "nothing-kept" },
  4
)
const C_FALLBACK_08 = sweepRun(
  "2026-10-10T09-40-00-000Z",
  "ccc7777",
  { fallbackLow: 0.8, fallbackWhen: "uncertain" },
  2
)

/** A and B with settings that have no `fallbackLow`: no `loop` part, or one without it. */
const A_NO_LOOP_SETTINGS: RunSpec = { ...A_TEST, loopSettings: undefined }
const B_LOOP_WITHOUT_FALLBACK: RunSpec = {
  ...B_TEST,
  loopSettings: { maxHops: 3 },
}

/** The cells of the `fallback` column of a table, sorted. */
function fallbackCells(table: Table): string[] {
  const index = column(table, /^fallback$/i)
  expect(index).toBeGreaterThanOrEqual(0)
  return table.rows.map((row) => row[index]!).sort()
}

/** The labels of the runs in the header of the failure table, in the order of its columns. */
function failureLabels(table: Table, runs: number): string[] {
  return table.header.slice(-runs)
}

/** The labels of the column groups of the per-category table, without the measure names. */
function categoryLabels(table: Table): string[] {
  return table.header
    .slice(1)
    .filter((_, index) => index % 3 === 0)
    .map((cell) => cell.replace(/ context complete$/, ""))
}

describe("Revision 3 AC9 — fallback column", () => {
  const sweep = [
    C_FALLBACK_085,
    C_FALLBACK_NONE,
    C_FALLBACK_08_NOTHING_KEPT,
    C_FALLBACK_08,
  ]
  const pageOf = (specs: RunSpec[]) => {
    const { cwd, runs } = workdir(specs)
    return generate(cwd, runs)
  }

  test("Revision 3 AC9 — the main table has a fallback column right after commit", () => {
    const [main] = threeTables(pageOf([A_TEST, C_FALLBACK_085]))
    const commit = column(main, /^commit$/i)
    expect(commit).toBeGreaterThanOrEqual(0)
    expect(main.header[commit + 1]!).toBe("fallback")
    expect(main.header.filter((cell) => /^fallback$/i.test(cell))).toHaveLength(
      1
    )
  })

  test("Revision 3 AC9 — the cell is the fallbackLow of the settings line, none when it is null, with nothing-kept when the scope is nothing-kept", () => {
    const [main] = threeTables(pageOf(sweep))
    expect(main.rows).toHaveLength(4)
    expect(fallbackCells(main)).toEqual(
      ["0.85", "none", "0.8 nothing-kept", "0.8"].sort()
    )
  })

  test("Revision 3 AC9 — each row shows the fallback of its own run", () => {
    const { cwd, runs } = workdir(sweep)
    const [main] = threeTables(generate(cwd, runs))
    const fallback = column(main, /^fallback$/i)
    // The precision tells the runs apart (see sweepRun).
    const precision = column(main, /^context precision$/i)
    const expected: [RunSpec, string][] = [
      [C_FALLBACK_085, "0.85"],
      [C_FALLBACK_NONE, "none"],
      [C_FALLBACK_08_NOTHING_KEPT, "0.8 nothing-kept"],
      [C_FALLBACK_08, "0.8"],
    ]
    for (const [spec, cell] of expected) {
      const rows = main.rows.filter((cells) =>
        showsRate(cells[precision]!, spec.precision)
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]![fallback]!).toBe(cell)
    }
  })

  test("Revision 3 AC9 — the cell is empty for A and for B, whether their settings have no loop part or a loop part without fallbackLow", () => {
    const [main] = threeTables(
      pageOf([A_NO_LOOP_SETTINGS, B_LOOP_WITHOUT_FALLBACK, C_FALLBACK_085])
    )
    const fallback = column(main, /^fallback$/i)
    expect(fallback).toBeGreaterThanOrEqual(0)
    expect(rowOf(main, A_NO_LOOP_SETTINGS)[fallback]!).toBe("")
    expect(rowOf(main, B_LOOP_WITHOUT_FALLBACK)[fallback]!).toBe("")
    expect(rowOf(main, C_FALLBACK_085)[fallback]!).toBe("0.85")
  })

  test("Revision 3 AC9 — a nothing-kept scope without a threshold adds nothing: the cell stays empty", () => {
    const withScopeOnly: RunSpec = {
      ...B_TEST,
      loopSettings: { fallbackWhen: "uncertain" },
    }
    const [main] = threeTables(pageOf([withScopeOnly, C_FALLBACK_085]))
    const fallback = column(main, /^fallback$/i)
    expect(fallback).toBeGreaterThanOrEqual(0)
    expect(rowOf(main, withScopeOnly)[fallback]!).toBe("")
  })

  test("Revision 3 AC9 — the By stage table has the same fallback column after commit", () => {
    const text = pageOf(sweep)
    const stage = stageTable(text)
    const commit = column(stage, /^commit$/i)
    expect(commit).toBeGreaterThanOrEqual(0)
    expect(stage.header[commit + 1]!).toBe("fallback")
    expect(stage.rows).toHaveLength(4)
    expect(fallbackCells(stage)).toEqual(
      ["0.85", "none", "0.8 nothing-kept", "0.8"].sort()
    )
  })

  test("Revision 3 AC9 — in By stage too, the cell is empty for A and B", () => {
    const stage = stageTable(
      pageOf([A_NO_LOOP_SETTINGS, B_LOOP_WITHOUT_FALLBACK, C_FALLBACK_085])
    )
    const fallback = column(stage, /^fallback$/i)
    expect(fallback).toBeGreaterThanOrEqual(0)
    expect(rowOf(stage, A_NO_LOOP_SETTINGS)[fallback]!).toBe("")
    expect(rowOf(stage, B_LOOP_WITHOUT_FALLBACK)[fallback]!).toBe("")
    expect(rowOf(stage, C_FALLBACK_085)[fallback]!).toBe("0.85")
  })

  test("Revision 3 AC9 — the fallback column does not shift the other By stage columns", () => {
    const stage = stageTable(pageOf([B_LOOP_WITHOUT_FALLBACK, C_FALLBACK_085]))
    const row = rowOf(stage, C_FALLBACK_085)
    expect(clean(row[2]!)).toBe(C_FALLBACK_085.commit)
    expect(row[3]!).toBe("0.85")
    expect(numberIn(row[stageColumn(stage, "judgeMs", "median")]!)).toBe(520)
    expect(numberIn(row[stageColumn(stage, "fallbackMs", "mean")]!)).toBe(940)
  })
})

describe("Revision 3 AC10 — labels with the fallback", () => {
  const tablesOfRuns = (specs: RunSpec[]) => {
    const { cwd, runs } = workdir(specs)
    const [main, categories, failures] = threeTables(generate(cwd, runs))
    return {
      main,
      categories,
      failures,
      labels: failureLabels(failures, specs.length),
      groups: categoryLabels(categories),
    }
  }

  test("Revision 3 AC10 — a run with a threshold gets fallback <value> after the split", () => {
    const { labels, groups } = tablesOfRuns([A_TEST, C_FALLBACK_085])
    expect(labels).toContain("C tuning fallback 0.85")
    expect(groups).toContain("C tuning fallback 0.85")
  })

  test("Revision 3 AC10 — none, and nothing-kept after the threshold, are in the label like in the column", () => {
    const none = tablesOfRuns([C_FALLBACK_NONE])
    expect(none.labels).toEqual(["C tuning fallback none"])
    expect(none.groups).toEqual(["C tuning fallback none"])
    const nothingKept = tablesOfRuns([C_FALLBACK_08_NOTHING_KEPT])
    expect(nothingKept.labels).toEqual(["C tuning fallback 0.8 nothing-kept"])
    expect(nothingKept.groups).toEqual(["C tuning fallback 0.8 nothing-kept"])
    const uncertain = tablesOfRuns([C_FALLBACK_08])
    expect(uncertain.labels).toEqual(["C tuning fallback 0.8"])
    expect(uncertain.groups).toEqual(["C tuning fallback 0.8"])
  })

  test("Revision 3 AC10 — the three measures of the category table carry the label", () => {
    const { categories } = tablesOfRuns([A_TEST, C_FALLBACK_085])
    expect(categories.header.slice(1)).toEqual([
      "A test context complete",
      "A test context precision",
      "A test accuracy",
      "C tuning fallback 0.85 context complete",
      "C tuning fallback 0.85 context precision",
      "C tuning fallback 0.85 accuracy",
    ])
  })

  test("Revision 3 AC10 — A and B labels are unchanged, with the fallback label of C next to them", () => {
    const { labels, groups } = tablesOfRuns([
      A_NO_LOOP_SETTINGS,
      B_LOOP_WITHOUT_FALLBACK,
      C_FALLBACK_085,
    ])
    expect(labels).toEqual(["A test", "B test", "C tuning fallback 0.85"])
    expect(groups).toEqual(["A test", "B test", "C tuning fallback 0.85"])
  })

  test("Revision 3 AC10 — same commit and same minute, fallback 0.85 and none: distinct labels, without commit or time", () => {
    const { labels, groups } = tablesOfRuns([C_FALLBACK_085, C_FALLBACK_NONE])
    expect([...labels].sort()).toEqual([
      "C tuning fallback 0.85",
      "C tuning fallback none",
    ])
    expect([...groups].sort()).toEqual([
      "C tuning fallback 0.85",
      "C tuning fallback none",
    ])
  })

  test("Revision 3 AC10 — the counts of each run stay in the column of its fallback label", () => {
    const { failures, labels } = tablesOfRuns([C_FALLBACK_085, C_FALLBACK_NONE])
    for (const [spec, label] of [
      [C_FALLBACK_085, "C tuning fallback 0.85"],
      [C_FALLBACK_NONE, "C tuning fallback none"],
    ] as const) {
      const index = labels.indexOf(label)
      expect(index).toBeGreaterThanOrEqual(0)
      failures.rows.forEach((row, failure) => {
        const id = FAILURE_IDS[failure]!
        expect(row.slice(-labels.length)[index]!).toBe(
          String(failuresOf(spec)[id])
        )
      })
    }
  })

  test("Revision 3 AC10 — same fallback, different commits: the commit is added", () => {
    const otherCommit: RunSpec = {
      ...C_FALLBACK_085,
      name: "2026-10-10T11-00-00-000Z-C-tuning",
      commit: "ccc8888",
      failureSeed: 3,
    }
    const { labels, groups } = tablesOfRuns([C_FALLBACK_085, otherCommit])
    expect([...labels].sort()).toEqual([
      "C tuning fallback 0.85 ccc7777",
      "C tuning fallback 0.85 ccc8888",
    ])
    expect([...groups].sort()).toEqual([
      "C tuning fallback 0.85 ccc7777",
      "C tuning fallback 0.85 ccc8888",
    ])
  })

  test("Revision 3 AC10 — same fallback and same commit: the commit, then the time", () => {
    const later: RunSpec = {
      ...C_FALLBACK_085,
      name: "2026-10-10T10-30-00-000Z-C-tuning",
      failureSeed: 3,
    }
    const { labels, groups } = tablesOfRuns([C_FALLBACK_085, later])
    expect([...labels].sort()).toEqual([
      "C tuning fallback 0.85 ccc7777 09:00",
      "C tuning fallback 0.85 ccc7777 10:30",
    ])
    expect([...groups].sort()).toEqual([
      "C tuning fallback 0.85 ccc7777 09:00",
      "C tuning fallback 0.85 ccc7777 10:30",
    ])
  })

  test("Revision 3 AC10 — only the runs that share the fallback get the commit: a run with another fallback keeps the short label", () => {
    const otherCommit: RunSpec = {
      ...C_FALLBACK_085,
      name: "2026-10-10T11-00-00-000Z-C-tuning",
      commit: "ccc8888",
      failureSeed: 2,
    }
    const { labels, groups } = tablesOfRuns([
      C_FALLBACK_085,
      C_FALLBACK_NONE,
      otherCommit,
    ])
    const expected = [
      "C tuning fallback 0.85 ccc7777",
      "C tuning fallback 0.85 ccc8888",
      "C tuning fallback none",
    ]
    expect([...labels].sort()).toEqual(expected)
    expect([...groups].sort()).toEqual(expected)
  })

  test("Revision 3 AC10 — a run that shares only the config and the split with a run of another split is not affected", () => {
    const test: RunSpec = {
      ...C_FALLBACK_085,
      name: "2026-10-10T12-00-00-000Z-C-test",
      split: "test",
      failureSeed: 3,
    }
    const { labels } = tablesOfRuns([C_FALLBACK_085, test])
    expect([...labels].sort()).toEqual([
      "C test fallback 0.85",
      "C tuning fallback 0.85",
    ])
  })
})

// ---------------------------------------------------------------------------
// Revision 4 — every fallback scope in the fallback text
// ---------------------------------------------------------------------------

const C_FALLBACK_08_NO_ANSWER = sweepRun(
  "2026-10-10T10-00-00-000Z",
  "ccc7777",
  { fallbackLow: 0.8, fallbackWhen: "no-answer" },
  5
)

describe("Revision 4 AC11 — the scope in the fallback text", () => {
  const sweep = [
    C_FALLBACK_08,
    C_FALLBACK_08_NOTHING_KEPT,
    C_FALLBACK_08_NO_ANSWER,
    C_FALLBACK_NONE,
  ]
  const tablesOf = (specs: RunSpec[]) => {
    const { cwd, runs } = workdir(specs)
    const page = generate(cwd, runs)
    const [main, categories, failures] = threeTables(page)
    return {
      main,
      stage: stageTable(page),
      labels: failureLabels(failures, specs.length),
      groups: categoryLabels(categories),
    }
  }

  test("Revision 4 AC11 — the fallback column reads 0.8 no-answer for a no-answer scope", () => {
    const { main } = tablesOf([C_FALLBACK_08_NO_ANSWER])
    expect(fallbackCells(main)).toEqual(["0.8 no-answer"])
  })

  test("Revision 4 AC11 — each scope has its own text: 0.8 (uncertain), 0.8 nothing-kept, 0.8 no-answer", () => {
    const { main, stage } = tablesOf(sweep)
    const expected = ["0.8", "0.8 nothing-kept", "0.8 no-answer", "none"].sort()
    expect(fallbackCells(main)).toEqual(expected)
    expect(fallbackCells(stage)).toEqual(expected)
  })

  test("Revision 4 AC11 — each row shows the fallback text of its own run", () => {
    const { main } = tablesOf(sweep)
    const fallback = column(main, /^fallback$/i)
    // The precision tells the runs apart (see sweepRun).
    const precision = column(main, /^context precision$/i)
    for (const [spec, cell] of [
      [C_FALLBACK_08, "0.8"],
      [C_FALLBACK_08_NOTHING_KEPT, "0.8 nothing-kept"],
      [C_FALLBACK_08_NO_ANSWER, "0.8 no-answer"],
      [C_FALLBACK_NONE, "none"],
    ] as const) {
      const rows = main.rows.filter((cells) =>
        showsRate(cells[precision]!, spec.precision)
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]![fallback]!).toBe(cell)
    }
  })

  test("Revision 4 AC11 — the label of the run carries it after the split, in the failure and category tables", () => {
    const { labels, groups } = tablesOf([C_FALLBACK_08_NO_ANSWER])
    expect(labels).toEqual(["C tuning fallback 0.8 no-answer"])
    expect(groups).toEqual(["C tuning fallback 0.8 no-answer"])
  })

  test("Revision 4 AC11 — the three scopes of the same threshold get three distinct labels, without commit or time", () => {
    const { labels, groups } = tablesOf(sweep)
    const expected = [
      "C tuning fallback 0.8",
      "C tuning fallback 0.8 nothing-kept",
      "C tuning fallback 0.8 no-answer",
      "C tuning fallback none",
    ].sort()
    expect([...labels].sort()).toEqual(expected)
    expect([...groups].sort()).toEqual(expected)
  })

  test("Revision 4 AC11 — two runs of the same no-answer fallback get the commit after the fallback text", () => {
    const otherCommit: RunSpec = {
      ...C_FALLBACK_08_NO_ANSWER,
      name: "2026-10-10T11-00-00-000Z-C-tuning",
      commit: "ccc8888",
      failureSeed: 3,
    }
    const { labels } = tablesOf([C_FALLBACK_08_NO_ANSWER, otherCommit])
    expect([...labels].sort()).toEqual([
      "C tuning fallback 0.8 no-answer ccc7777",
      "C tuning fallback 0.8 no-answer ccc8888",
    ])
  })

  test("Revision 4 AC11 — uncertain still adds nothing, and nothing-kept is unchanged", () => {
    const { main, labels } = tablesOf([
      C_FALLBACK_08,
      C_FALLBACK_08_NOTHING_KEPT,
    ])
    expect(fallbackCells(main)).toEqual(["0.8", "0.8 nothing-kept"])
    expect([...labels].sort()).toEqual([
      "C tuning fallback 0.8",
      "C tuning fallback 0.8 nothing-kept",
    ])
  })

  test("Revision 4 AC11 — a no-answer scope without a threshold adds nothing: the cell stays empty", () => {
    const withScopeOnly: RunSpec = {
      ...B_TEST,
      loopSettings: { fallbackWhen: "no-answer" },
    }
    const { main } = tablesOf([withScopeOnly, C_FALLBACK_085])
    const fallback = column(main, /^fallback$/i)
    expect(rowOf(main, withScopeOnly)[fallback]!).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Revision 5 — repeated runs, as mean and range
// ---------------------------------------------------------------------------

/**
 * The repeated runs table of docs/features/results-table.md, Revision 5, AC12.
 * A cell is the mean over the group, formatted as in the main table, then
 * ` [min–max]` (en dash, each bound formatted like the mean) when the group has
 * several runs and the values differ. Accuracy is the mean number correct with
 * one decimal over n, then the range of the counts: `53.3/60 [52–55]`, and
 * `43.0/60` when the counts are identical or the group has a single run.
 */
const REPEATED_HEADER = [
  "config",
  "split",
  "commit",
  "fallback",
  "runs",
  "context complete",
  "context precision",
  "retrieval cost/question (USD)",
  "retrieval latency p50 (ms)",
  "retrieval latency p95 (ms)",
  "accuracy",
  "embed cost (USD)",
  "judge cost (USD)",
  "fallback cost (USD)",
  "rewrite cost (USD)",
  "answer cost (USD)",
  "end-to-end cost/question (USD)",
  "end-to-end latency p50 (ms)",
]

let repeatedSeq = 0

/** A run of `base` with its own folder name (one minute apart) and the given measures. */
function repeated(base: RunSpec, overrides: Partial<RunSpec>): RunSpec {
  repeatedSeq++
  const merged = { ...base, ...overrides }
  const minutes = String(repeatedSeq).padStart(2, "0")
  return {
    ...merged,
    name: `2026-10-10T16-${minutes}-00-000Z-${merged.config}-${merged.split}`,
  }
}

/** The correct answers of a run that has `total` of them, filled category by category. */
function correctTotal(total: number): Record<Category, number> {
  let left = total
  return Object.fromEntries(
    CATEGORIES.map((category) => {
      const count = Math.min(left, CATEGORY_N[category])
      left -= count
      return [category, count]
    })
  ) as Record<Category, number>
}

/** The stage profile of `base` with some roles' mean cost replaced. */
function withRoleCosts(
  base: RunSpec,
  costUsd: Record<(typeof ROLES)[number], number>
): StageProfile {
  const stage = base.stage ?? NO_STAGE
  return { ...stage, costUsd: { ...stage.costUsd, ...costUsd } }
}

/**
 * Three runs of B on the test split at one commit, whose measures differ (but
 * the retrieval p95 and the embed and answer costs): the means are exact.
 */
const REPEATED_B = [
  repeated(B_TEST, {
    contextComplete: 0.8,
    precision: 0.5,
    costUsd: 0.003,
    p50: 5000,
    retrieval: { costUsd: 0.001, p50: 2000, p95: 6000 },
    correct: correctTotal(52),
    stage: withRoleCosts(B_TEST, { judge: 0.001, rewrite: 0.0006 }),
  }),
  repeated(B_TEST, {
    contextComplete: 0.85,
    precision: 0.6,
    costUsd: 0.0033,
    p50: 5200,
    retrieval: { costUsd: 0.0008, p50: 2500, p95: 6000 },
    correct: correctTotal(53),
    stage: withRoleCosts(B_TEST, { judge: 0.0016, rewrite: 0.0006 }),
  }),
  repeated(B_TEST, {
    contextComplete: 0.9,
    precision: 0.7,
    costUsd: 0.0036,
    p50: 5400,
    retrieval: { costUsd: 0.0012, p50: 3000, p95: 6000 },
    correct: correctTotal(55),
    stage: withRoleCosts(B_TEST, { judge: 0.001, rewrite: 0.0009 }),
  }),
]

/** One run of B on the test split from another commit. */
const REPEATED_B_OTHER_COMMIT = repeated(B_TEST, { commit: "bbb7777" })

/** Two runs of C on the tuning split, fallback 0.85: identical but for the fallback cost. */
const REPEATED_C = [
  repeated(C_TEST, {
    split: "tuning",
    loopSettings: { fallbackLow: 0.85 },
    correct: correctTotal(43),
    stage: withRoleCosts(C_TEST, { fallback: 0.0012 }),
  }),
  repeated(C_TEST, {
    split: "tuning",
    loopSettings: { fallbackLow: 0.85 },
    correct: correctTotal(43),
    stage: withRoleCosts(C_TEST, { fallback: 0.0014 }),
  }),
]

const C_TUNING_NONE = repeated(C_TEST, {
  split: "tuning",
  loopSettings: { fallbackLow: null },
})
const C_TUNING_OTHER_COMMIT = repeated(C_TEST, {
  split: "tuning",
  commit: "ccc8888",
  loopSettings: { fallbackLow: 0.85 },
})
const C_TEST_SPLIT = repeated(C_TEST, {
  split: "test",
  loopSettings: { fallbackLow: 0.85 },
})
const C_TUNING_NOTHING_KEPT = repeated(C_TEST, {
  split: "tuning",
  loopSettings: { fallbackLow: 0.8, fallbackWhen: "nothing-kept" },
})
const C_TUNING_08 = repeated(C_TEST, {
  split: "tuning",
  loopSettings: { fallbackLow: 0.8, fallbackWhen: "uncertain" },
})

/** Every group of the main fixture, each one a list of runs. */
const REPEATED_GROUPS: RunSpec[][] = [
  [A_TEST],
  REPEATED_B,
  [REPEATED_B_OTHER_COMMIT],
  [B_TUNING],
  REPEATED_C,
  [C_TUNING_NONE],
  [C_TUNING_OTHER_COMMIT],
  [C_TEST_SPLIT],
  [C_TUNING_NOTHING_KEPT],
  [C_TUNING_08],
]

const REPEATED_RUNS = REPEATED_GROUPS.flat()

/** Two runs of a summary from before the retrieval measures and the costs by role. */
const REPEATED_LEGACY = [
  repeated(B_TEST, {
    commit: "leg0001",
    legacy: true,
    costUsd: 0.003,
    p50: 5000,
    correct: correctTotal(51),
  }),
  repeated(B_TEST, {
    commit: "leg0001",
    legacy: true,
    costUsd: 0.0034,
    p50: 5400,
    correct: correctTotal(53),
  }),
]

/** Two runs whose records gave no retrieval measure: the summary holds them as null. */
const REPEATED_RETRIEVAL_NULL = [
  repeated(B_TEST, {
    commit: "bbb8888",
    retrieval: { costUsd: null, p50: null, p95: null },
  }),
  repeated(B_TEST, {
    commit: "bbb8888",
    retrieval: { costUsd: null, p50: null, p95: null },
  }),
]

/** Writes the runs, generates the page from their folders and returns it. */
function repeatedPage(specs: RunSpec[]): string {
  const { cwd, runs } = workdir(specs)
  return generate(cwd, runs)
}

/** The heading line, the table and the lines of the `## Repeated runs` section. */
function repeatedSection(page: string) {
  const lines = page.split("\n")
  const heading = lines.findIndex((l) => /^#{1,6}\s+repeated runs\s*$/i.test(l))
  expect({ heading: heading >= 0 }).toEqual({ heading: true })
  const next = lines.findIndex((l, i) => i > heading && l.startsWith("#"))
  const end = next < 0 ? lines.length : next
  const table = tablesOf(page).find(
    (candidate) => candidate.start > heading && candidate.start < end
  )
  expect({ table: table !== undefined }).toEqual({ table: true })
  return { lines, heading, end, table: table! }
}

/** The cells of the group's row by header, found by config, split, commit and fallback. */
function groupRow(
  table: Table,
  spec: RunSpec,
  fallback: string
): Record<string, string> {
  const key = [spec.config, spec.split, spec.commit, fallback]
  const rows = table.rows.filter((cells) =>
    key.every((value, index) => cells[index] === value)
  )
  expect({ key, rows: rows.length }).toEqual({ key, rows: 1 })
  return Object.fromEntries(
    table.header.map((name, index) => [name, rows[0]![index]!])
  )
}

function pick(row: Record<string, string>, headers: string[]) {
  return Object.fromEntries(headers.map((name) => [name, row[name]]))
}

describe("Revision 5 AC12 — the repeated runs section", () => {
  test("Revision 5 AC12 — a Repeated runs section comes before the Runs section", () => {
    const page = repeatedPage(REPEATED_RUNS)
    const { heading } = repeatedSection(page)
    const runsHeading = page
      .split("\n")
      .findIndex((l) => /^#{1,6}\s+runs\s*$/i.test(l))
    expect(runsHeading).toBeGreaterThan(heading)
  })

  test("Revision 5 AC12 — the section holds one table, with the columns in the order of the spec", () => {
    const page = repeatedPage(REPEATED_RUNS)
    const { lines, heading, end, table } = repeatedSection(page)
    expect(table.header).toEqual(REPEATED_HEADER)
    const tablesInSection = lines
      .slice(heading, end)
      .filter((l) => l.trimStart().startsWith("|") && /^\|[\s-|]+\|$/.test(l))
    expect(tablesInSection).toHaveLength(1)
  })

  test("Revision 5 AC12 — one row per group of runs sharing config, split, commit and fallback text; the main table keeps one row per run", () => {
    const page = repeatedPage(REPEATED_RUNS)
    const { table } = repeatedSection(page)
    expect(table.rows).toHaveLength(REPEATED_GROUPS.length)
    expect(table.rows.map((row) => row.slice(0, 5)).sort()).toEqual(
      [
        ["A", "test", "aaa1111", "", "1"],
        ["B", "test", "bbb3333", "", "3"],
        ["B", "test", "bbb7777", "", "1"],
        ["B", "tuning", "bbb4444", "", "1"],
        ["C", "tuning", "ccc6666", "0.85", "2"],
        ["C", "tuning", "ccc6666", "none", "1"],
        ["C", "tuning", "ccc8888", "0.85", "1"],
        ["C", "test", "ccc6666", "0.85", "1"],
        ["C", "tuning", "ccc6666", "0.8 nothing-kept", "1"],
        ["C", "tuning", "ccc6666", "0.8", "1"],
      ].sort()
    )
    expect(threeTables(page)[0].rows).toHaveLength(REPEATED_RUNS.length)
  })

  test("Revision 5 AC12 — a different commit makes another row", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    expect(groupRow(table, REPEATED_B[0]!, "").runs).toBe("3")
    expect(groupRow(table, REPEATED_B_OTHER_COMMIT, "").runs).toBe("1")
    expect(groupRow(table, C_TUNING_OTHER_COMMIT, "0.85").runs).toBe("1")
    expect(groupRow(table, REPEATED_C[0]!, "0.85").runs).toBe("2")
  })

  test("Revision 5 AC12 — a different split makes another row", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    expect(groupRow(table, C_TEST_SPLIT, "0.85").runs).toBe("1")
    expect(groupRow(table, REPEATED_C[0]!, "0.85").runs).toBe("2")
  })

  test("Revision 5 AC12 — a different fallback text makes another row: none, a threshold, a threshold with a scope", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    expect(groupRow(table, REPEATED_C[0]!, "0.85").runs).toBe("2")
    expect(groupRow(table, C_TUNING_NONE, "none").runs).toBe("1")
    expect(groupRow(table, C_TUNING_08, "0.8").runs).toBe("1")
    expect(
      groupRow(table, C_TUNING_NOTHING_KEPT, "0.8 nothing-kept").runs
    ).toBe("1")
  })

  test("Revision 5 AC12 — the rows are ordered by config, split and fallback text", () => {
    const { table } = repeatedSection(
      repeatedPage([
        C_TUNING_NONE,
        ...REPEATED_C,
        C_TEST_SPLIT,
        B_TUNING,
        REPEATED_B[0]!,
        A_TEST,
        C_TUNING_08,
      ])
    )
    expect(table.rows.map((row) => [row[0], row[1], row[3]])).toEqual([
      ["A", "test", ""],
      ["B", "test", ""],
      ["B", "tuning", ""],
      ["C", "test", "0.85"],
      ["C", "tuning", "0.8"],
      ["C", "tuning", "0.85"],
      ["C", "tuning", "none"],
    ])
  })

  test("Revision 5 AC12 — the fallback cell is empty for A and B, which have no fallback", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    expect(groupRow(table, A_TEST, "").fallback).toBe("")
    expect(groupRow(table, B_TUNING, "").fallback).toBe("")
  })
})

describe("Revision 5 AC12 — mean and range", () => {
  const row = () =>
    groupRow(
      repeatedSection(repeatedPage(REPEATED_RUNS)).table,
      REPEATED_B[0]!,
      ""
    )

  test("Revision 5 AC12 — context complete and precision: the mean as a percent with one decimal, then the range of the group", () => {
    expect(
      pick(row(), ["runs", "context complete", "context precision"])
    ).toEqual({
      runs: "3",
      "context complete": "85.0% [80.0%–90.0%]",
      "context precision": "60.0% [50.0%–70.0%]",
    })
  })

  test("Revision 5 AC12 — retrieval cost per question: the mean with 5 decimals, then the range", () => {
    expect(row()["retrieval cost/question (USD)"]).toBe(
      "0.00100 [0.00080–0.00120]"
    )
  })

  test("Revision 5 AC12 — retrieval latency p50 and p95 in ms without decimals; identical values show no range", () => {
    expect(
      pick(row(), ["retrieval latency p50 (ms)", "retrieval latency p95 (ms)"])
    ).toEqual({
      "retrieval latency p50 (ms)": "2500 [2000–3000]",
      "retrieval latency p95 (ms)": "6000",
    })
  })

  test("Revision 5 AC12 — accuracy: the mean number correct over n with one decimal, then the range of the counts", () => {
    expect(row().accuracy).toBe("53.3/60 [52–55]")
  })

  test("Revision 5 AC12 — the mean cost per question of each role, with the range when it differs", () => {
    expect(
      pick(row(), [
        "embed cost (USD)",
        "judge cost (USD)",
        "fallback cost (USD)",
        "rewrite cost (USD)",
        "answer cost (USD)",
      ])
    ).toEqual({
      "embed cost (USD)": "0.00040",
      "judge cost (USD)": "0.00120 [0.00100–0.00160]",
      "fallback cost (USD)": "0.00000",
      "rewrite cost (USD)": "0.00070 [0.00060–0.00090]",
      "answer cost (USD)": "0.00270",
    })
  })

  test("Revision 5 AC12 — end-to-end cost per question and latency p50", () => {
    expect(
      pick(row(), [
        "end-to-end cost/question (USD)",
        "end-to-end latency p50 (ms)",
      ])
    ).toEqual({
      "end-to-end cost/question (USD)": "0.00330 [0.00300–0.00360]",
      "end-to-end latency p50 (ms)": "5200 [5000–5400]",
    })
  })

  test("Revision 5 AC12 — a single run shows its values as in the main table, with no range", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    const single = groupRow(table, REPEATED_B_OTHER_COMMIT, "")
    expect(single).toEqual({
      config: "B",
      split: "test",
      commit: "bbb7777",
      fallback: "",
      runs: "1",
      "context complete": "90.0%",
      "context precision": "60.0%",
      "retrieval cost/question (USD)": "0.00110",
      "retrieval latency p50 (ms)": "2500",
      "retrieval latency p95 (ms)": "6200",
      accuracy: "51.0/60",
      "embed cost (USD)": "0.00040",
      "judge cost (USD)": "0.00160",
      "fallback cost (USD)": "0.00000",
      "rewrite cost (USD)": "0.00070",
      "answer cost (USD)": "0.00270",
      "end-to-end cost/question (USD)": "0.00310",
      "end-to-end latency p50 (ms)": "5200",
    })
  })

  test("Revision 5 AC12 — several runs with the same value show it once, with no range; only the measures that differ get one", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RUNS))
    expect(groupRow(table, REPEATED_C[0]!, "0.85")).toEqual({
      config: "C",
      split: "tuning",
      commit: "ccc6666",
      fallback: "0.85",
      runs: "2",
      "context complete": "90.0%",
      "context precision": "60.0%",
      "retrieval cost/question (USD)": "0.00060",
      "retrieval latency p50 (ms)": "1400",
      "retrieval latency p95 (ms)": "3100",
      accuracy: "43.0/60",
      "embed cost (USD)": "0.00050",
      "judge cost (USD)": "0.00080",
      "fallback cost (USD)": "0.00130 [0.00120–0.00140]",
      "rewrite cost (USD)": "0.00060",
      "answer cost (USD)": "0.00240",
      "end-to-end cost/question (USD)": "0.00310",
      "end-to-end latency p50 (ms)": "5200",
    })
  })

  test("Revision 5 AC12 — a measure absent from every run of the group (summaries from before the retrieval measures and the costs by role) shows -", () => {
    const { table } = repeatedSection(
      repeatedPage([...REPEATED_LEGACY, REPEATED_B_OTHER_COMMIT])
    )
    const legacy = groupRow(table, REPEATED_LEGACY[0]!, "")
    expect(legacy).toEqual({
      config: "B",
      split: "test",
      commit: "leg0001",
      fallback: "",
      runs: "2",
      "context complete": "90.0%",
      "context precision": "60.0%",
      "retrieval cost/question (USD)": "-",
      "retrieval latency p50 (ms)": "-",
      "retrieval latency p95 (ms)": "-",
      accuracy: "52.0/60 [51–53]",
      "embed cost (USD)": "-",
      "judge cost (USD)": "-",
      "fallback cost (USD)": "-",
      "rewrite cost (USD)": "-",
      "answer cost (USD)": "-",
      "end-to-end cost/question (USD)": "0.00320 [0.00300–0.00340]",
      "end-to-end latency p50 (ms)": "5200 [5000–5400]",
    })
    // The group next to it, which has them, still shows them.
    expect(
      groupRow(table, REPEATED_B_OTHER_COMMIT, "")["retrieval latency p50 (ms)"]
    ).toBe("2500")
  })

  test("Revision 5 AC12 — retrieval measures that are null in every run of the group show - too, the other measures stay", () => {
    const { table } = repeatedSection(repeatedPage(REPEATED_RETRIEVAL_NULL))
    const row = groupRow(table, REPEATED_RETRIEVAL_NULL[0]!, "")
    expect(
      pick(row, [
        "retrieval cost/question (USD)",
        "retrieval latency p50 (ms)",
        "retrieval latency p95 (ms)",
        "judge cost (USD)",
        "end-to-end cost/question (USD)",
      ])
    ).toEqual({
      "retrieval cost/question (USD)": "-",
      "retrieval latency p50 (ms)": "-",
      "retrieval latency p95 (ms)": "-",
      "judge cost (USD)": "0.00160",
      "end-to-end cost/question (USD)": "0.00310",
    })
  })
})

describe("Revision 5 AC13 — provenance of the repeated runs", () => {
  test("Revision 5 AC13 — under the table, one line per group lists the run folders of that group and no other", () => {
    const page = repeatedPage(REPEATED_RUNS)
    const { lines, table, end } = repeatedSection(page)
    const below = lines.slice(table.end + 1, end).filter((l) => l.trim() !== "")
    expect(below.length).toBeGreaterThanOrEqual(REPEATED_GROUPS.length)
    for (const group of REPEATED_GROUPS) {
      const names = group.map((spec) => spec.name)
      const others = REPEATED_RUNS.map((spec) => spec.name).filter(
        (name) => !names.includes(name)
      )
      const matching = below.filter((l) =>
        names.every((name) => l.includes(name))
      )
      expect({ names, lines: matching.length }).toEqual({ names, lines: 1 })
      expect(others.filter((name) => matching[0]!.includes(name))).toEqual([])
    }
  })

  test("Revision 5 AC13 — the provenance of the other tables is unchanged: all the run folders on one line", () => {
    const page = repeatedPage(REPEATED_RUNS)
    const { table } = repeatedSection(page)
    const lines = page.split("\n")
    const [main] = threeTables(page)
    const below = lines.slice(main.end + 1).find((l) => /^built from/i.test(l))
    expect(table.start).toBeLessThan(main.start)
    for (const spec of REPEATED_RUNS) expect(below).toContain(spec.name)
  })
})
