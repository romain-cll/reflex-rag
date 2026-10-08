import { afterAll, describe, expect, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { Question } from "../evals/schema.ts"
import { summarize } from "../src/eval/run.ts"

const scriptPath = resolve(import.meta.dir, "regrade-run.ts")

const A = "Notes/a.md"
const B = "Notes/b.md"
const MILLION = 1_000_000

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-regrade-"))
  tempDirs.push(dir)
  return dir
}

/** The two graded questions and a third one the trace does not reach. */
const QUESTIONS: Question[] = [
  {
    id: "q-201",
    split: "test",
    category: "simple",
    question: "What price per unit did the supplier give?",
    expected: { kind: "value", values: ["$90"] },
    stale: [],
    sources: [A],
    sourceGroups: [[A]],
    entity: "supplier-0001",
    refs: ["fact-0001"],
  },
  {
    id: "q-202",
    split: "test",
    category: "multi_hop",
    question: "Who is the contact at the supplier building the enclosure?",
    expected: { kind: "value", values: ["Anya Castillo"] },
    stale: [],
    sources: [A, B],
    sourceGroups: [[A], [B]],
    entity: "project-0001",
    refs: ["chain-0001"],
  },
  {
    id: "q-203",
    split: "test",
    category: "no_answer",
    question: "Has Larkspur filed a patent?",
    expected: { kind: "abstain" },
    stale: [],
    sources: [],
    sourceGroups: [],
    entity: "company:patent",
    refs: ["absent-0001"],
  },
]

const SETTINGS = {
  config: "A",
  split: "test",
  k: 8,
  models: { answerer: "claude-haiku-5-5", embedder: "mistral-embed" },
  prices: { "claude-haiku-5-5": { input: 0.1, output: 0.5 } },
  thresholds: {},
  gitCommit: "abc1234",
  index: { vault: "/vaults/larkspur", notes: 202, chunks: 1534, links: 611 },
}

/**
 * Two records graded by an older grader:
 * - q-201 answered "$900" for an expected "$90": marked correct by the old
 *   substring match;
 * - q-202 abstained with one of its two source groups missing: recall counted
 *   any source, the failure was a false abstention.
 */
const RECORDS = [
  {
    id: "q-201",
    split: "test",
    category: "simple",
    contextNotes: [A, "Notes/other.md"],
    recall: 1,
    output: {
      status: "answered",
      value: "$900",
      answer: "The supplier quoted $900 per unit.",
      citations: [A],
    },
    grade: { correct: true, failure: null },
    calls: [
      {
        model: "mistral-embed",
        inputTokens: 20,
        outputTokens: 0,
        latencyMs: 40,
      },
      {
        model: "claude-sonnet-5-5",
        inputTokens: MILLION,
        outputTokens: 0,
        latencyMs: 700,
      },
    ],
    latencyMs: 812.5,
    costUsd: 2.000002,
  },
  {
    id: "q-202",
    split: "test",
    category: "multi_hop",
    contextNotes: [A, "Notes/other.md"],
    recall: 1,
    output: {
      status: "abstained",
      value: "",
      answer: "The excerpts do not say.",
      citations: [],
    },
    grade: { correct: false, failure: "false_abstention" },
    calls: [
      {
        model: "claude-haiku-5-5",
        inputTokens: 3000,
        outputTokens: 40,
        latencyMs: 500,
      },
    ],
    latencyMs: 640.25,
    costUsd: 0.00032,
  },
]

interface Fixture {
  runDir: string
  questionsPath: string
}

/** A run folder with stale outputs, and a question file next to it. */
function makeRun(): Fixture {
  const root = makeTempDir()
  const runDir = join(root, "runs", "2026-10-08T10-00-00-000Z-A-test")
  mkdirSync(runDir, { recursive: true })
  const trace = [SETTINGS, ...RECORDS]
    .map((line) => JSON.stringify(line))
    .join("\n")
  writeFileSync(join(runDir, "trace.jsonl"), trace + "\n")
  writeFileSync(join(runDir, "summary.json"), '{"stale": true}\n')
  writeFileSync(join(runDir, "report.md"), "# Stale report\n")
  const questionsPath = join(root, "questions.json")
  writeFileSync(
    questionsPath,
    JSON.stringify({ world: { seed: 42, scale: 1 }, questions: QUESTIONS })
  )
  return { runDir, questionsPath }
}

/** Runs the script from an empty folder, without any API key. */
function regrade(args: string[], cwd = makeTempDir()) {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.MISTRAL_API_KEY
  const result = Bun.spawnSync(["bun", scriptPath, ...args], { cwd, env })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

function readTrace(runDir: string): {
  settings: Record<string, unknown>
  records: Array<Record<string, unknown>>
} {
  const lines = readFileSync(join(runDir, "trace.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
  return { settings: lines[0]!, records: lines.slice(1) }
}

function withoutGrading(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([name]) => name !== "recall" && name !== "grade"
    )
  )
}

describe("AC8 — offline regrading", () => {
  test("AC8 — exits with code 0 and rewrites the run in place, with no API key in the environment", () => {
    const { runDir, questionsPath } = makeRun()
    const { exitCode, stderr } = regrade([runDir, "--questions", questionsPath])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })

  test("AC8 — rewrites recall on the source groups of each record", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const { records } = readTrace(runDir)
    expect(records.map((r) => r.id)).toEqual(["q-201", "q-202"])
    expect(records.map((r) => r.recall)).toEqual([1, 0.5])
  })

  test("AC8 — rewrites the grade of each record with the current grader", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const { records } = readTrace(runDir)
    // "$900" is not "$90" any more.
    expect(records[0]!.grade).toEqual({
      correct: false,
      failure: "wrong_answer",
    })
    // One source group was never retrieved.
    expect(records[1]!.grade).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  test("AC8 — keeps the outputs, the calls, the context, the latency and the cost as recorded", () => {
    const { runDir, questionsPath } = makeRun()
    const { exitCode } = regrade([runDir, "--questions", questionsPath])
    expect(exitCode).toBe(0)
    const { records } = readTrace(runDir)
    expect(records.map(withoutGrading)).toEqual(RECORDS.map(withoutGrading))
  })

  test("AC8 — keeps the settings of the run and adds the regrading commit and date", () => {
    const { runDir, questionsPath } = makeRun()
    const before = Date.now()
    regrade([runDir, "--questions", questionsPath])
    const { settings } = readTrace(runDir)
    const { regraded, ...kept } = settings
    expect(kept).toEqual(SETTINGS)
    const info = regraded as { gitCommit: unknown; date: unknown }
    expect(typeof info.gitCommit).toBe("string")
    expect((info.gitCommit as string).length).toBeGreaterThan(0)
    expect(typeof info.date).toBe("string")
    const at = Date.parse(info.date as string)
    expect(Number.isNaN(at)).toBe(false)
    expect(Math.abs(at - before)).toBeLessThan(5 * 60_000)
  })

  test("AC8 — the trace keeps its layout: one settings line then one line per record", () => {
    const { runDir, questionsPath } = makeRun()
    const { exitCode } = regrade([runDir, "--questions", questionsPath])
    expect(exitCode).toBe(0)
    const text = readFileSync(join(runDir, "trace.jsonl"), "utf8")
    expect(text.endsWith("\n")).toBe(true)
    expect(text.trim().split("\n")).toHaveLength(3)
  })

  test("AC8 — rewrites summary.json from the regraded records", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const { records } = readTrace(runDir)
    const written = JSON.parse(
      readFileSync(join(runDir, "summary.json"), "utf8")
    ) as ReturnType<typeof summarize>
    const expected = summarize(
      records as unknown as Parameters<typeof summarize>[0]
    )
    expect(written).toEqual(
      JSON.parse(JSON.stringify(expected)) as typeof written
    )
    expect(written.overall.n).toBe(2)
    expect(written.overall.accuracy).toBe(0)
    expect(written.overall.meanRecall).toBeCloseTo(0.75, 9)
    expect(written.overall.failures.retrieval_miss).toBe(1)
    expect(written.overall.failures.wrong_answer).toBe(1)
    expect(written.overall.failures.false_abstention).toBe(0)
    expect(written.overall.meanCostUsd).toBeCloseTo((2.000002 + 0.00032) / 2, 9)
  })

  test("AC8 — rewrites report.md with the regraded failures and their question ids", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const report = readFileSync(join(runDir, "report.md"), "utf8")
    expect(report).not.toContain("Stale report")
    expect(report).toContain("multi_hop")
    const missAt = report.indexOf("retrieval_miss")
    expect(report.indexOf("q-202", missAt)).toBeGreaterThanOrEqual(0)
    const wrongAt = report.indexOf("### wrong_answer")
    expect(wrongAt).toBeGreaterThanOrEqual(0)
    expect(report.indexOf("q-201", wrongAt)).toBeGreaterThanOrEqual(0)
    expect(report).not.toContain("### false_abstention")
  })

  test("AC8 — regrading twice gives the same grades, summary and report", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const first = {
      records: readTrace(runDir).records,
      summary: readFileSync(join(runDir, "summary.json"), "utf8"),
      report: readFileSync(join(runDir, "report.md"), "utf8"),
    }
    const { exitCode } = regrade([runDir, "--questions", questionsPath])
    expect(exitCode).toBe(0)
    expect(readTrace(runDir).records).toEqual(first.records)
    expect(readFileSync(join(runDir, "summary.json"), "utf8")).toBe(
      first.summary
    )
    expect(readFileSync(join(runDir, "report.md"), "utf8")).toBe(first.report)
  })

  test("AC8 — the questions default to evals/dev/questions.json of the working directory", () => {
    const { runDir, questionsPath } = makeRun()
    const cwd = makeTempDir()
    mkdirSync(join(cwd, "evals", "dev"), { recursive: true })
    writeFileSync(
      join(cwd, "evals", "dev", "questions.json"),
      readFileSync(questionsPath)
    )
    const { exitCode } = regrade([runDir], cwd)
    expect(exitCode).toBe(0)
    expect(readTrace(runDir).records.map((r) => r.recall)).toEqual([1, 0.5])
  })
})
