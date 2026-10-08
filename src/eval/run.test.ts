import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Question } from "../../evals/schema.ts"
import type { ModelCall } from "../core/types.ts"
import { runEval, summarize } from "./run.ts"

type RunRecord = Parameters<typeof summarize>[0][number]

interface ContextChunk {
  notePath: string
  noteDate: string | null
  heading: string
  text: string
}

interface Output {
  status: "answered" | "conflict" | "abstained"
  answer: string
  citations: string[]
}

/** What the fake retriever and answerer return for one question. */
interface Step {
  notes: string[]
  retrievalCalls?: ModelCall[]
  output: Output
  answerCall?: ModelCall
}

const MILLION = 1_000_000

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-eval-run-"))
  tempDirs.push(dir)
  return dir
}

function call(
  model: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number
): ModelCall {
  return { model, inputTokens, outputTokens, latencyMs }
}

function id(n: number): string {
  return `q-${String(n).padStart(3, "0")}`
}

function makeQuestion(n: number, overrides: Partial<Question> = {}): Question {
  return {
    id: id(n),
    split: "test",
    category: "simple",
    question: `Question text ${id(n)}`,
    expected: { kind: "value", values: ["Denver"] },
    stale: ["Portland"],
    sources: [`Notes/source-${n}.md`],
    entity: "customer-0001",
    refs: ["fact-0001"],
    ...overrides,
  }
}

function answered(answer: string): Output {
  return { status: "answered", answer, citations: [] }
}

function chunk(notePath: string): ContextChunk {
  return { notePath, noteDate: null, heading: "Heading", text: "Text." }
}

/** A step for `question` whose answer is correct and whose sources were retrieved. */
function goodStep(question: Question): Step {
  return {
    notes: question.sources,
    output: answered("Denver"),
    answerCall: call("claude-haiku-5-5", 1000, 100, 300),
  }
}

/** Fake retrieve and answer functions scripted by question text. */
function fakes(steps: Map<string, Step>) {
  const retrieved: Array<{ query: string; k: number }> = []
  const answerCalls: Array<{ question: string; context: ContextChunk[] }> = []
  const contexts = new Map<string, ContextChunk[]>()

  return {
    retrieved,
    answerCalls,
    contexts,
    retrieve: (query: string, k: number) => {
      retrieved.push({ query, k })
      const step = steps.get(query)
      if (!step) throw new Error(`unscripted question: ${query}`)
      const context = step.notes.map(chunk)
      contexts.set(query, context)
      return Promise.resolve({ context, calls: step.retrievalCalls ?? [] })
    },
    answer: (question: string, context: ContextChunk[]) => {
      answerCalls.push({ question, context })
      const step = steps.get(question)
      if (!step) throw new Error(`unscripted question: ${question}`)
      return Promise.resolve({
        output: step.output,
        call: step.answerCall ?? call("claude-haiku-5-5", 0, 0, 0),
      })
    },
  }
}

function scripted(questions: Question[], overrides: Map<string, Step>) {
  const steps = new Map<string, Step>()
  for (const q of questions) {
    steps.set(q.question, overrides.get(q.id) ?? goodStep(q))
  }
  return fakes(steps)
}

interface RunOptions {
  k?: number
  maxCostUsd?: number
  runsDir?: string
  overrides?: Map<string, Step>
}

/** Always writes into a temporary runs folder, never into the repository. */
function runWith(questions: Question[], options: RunOptions = {}) {
  const runsDir = options.runsDir ?? join(makeTempDir(), "runs")
  const fake = scripted(questions, options.overrides ?? new Map<string, Step>())
  const result = runEval({
    questions,
    retrieve: fake.retrieve,
    answer: fake.answer,
    k: options.k ?? 8,
    maxCostUsd: options.maxCostUsd ?? 1000,
    runsDir,
    config: "A",
    split: "test",
    models: { answerer: "claude-haiku-5-5", embedder: "mistral-embed" },
    thresholds: {},
    gitCommit: "abc1234",
  })
  return { fake, runsDir, result }
}

function readRunDir(runsDir: string): string {
  const entries = readdirSync(runsDir)
  expect(entries).toHaveLength(1)
  return join(runsDir, entries[0]!)
}

describe("AC3 — run records", () => {
  test("AC3 — processes the questions in order and records id, split, category and output", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, { split: "tuning", category: "temporal" }),
      makeQuestion(3, { category: "multi_hop" }),
    ]
    const { fake, result } = runWith(questions)
    const { records } = await result
    expect(fake.retrieved.map((r) => r.query)).toEqual(
      questions.map((q) => q.question)
    )
    expect(records.map((r) => r.id)).toEqual(["q-001", "q-002", "q-003"])
    expect(records.map((r) => r.split)).toEqual(["test", "tuning", "test"])
    expect(records.map((r) => r.category)).toEqual([
      "simple",
      "temporal",
      "multi_hop",
    ])
    expect(records[0]!.output).toEqual(answered("Denver"))
  })

  test("AC3 — retrieve receives the question text and k, answer receives the question text and the retrieved context", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const { fake, result } = runWith(questions, { k: 5 })
    await result
    expect(fake.retrieved).toEqual([
      { query: questions[0]!.question, k: 5 },
      { query: questions[1]!.question, k: 5 },
    ])
    expect(fake.answerCalls.map((a) => a.question)).toEqual(
      questions.map((q) => q.question)
    )
    expect(fake.answerCalls[0]!.context).toEqual(
      fake.contexts.get(questions[0]!.question)!
    )
  })

  test("AC3 — contextNotes lists the note paths of the retrieved context", async () => {
    const question = makeQuestion(1, { sources: ["A.md", "B.md"] })
    const overrides = new Map([
      [
        question.id,
        {
          notes: ["A.md", "C.md"],
          output: answered("Denver"),
        },
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.contextNotes).toEqual(["A.md", "C.md"])
  })

  test("AC3 — recall is the share of the sources found among the context notes", async () => {
    const questions = [
      makeQuestion(1, { sources: ["A.md", "B.md"] }),
      makeQuestion(2, { sources: ["A.md", "B.md"] }),
      makeQuestion(3, { sources: ["A.md", "B.md"] }),
    ]
    const step = (notes: string[]): Step => ({
      notes,
      output: answered("Denver"),
    })
    const overrides = new Map([
      ["q-001", step(["A.md", "B.md", "C.md"])],
      ["q-002", step(["B.md", "C.md"])],
      ["q-003", step(["C.md"])],
    ])
    const { records } = await runWith(questions, { overrides }).result
    expect(records.map((r) => r.recall)).toEqual([1, 0.5, 0])
  })

  test("AC3 — recall is null for an abstain question", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
    })
    const overrides = new Map([
      [
        question.id,
        {
          notes: ["Other.md"],
          output: {
            status: "abstained" as const,
            answer: "Not in the notes.",
            citations: [],
          },
        },
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.recall).toBeNull()
  })

  test("AC3 — the grade is the result of grading the output against the context notes", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const overrides = new Map([
      [
        "q-002",
        { notes: ["Other.md"], output: answered("Austin") } satisfies Step,
      ],
    ])
    const { records } = await runWith(questions, { overrides }).result
    expect(records[0]!.grade).toEqual({ correct: true, failure: null })
    expect(records[1]!.grade).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  test("AC3 — calls lists the retrieval calls then the answer call", async () => {
    const question = makeQuestion(1)
    const embed = call("mistral-embed", 20, 0, 40)
    const answerCall = call("claude-haiku-5-5", 1500, 80, 600)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          retrievalCalls: [embed],
          output: answered("Denver"),
          answerCall,
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.calls).toEqual([embed, answerCall])
  })

  test("AC3 — costUsd sums the calls priced by model from the price table", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          // 0.10 USD per million input tokens.
          retrievalCalls: [call("mistral-embed", MILLION, 0, 10)],
          output: answered("Denver"),
          // 0.10 USD per million input tokens, 0.50 per million output tokens.
          answerCall: call("claude-haiku-5-5", MILLION, MILLION, 100),
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.costUsd).toBeCloseTo(0.7, 9)
  })

  test("AC3 — costUsd prices claude-sonnet-5-5 at 2 USD input and 10 USD output per million tokens", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          output: answered("Denver"),
          answerCall: call("claude-sonnet-5-5", MILLION, MILLION, 100),
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.costUsd).toBeCloseTo(12, 9)
  })

  test("AC3 — costUsd is proportional to the tokens", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          output: answered("Denver"),
          answerCall: call("claude-haiku-5-5", 1000, 200, 100),
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    // 1000 * 0.10 / 1e6 + 200 * 0.50 / 1e6
    expect(records[0]!.costUsd).toBeCloseTo(0.0002, 9)
  })

  test("AC3 — latencyMs is present on every record", async () => {
    const { records } = await runWith([makeQuestion(1), makeQuestion(2)]).result
    for (const record of records) {
      expect(typeof record.latencyMs).toBe("number")
      expect(Number.isFinite(record.latencyMs)).toBe(true)
      expect(record.latencyMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("AC4 — cost cap", () => {
  /** Each question costs exactly 2 USD (one million sonnet input tokens). */
  function expensive(questions: Question[]): Map<string, Step> {
    return new Map(
      questions.map((q) => [
        q.id,
        {
          notes: q.sources,
          output: answered("Denver"),
          answerCall: call("claude-sonnet-5-5", MILLION, 0, 100),
        } satisfies Step,
      ])
    )
  }

  test("AC4 — stops before the question once the cumulative cost has reached the cap and reports the skipped ones", async () => {
    const questions = [1, 2, 3, 4, 5].map((n) => makeQuestion(n))
    const { fake, result } = runWith(questions, {
      maxCostUsd: 3,
      overrides: expensive(questions),
    })
    const { records, skipped } = await result
    // 2 USD after the first question (below 3), 4 USD after the second.
    expect(records.map((r) => r.id)).toEqual(["q-001", "q-002"])
    expect(skipped).toBe(3)
    expect(fake.retrieved).toHaveLength(2)
  })

  test("AC4 — a cumulative cost equal to the cap counts as reached", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const { result } = runWith(questions, {
      maxCostUsd: 4,
      overrides: expensive(questions),
    })
    const { records, skipped } = await result
    expect(records).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  test("AC4 — the cost of the retrieval calls counts toward the cap", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const overrides = new Map(
      questions.map((q) => [
        q.id,
        {
          notes: q.sources,
          // 2 USD of retrieval and nothing for the answer.
          retrievalCalls: [call("claude-sonnet-5-5", MILLION, 0, 10)],
          output: answered("Denver"),
        } satisfies Step,
      ])
    )
    const { result } = runWith(questions, { maxCostUsd: 2, overrides })
    const { records, skipped } = await result
    expect(records).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  test("AC4 — a run under the cap processes every question and skips none", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const { result } = runWith(questions, { maxCostUsd: 1 })
    const { records, skipped } = await result
    expect(records).toHaveLength(3)
    expect(skipped).toBe(0)
  })

  test("AC4 — a cap of zero is reached before the first question", async () => {
    const questions = [1, 2].map((n) => makeQuestion(n))
    const { fake, result } = runWith(questions, { maxCostUsd: 0 })
    const { records, skipped } = await result
    expect(records).toEqual([])
    expect(skipped).toBe(2)
    expect(fake.retrieved).toEqual([])
  })
})

function makeRecord(n: number, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: id(n),
    split: "test",
    category: "simple",
    contextNotes: [],
    recall: 1,
    output: answered("Denver"),
    grade: { correct: true, failure: null },
    calls: [call("claude-haiku-5-5", 1000, 100, 300)],
    latencyMs: 300,
    costUsd: 0.01,
    ...overrides,
  }
}

const wrong = (
  failure: "retrieval_miss" | "wrong_answer" | "false_abstention"
) => ({ correct: false, failure })

describe("AC5 — metrics", () => {
  test("AC5 — accuracy is correct over n, per category and overall", () => {
    const records = [
      makeRecord(1, { category: "simple" }),
      makeRecord(2, { category: "simple", grade: wrong("wrong_answer") }),
      makeRecord(3, { category: "simple" }),
      makeRecord(4, { category: "temporal" }),
      makeRecord(5, { category: "temporal", grade: wrong("wrong_answer") }),
    ]
    const summary = summarize(records)
    expect(summary.overall.n).toBe(5)
    expect(summary.overall.accuracy).toBeCloseTo(3 / 5, 9)
    expect(summary.byCategory.simple!.n).toBe(3)
    expect(summary.byCategory.simple!.accuracy).toBeCloseTo(2 / 3, 9)
    expect(summary.byCategory.temporal!.n).toBe(2)
    expect(summary.byCategory.temporal!.accuracy).toBeCloseTo(1 / 2, 9)
  })

  test("AC5 — mean recall ignores the null recalls", () => {
    const records = [
      makeRecord(1, { recall: 1 }),
      makeRecord(2, { recall: 0.5 }),
      makeRecord(3, { recall: null }),
    ]
    expect(summarize(records).overall.meanRecall).toBeCloseTo(0.75, 9)
  })

  test("AC5 — mean recall is null when every recall is null", () => {
    const records = [
      makeRecord(1, { category: "no_answer", recall: null }),
      makeRecord(2, { category: "no_answer", recall: null }),
    ]
    const summary = summarize(records)
    expect(summary.overall.meanRecall).toBeNull()
    expect(summary.byCategory.no_answer!.meanRecall).toBeNull()
  })

  test("AC5 — mean recall is computed per category", () => {
    const records = [
      makeRecord(1, { category: "simple", recall: 1 }),
      makeRecord(2, { category: "multi_hop", recall: 0.5 }),
      makeRecord(3, { category: "multi_hop", recall: 0 }),
    ]
    const summary = summarize(records)
    expect(summary.byCategory.simple!.meanRecall).toBeCloseTo(1, 9)
    expect(summary.byCategory.multi_hop!.meanRecall).toBeCloseTo(0.25, 9)
  })

  test("AC5 — latency p50 and p95 over 21 questions", () => {
    // Latencies 100, 200, ..., 2100 ms, in a scrambled order.
    const latencies = Array.from({ length: 21 }, (_, i) => (i + 1) * 100)
    const scrambled = [
      ...latencies.filter((_, i) => i % 2 === 1).reverse(),
      ...latencies.filter((_, i) => i % 2 === 0),
    ]
    const records = scrambled.map((latencyMs, i) =>
      makeRecord(i + 1, { latencyMs })
    )
    const { overall, byCategory } = summarize(records)
    expect(overall.latencyP50Ms).toBe(1100)
    expect(overall.latencyP95Ms).toBe(2000)
    expect(byCategory.simple!.latencyP50Ms).toBe(1100)
    expect(byCategory.simple!.latencyP95Ms).toBe(2000)
  })

  test("AC5 — latency percentiles of a single question are its latency", () => {
    const summary = summarize([makeRecord(1, { latencyMs: 750 })])
    expect(summary.overall.latencyP50Ms).toBe(750)
    expect(summary.overall.latencyP95Ms).toBe(750)
  })

  test("AC5 — latency percentiles are computed per category", () => {
    const records = [
      makeRecord(1, { category: "simple", latencyMs: 100 }),
      makeRecord(2, { category: "temporal", latencyMs: 9000 }),
    ]
    const summary = summarize(records)
    expect(summary.byCategory.simple!.latencyP50Ms).toBe(100)
    expect(summary.byCategory.temporal!.latencyP95Ms).toBe(9000)
  })

  test("AC5 — mean cost per question", () => {
    const records = [
      makeRecord(1, { category: "simple", costUsd: 0.1 }),
      makeRecord(2, { category: "simple", costUsd: 0.3 }),
      makeRecord(3, { category: "temporal", costUsd: 0.5 }),
    ]
    const summary = summarize(records)
    expect(summary.overall.meanCostUsd).toBeCloseTo(0.3, 9)
    expect(summary.byCategory.simple!.meanCostUsd).toBeCloseTo(0.2, 9)
    expect(summary.byCategory.temporal!.meanCostUsd).toBeCloseTo(0.5, 9)
  })

  test("AC5 — mean answerer input tokens counts the last call of each question, not the retrieval calls", () => {
    const records = [
      makeRecord(1, {
        calls: [
          call("mistral-embed", 50, 0, 10),
          call("claude-haiku-5-5", 1000, 100, 300),
        ],
      }),
      makeRecord(2, {
        calls: [
          call("mistral-embed", 70, 0, 10),
          call("claude-haiku-5-5", 3000, 100, 300),
        ],
      }),
    ]
    expect(summarize(records).overall.meanInputTokens).toBeCloseTo(2000, 9)
  })

  test("AC5 — counts each failure, with zero for the ones that did not occur", () => {
    const records = [
      makeRecord(1),
      makeRecord(2, { grade: wrong("retrieval_miss") }),
      makeRecord(3, { grade: wrong("retrieval_miss") }),
      makeRecord(4, { grade: wrong("wrong_answer") }),
      makeRecord(5, { category: "temporal", grade: wrong("false_abstention") }),
    ]
    const summary = summarize(records)
    expect(summary.overall.failures).toEqual({
      retrieval_miss: 2,
      false_abstention: 1,
      wrong_version: 0,
      missed_contradiction: 0,
      unsupported_claim: 0,
      wrong_answer: 1,
    })
    expect(summary.byCategory.simple!.failures).toEqual({
      retrieval_miss: 2,
      false_abstention: 0,
      wrong_version: 0,
      missed_contradiction: 0,
      unsupported_claim: 0,
      wrong_answer: 1,
    })
    expect(summary.byCategory.temporal!.failures.false_abstention).toBe(1)
  })

  test("AC5 — runEval returns the summary of its records", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, { category: "temporal" }),
    ]
    const overrides = new Map([
      [
        "q-002",
        { notes: ["Other.md"], output: answered("Austin") } satisfies Step,
      ],
    ])
    const { records, summary } = await runWith(questions, { overrides }).result
    expect(summary).toEqual(summarize(records))
    expect(summary.overall.n).toBe(2)
    expect(summary.overall.accuracy).toBeCloseTo(0.5, 9)
    expect(summary.byCategory.temporal!.failures.retrieval_miss).toBe(1)
  })
})

describe("AC6 — outputs", () => {
  const questions = [
    makeQuestion(1),
    makeQuestion(2, { category: "temporal" }),
    makeQuestion(3, { category: "temporal" }),
  ]
  const overrides = new Map([
    [
      "q-003",
      {
        notes: ["Notes/source-3.md"],
        output: answered("Austin"),
        answerCall: call("claude-haiku-5-5", 1000, 100, 300),
      } satisfies Step,
    ],
  ])

  test("AC6 — writes the run into runs/<timestamp>-A-<split>/", async () => {
    const { result, runsDir } = runWith(questions, { overrides })
    await result
    const dir = readRunDir(runsDir)
    expect(dir).toMatch(/[^/]+-A-test$/)
    expect(readdirSync(dir).sort()).toEqual([
      "report.md",
      "summary.json",
      "trace.jsonl",
    ])
  })

  test("AC6 — trace.jsonl starts with a line of run settings", async () => {
    const { result, runsDir } = runWith(questions, { k: 6, overrides })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const header = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(header.config).toBe("A")
    expect(header.split).toBe("test")
    expect(header.k).toBe(6)
    expect(header.models).toEqual({
      answerer: "claude-haiku-5-5",
      embedder: "mistral-embed",
    })
    expect(header.thresholds).toEqual({})
    expect(header.gitCommit).toBe("abc1234")
    const prices = header.prices as Record<string, unknown>
    expect(prices["claude-haiku-5-5"]).toBeDefined()
    expect(prices["claude-sonnet-5-5"]).toBeDefined()
    expect(prices["mistral-embed"]).toBeDefined()
  })

  test("AC6 — trace.jsonl has one record line per question after the settings line", async () => {
    const { result, runsDir } = runWith(questions, { overrides })
    const { records } = await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(lines).toHaveLength(1 + questions.length)
    const traced = lines.slice(1).map((line) => JSON.parse(line) as unknown)
    expect(traced).toEqual(JSON.parse(JSON.stringify(records)) as unknown[])
    expect(traced.map((r) => (r as { id: string }).id)).toEqual([
      "q-001",
      "q-002",
      "q-003",
    ])
  })

  test("AC6 — a run stopped by the cap writes only the processed questions", async () => {
    const expensive = new Map(
      questions.map((q) => [
        q.id,
        {
          notes: q.sources,
          output: answered("Denver"),
          answerCall: call("claude-sonnet-5-5", MILLION, 0, 100),
        } satisfies Step,
      ])
    )
    const { result, runsDir } = runWith(questions, {
      maxCostUsd: 2,
      overrides: expensive,
    })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(lines).toHaveLength(2)
  })

  test("AC6 — summary.json holds the metrics", async () => {
    const { result, runsDir } = runWith(questions, { overrides })
    const { summary } = await result
    const written = JSON.parse(
      readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
    ) as typeof summary
    expect(written).toMatchObject(JSON.parse(JSON.stringify(summary)) as object)
    expect(written.overall.n).toBe(3)
    expect(written.overall.accuracy).toBeCloseTo(2 / 3, 9)
    expect(written.byCategory.temporal!.n).toBe(2)
  })

  test("AC6 — report.md has a markdown table with the categories, then the failures with question ids", async () => {
    const { result, runsDir } = runWith(questions, { overrides })
    await result
    const report = readFileSync(join(readRunDir(runsDir), "report.md"), "utf8")
    const rows = report.split("\n").filter((line) => line.startsWith("|"))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(report).toContain("simple")
    expect(report).toContain("temporal")
    // q-003 is the only wrong answer: a wrong_answer failure.
    const failureAt = report.indexOf("wrong_answer")
    expect(failureAt).toBeGreaterThanOrEqual(0)
    expect(report.indexOf("q-003", failureAt)).toBeGreaterThanOrEqual(0)
    // Correct questions are not listed.
    expect(report).not.toContain("q-001")
    expect(report).not.toContain("q-002")
  })

  test("AC6 — creates the runs folder when it does not exist", async () => {
    const runsDir = join(makeTempDir(), "nested", "runs")
    const { result } = runWith(questions, { runsDir })
    await result
    expect(readdirSync(runsDir)).toHaveLength(1)
  })
})
