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
function makeRun(
  settings: object = SETTINGS,
  records: object[] = RECORDS,
  questions: Question[] = QUESTIONS
): Fixture {
  const root = makeTempDir()
  const runDir = join(root, "runs", "2026-10-08T10-00-00-000Z-A-test")
  mkdirSync(runDir, { recursive: true })
  const trace = [settings, ...records]
    .map((line) => JSON.stringify(line))
    .join("\n")
  writeFileSync(join(runDir, "trace.jsonl"), trace + "\n")
  writeFileSync(join(runDir, "summary.json"), '{"stale": true}\n')
  writeFileSync(join(runDir, "report.md"), "# Stale report\n")
  const questionsPath = join(root, "questions.json")
  writeFileSync(
    questionsPath,
    JSON.stringify({ world: { seed: 42, scale: 1 }, questions })
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

/** What the regrading recomputes; the rest of a record is kept as recorded. */
const REGRADED_FIELDS = [
  "recall",
  "grade",
  "contextComplete",
  "precision",
  "notesInContext",
]

function withoutGrading(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([name]) => !REGRADED_FIELDS.includes(name))
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

const OTHER = "Notes/other.md"

/** The questions of the loop run: the three above, then three more. */
const LOOP_QUESTIONS: Question[] = [
  ...QUESTIONS,
  {
    id: "q-204",
    split: "test",
    category: "simple",
    question: "Which warehouse ships the enclosure?",
    expected: { kind: "value", values: ["Reno"] },
    stale: [],
    sources: [B],
    sourceGroups: [[B]],
    entity: "project-0001",
    refs: ["fact-0002"],
  },
  {
    id: "q-205",
    split: "test",
    category: "simple",
    question: "Who signed the supplier contract?",
    expected: { kind: "value", values: ["Lena Greer"] },
    stale: [],
    sources: [A],
    sourceGroups: [[A]],
    entity: "supplier-0001",
    refs: ["fact-0003"],
  },
  {
    id: "q-206",
    split: "test",
    category: "simple",
    question: "What is the unit price of the cable?",
    expected: { kind: "value", values: ["$12"] },
    stale: [],
    sources: [A],
    sourceGroups: [[A]],
    entity: "supplier-0001",
    refs: ["fact-0004"],
  },
]

const LOOP_SETTINGS = {
  config: "B",
  split: "test",
  k: 5,
  candidates: 50,
  models: {
    judge: "claude-haiku-5-5",
    answerer: "claude-haiku-5-5",
    embedder: "mistral-embed",
  },
  loop: { rewriter: "llm", candidates: 50 },
  prices: { "claude-haiku-5-5": { input: 0.1, output: 0.5 } },
  thresholds: {},
  gitCommit: "abc1234",
  index: { vault: "/vaults/larkspur", notes: 202, chunks: 1534, links: 611 },
}

const HAIKU_CALL = {
  model: "claude-haiku-5-5",
  inputTokens: 1000,
  outputTokens: 100,
  latencyMs: 300,
}

function answeredWith(value: string) {
  return { status: "answered", value, answer: value, citations: [] }
}

function loopTrace(
  lists: {
    judged?: Record<string, Record<string, number>>
    kept?: string[]
    frontier?: string[]
  } = {},
  outcome = { type: "answer", rule: "sufficient" }
) {
  return {
    outcome,
    hops: 1,
    rewrites: 0,
    steps: [],
    judged: {},
    kept: [],
    frontier: [],
    ...lists,
  }
}

/**
 * Records of a loop run as an older grader left them (every grade is stale):
 * - q-201: A was kept but is not in the context (cut by the budget);
 * - q-202: B was judged and not kept;
 * - q-205: B is in the context twice, A is only in the frontier;
 * - q-206: the context is complete, the answer is right;
 * - q-203: the answerer threw, the failure stays;
 * - q-204: the loop threw, the failure stays.
 */
const LOOP_RECORDS = [
  {
    id: "q-201",
    split: "test",
    category: "simple",
    contextNotes: [],
    recall: 1,
    output: answeredWith("$900"),
    loop: loopTrace({ judged: { [A]: { relevance: 0.9 } }, kept: [A] }),
    grade: { correct: false, failure: "retrieval_miss" },
    calls: [HAIKU_CALL],
    latencyMs: 500,
    costUsd: 0.0002,
  },
  {
    id: "q-202",
    split: "test",
    category: "multi_hop",
    contextNotes: [A],
    recall: 1,
    output: answeredWith("Someone Else"),
    loop: loopTrace({
      judged: { [A]: { relevance: 0.9 }, [B]: { relevance: 0.2 } },
      kept: [A],
    }),
    grade: { correct: false, failure: "false_abstention" },
    calls: [HAIKU_CALL],
    latencyMs: 600,
    costUsd: 0.0002,
  },
  {
    id: "q-203",
    split: "test",
    category: "no_answer",
    contextNotes: [A, OTHER],
    recall: 1,
    output: null,
    error: "output truncated",
    loop: loopTrace({ judged: { [A]: { relevance: 0.9 } }, kept: [A, OTHER] }),
    grade: { correct: false, failure: "answer_error" },
    calls: [HAIKU_CALL],
    latencyMs: 700,
    costUsd: 0.0002,
  },
  {
    id: "q-204",
    split: "test",
    category: "simple",
    contextNotes: [],
    recall: 1,
    output: null,
    error: "judge returned an invalid answer",
    loop: loopTrace({}, { type: "error", rule: "loop_error" }),
    grade: { correct: false, failure: "loop_error" },
    calls: [HAIKU_CALL],
    latencyMs: 800,
    costUsd: 0.0002,
  },
  {
    id: "q-205",
    split: "test",
    category: "simple",
    contextNotes: [B, B],
    recall: 1,
    output: answeredWith("Someone Else"),
    loop: loopTrace({
      judged: { [B]: { relevance: 0.9 } },
      kept: [B],
      frontier: [A],
    }),
    grade: { correct: false, failure: "wrong_answer" },
    calls: [HAIKU_CALL],
    latencyMs: 900,
    costUsd: 0.0002,
  },
  {
    id: "q-206",
    split: "test",
    category: "simple",
    contextNotes: [A, A],
    recall: 0,
    output: answeredWith("$12"),
    loop: loopTrace({ judged: { [A]: { relevance: 0.9 } }, kept: [A] }),
    grade: { correct: false, failure: "wrong_answer" },
    calls: [HAIKU_CALL],
    latencyMs: 1000,
    costUsd: 0.0002,
  },
]

describe("AC15 — regrading of the context measures and the layers", () => {
  test("AC15 — an old trace is regraded with the measures of AC10", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    const { records } = readTrace(runDir)
    // q-201: context [A, other], one source group, A covers it.
    expect(records[0]!.contextComplete).toBe(true)
    expect(records[0]!.precision).toBe(0.5)
    expect(records[0]!.notesInContext).toBe(2)
    // q-202: the group of B was never retrieved.
    expect(records[1]!.contextComplete).toBe(false)
    expect(records[1]!.precision).toBe(0.5)
    expect(records[1]!.notesInContext).toBe(2)
  })

  test("AC15 — without a loop in the trace, the retrieval failure is a retrieval_miss", () => {
    const { runDir, questionsPath } = makeRun()
    regrade([runDir, "--questions", questionsPath])
    expect(readTrace(runDir).records[1]!.grade).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  function loopRun() {
    const fixture = makeRun(LOOP_SETTINGS, LOOP_RECORDS, LOOP_QUESTIONS)
    const result = regrade([
      fixture.runDir,
      "--questions",
      fixture.questionsPath,
    ])
    return { ...fixture, ...readTrace(fixture.runDir), result }
  }

  test("AC15 — regrades a loop run with exit code 0", () => {
    const { result } = loopRun()
    expect(result.stderr).toBe("")
    expect(result.exitCode).toBe(0)
  })

  test("AC15 — the grade uses the judged, kept and frontier of the loop in the trace", () => {
    const { records } = loopRun()
    const failures: Record<string, unknown> = {}
    for (const r of records) {
      failures[r.id as string] = (r.grade as { failure: unknown }).failure
    }
    expect(failures).toEqual({
      "q-201": "context_budget",
      "q-202": "judge_rejected",
      "q-203": "answer_error",
      "q-204": "loop_error",
      "q-205": "not_followed",
      "q-206": null,
    })
  })

  test("AC15 — a regraded correct answer is marked correct", () => {
    const { records } = loopRun()
    expect(records[5]!.grade).toEqual({ correct: true, failure: null })
  })

  test("AC15 — records without output keep their failure, answer_error or loop_error", () => {
    const { records } = loopRun()
    expect(records[2]!.grade).toEqual({
      correct: false,
      failure: "answer_error",
    })
    expect(records[3]!.grade).toEqual({
      correct: false,
      failure: "loop_error",
    })
  })

  test("AC15 — recall, contextComplete, precision and notesInContext are recomputed from the context notes", () => {
    const { records } = loopRun()
    const measures = records.map((r) => [
      r.id,
      r.recall,
      r.contextComplete,
      r.precision,
      r.notesInContext,
    ])
    expect(measures).toEqual([
      // Empty context, one group: nothing covered, no precision.
      ["q-201", 0, false, null, 0],
      // A covers the first group, B is missing; A is the only note.
      ["q-202", 0.5, false, 1, 1],
      // No source: no recall, no completeness; A and other are not sources.
      ["q-203", null, null, 0, 2],
      // The loop failed: an empty context.
      ["q-204", 0, false, null, 0],
      // B twice, but the group needs A: one distinct note, not a source.
      ["q-205", 0, false, 0, 1],
      // A twice, one distinct note, a source.
      ["q-206", 1, true, 1, 1],
    ])
  })

  test("AC15 — keeps the loop, the outputs, the calls and the cost as recorded", () => {
    const { records } = loopRun()
    expect(records.map(withoutGrading)).toEqual(
      LOOP_RECORDS.map(withoutGrading)
    )
  })

  test("AC15 — summary.json holds the metrics of the regraded records, with the layers", () => {
    const { runDir, records } = loopRun()
    const written = JSON.parse(
      readFileSync(join(runDir, "summary.json"), "utf8")
    ) as ReturnType<typeof summarize>
    const expected = summarize(
      records as unknown as Parameters<typeof summarize>[0]
    )
    expect(written).toEqual(
      JSON.parse(JSON.stringify(expected)) as typeof written
    )
    const overall = written.overall as unknown as Record<string, unknown>
    expect(overall.n).toBe(6)
    expect(overall.accuracy as number).toBeCloseTo(1 / 6, 9)
    expect(overall.failuresByFamily).toEqual({ retrieval: 4, answer: 1 })
    expect(overall.contextCompleteRate as number).toBeCloseTo(1 / 5, 9)
    expect(overall.meanNotesInContext as number).toBeCloseTo(5 / 6, 9)
    const failures = written.overall.failures as Record<string, number>
    expect(failures.context_budget).toBe(1)
    expect(failures.judge_rejected).toBe(1)
    expect(failures.not_followed).toBe(1)
    expect(failures.loop_error).toBe(1)
    expect(failures.answer_error).toBe(1)
    expect(failures.retrieval_miss).toBe(0)
  })

  test("AC15 — report.md lists the regraded failures with their question ids and shows k and candidates", () => {
    const { runDir } = loopRun()
    const report = readFileSync(join(runDir, "report.md"), "utf8")
    expect(report.split("\n")).toContain(
      "k = 5, candidates = 50, commit abc1234"
    )
    for (const [failure, questionId] of [
      ["context_budget", "q-201"],
      ["judge_rejected", "q-202"],
      ["not_followed", "q-205"],
      ["loop_error", "q-204"],
      ["answer_error", "q-203"],
    ] as const) {
      const at = report.indexOf(`### ${failure}`)
      expect(at).toBeGreaterThanOrEqual(0)
      expect(report.indexOf(questionId, at)).toBeGreaterThanOrEqual(0)
    }
    expect(report).not.toContain("### retrieval_miss")
  })

  test("AC15 — regrading a loop run twice gives the same records, summary and report", () => {
    const { runDir, questionsPath, records, result } = loopRun()
    expect(result.exitCode).toBe(0)
    const first = {
      summary: readFileSync(join(runDir, "summary.json"), "utf8"),
      report: readFileSync(join(runDir, "report.md"), "utf8"),
    }
    expect(regrade([runDir, "--questions", questionsPath]).exitCode).toBe(0)
    expect(readTrace(runDir).records).toEqual(records)
    expect(readFileSync(join(runDir, "summary.json"), "utf8")).toBe(
      first.summary
    )
    expect(readFileSync(join(runDir, "report.md"), "utf8")).toBe(first.report)
  })
})
