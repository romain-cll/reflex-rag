import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Question } from "../../evals/schema.ts"
import type { ModelCall } from "../core/types.ts"
import { callCostUsd, PRICES } from "./prices.ts"
import { renderReport, runEval, summarize } from "./run.ts"
// A namespace import: while `progressLine` is not exported, only its own tests fail.
import * as runModule from "./run.ts"

type RunRecord = Parameters<typeof summarize>[0][number]

interface ContextChunk {
  notePath: string
  noteDate: string | null
  heading: string
  text: string
}

interface Output {
  status: "answered" | "conflict" | "abstained"
  value: string
  answer: string
  citations: string[]
}

/** What the retrieval loop of config B returns next to the context. */
interface LoopData {
  outcome: { type: "answer" | "abstain"; rule: string }
  hops: number
  rewrites: number
  steps: unknown[]
  /** Note path -> score of each judge question. */
  judged: Record<string, Record<string, number>>
  kept: string[]
  frontier: string[]
  /** Config C: the notes judged again by the fallback; absent for config B. */
  fallback?: string[]
}

/** What the fake retriever and answerer return for one question. */
interface Step {
  notes: string[]
  retrievalCalls?: ModelCall[]
  /** Config B: returned by `retrieve` next to the context. */
  loop?: LoopData
  output: Output
  /** `null`: the answerer made no model call (an abstention of the loop). */
  answerCall?: ModelCall | null
  /** The answerer throws this instead of answering. */
  answerError?: { message: string; call?: ModelCall }
  /** `retrieve` throws this instead of returning: a `LoopError` carries calls and steps. */
  loopError?: { message: string; calls: ModelCall[]; steps: unknown[] }
  /** `retrieve` throws a plain error (no calls, no steps). */
  retrieveError?: string
  /** Loop stages (B and C) returned by `retrieve`; absent for config A. */
  stages?: Record<"searchMs" | "judgeMs" | "fallbackMs" | "rewriteMs", number>
  /** Real wait of `retrieve` before it returns or throws. */
  retrieveDelayMs?: number
  /** Real wait of `answer` before it returns or throws. */
  answerDelayMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** An error of the answerer; `call` is the call the API billed, if any. */
class AnswerError extends Error {
  constructor(
    message: string,
    readonly call?: ModelCall
  ) {
    super(message)
  }
}

/** The error of a retrieval loop that failed: the calls it paid for and its steps. */
class LoopError extends Error {
  constructor(
    message: string,
    readonly calls: ModelCall[],
    readonly steps: unknown[]
  ) {
    super(message)
  }
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
    sourceGroups: [[`Notes/source-${n}.md`]],
    entity: "customer-0001",
    refs: ["fact-0001"],
    ...overrides,
  }
}

function answered(answer: string): Output {
  return { status: "answered", value: answer, answer, citations: [] }
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
    retrieve: async (query: string, k: number) => {
      retrieved.push({ query, k })
      const step = steps.get(query)
      if (!step) throw new Error(`unscripted question: ${query}`)
      if (step.retrieveDelayMs) await sleep(step.retrieveDelayMs)
      if (step.loopError) {
        const { message, calls, steps: loopSteps } = step.loopError
        return Promise.reject(new LoopError(message, calls, loopSteps))
      }
      if (step.retrieveError) {
        return Promise.reject(new Error(step.retrieveError))
      }
      const context = step.notes.map(chunk)
      contexts.set(query, context)
      return Promise.resolve({
        context,
        calls: step.retrievalCalls ?? [],
        ...(step.loop ? { loop: step.loop } : {}),
        ...(step.stages ? { stages: step.stages } : {}),
      })
    },
    answer: async (question: string, context: ContextChunk[]) => {
      answerCalls.push({ question, context })
      const step = steps.get(question)
      if (!step) throw new Error(`unscripted question: ${question}`)
      if (step.answerDelayMs) await sleep(step.answerDelayMs)
      if (step.answerError) {
        const { message, call } = step.answerError
        return Promise.reject(new AnswerError(message, call))
      }
      return Promise.resolve({
        output: step.output,
        call:
          step.answerCall === undefined
            ? call("claude-haiku-5-5", 0, 0, 0)
            : step.answerCall,
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

const INDEX = {
  vault: "/vaults/larkspur",
  notes: 202,
  chunks: 1534,
  links: 611,
}

interface RunOptions {
  k?: number
  maxCostUsd?: number
  runsDir?: string
  overrides?: Map<string, Step>
  config?: string
  models?: Record<string, string>
  /** Config B: the loop settings written to the settings line. */
  loop?: Record<string, unknown>
  candidates?: number
  onProgress?: (record: RunRecord, done: number, total: number) => void
}

/** Always writes into a temporary runs folder, never into the repository. */
function runWith(questions: Question[], options: RunOptions = {}) {
  const runsDir = options.runsDir ?? join(makeTempDir(), "runs")
  const fake = scripted(questions, options.overrides ?? new Map<string, Step>())
  const evalOptions = {
    questions,
    retrieve: fake.retrieve,
    answer: fake.answer,
    k: options.k ?? 8,
    candidates: options.candidates ?? 50,
    maxCostUsd: options.maxCostUsd ?? 1000,
    runsDir,
    config: options.config ?? "A",
    split: "test" as const,
    models: options.models ?? {
      answerer: "claude-haiku-5-5",
      embedder: "mistral-embed",
    },
    thresholds: {},
    gitCommit: "abc1234",
    index: INDEX,
    ...(options.loop ? { loop: options.loop } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  }
  const result = runEval(evalOptions)
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

  test("AC3 — recall is the share of the source groups with a note among the context notes", async () => {
    const group = {
      sources: ["A.md", "B.md"],
      sourceGroups: [["A.md"], ["B.md"]],
    }
    const questions = [
      makeQuestion(1, group),
      makeQuestion(2, group),
      makeQuestion(3, group),
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

  test("AC3 — a group counts once however many of its notes were retrieved", async () => {
    const question = makeQuestion(1, {
      sources: ["A.md", "B.md", "C.md"],
      sourceGroups: [["A.md", "B.md"], ["C.md"]],
    })
    const overrides = new Map([
      [
        question.id,
        { notes: ["A.md", "B.md"], output: answered("Denver") } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.recall).toBe(0.5)
  })

  test("AC3 — one note of a group is enough to cover it", async () => {
    const question = makeQuestion(1, {
      sources: ["A.md", "B.md", "C.md"],
      sourceGroups: [["A.md", "B.md"], ["C.md"]],
    })
    const overrides = new Map([
      [
        question.id,
        { notes: ["B.md", "C.md"], output: answered("Denver") } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.recall).toBe(1)
  })

  test("AC3 — regression, a multi_hop question with recall 0.5 whose answer is an abstention is a retrieval_miss", async () => {
    const question = makeQuestion(1, {
      category: "multi_hop",
      sources: ["A.md", "B.md"],
      sourceGroups: [["A.md"], ["B.md"]],
    })
    const overrides = new Map([
      [
        question.id,
        {
          notes: ["A.md"],
          output: {
            status: "abstained" as const,
            value: "",
            answer: "The excerpts do not say.",
            citations: [],
          },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.recall).toBe(0.5)
    expect(records[0]!.grade).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  test("AC3 — recall is null for an abstain question", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const overrides = new Map([
      [
        question.id,
        {
          notes: ["Other.md"],
          output: {
            status: "abstained" as const,
            value: "",
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

/** A record or a failure as plain data, for fields the types do not know yet. */
function plain(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

describe("AC2b — answer errors", () => {
  const FAILING_CALL = call("claude-sonnet-5-5", MILLION, 0, 250)

  function failing(
    question: Question,
    answerError: Step["answerError"]
  ): Map<string, Step> {
    return new Map([
      [
        question.id,
        {
          notes: question.sources,
          output: answered("unused"),
          answerError,
        } satisfies Step,
      ],
    ])
  }

  test("AC2b — an answer that throws is recorded with a null output, the error message and an answer_error failure", async () => {
    const question = makeQuestion(1)
    const overrides = failing(question, {
      message: "Anthropic output truncated (stop_reason max_tokens)",
      call: FAILING_CALL,
    })
    const { records } = await runWith([question], { overrides }).result
    const record = plain(records[0])
    expect(record.id).toBe("q-001")
    expect(record.output).toBeNull()
    expect(record.error).toBe(
      "Anthropic output truncated (stop_reason max_tokens)"
    )
    expect(plain(records[0]!.grade)).toEqual({
      correct: false,
      failure: "answer_error",
    })
  })

  test("AC2b — costUsd includes the call the error carries and the retrieval calls", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          // 0.10 USD for the retrieval.
          retrievalCalls: [call("mistral-embed", MILLION, 0, 10)],
          output: answered("unused"),
          // 2 USD for the call of the failed answer.
          answerError: { message: "output truncated", call: FAILING_CALL },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.costUsd).toBeCloseTo(2.1, 9)
  })

  test("AC2b — an error without a call costs only the retrieval", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          retrievalCalls: [call("mistral-embed", MILLION, 0, 10)],
          output: answered("unused"),
          answerError: { message: "529 overloaded_error" },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    const record = plain(records[0])
    expect(record.output).toBeNull()
    expect(record.error).toBe("529 overloaded_error")
    expect(plain(record.grade).failure).toBe("answer_error")
    expect(records[0]!.costUsd).toBeCloseTo(0.1, 9)
  })

  test("AC2b — the run goes on with the next questions", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const overrides = failing(questions[1]!, {
      message: "output truncated",
      call: FAILING_CALL,
    })
    const { fake, result } = runWith(questions, { overrides })
    const { records, skipped } = await result
    expect(fake.answerCalls.map((a) => a.question)).toEqual(
      questions.map((q) => q.question)
    )
    expect(records.map((r) => r.id)).toEqual(["q-001", "q-002", "q-003"])
    expect(skipped).toBe(0)
    expect(records[0]!.grade).toEqual({ correct: true, failure: null })
    expect(plain(records[1]).output).toBeNull()
    expect(records[2]!.grade).toEqual({ correct: true, failure: null })
    expect(records[2]!.output).toEqual(answered("Denver"))
  })

  test("AC2b — the cost of a failed answer counts toward the cost cap", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const overrides = failing(questions[0]!, {
      message: "output truncated",
      call: FAILING_CALL,
    })
    const { result } = runWith(questions, { maxCostUsd: 2, overrides })
    const { records, skipped } = await result
    expect(records.map((r) => r.id)).toEqual(["q-001"])
    expect(skipped).toBe(2)
  })

  test("AC2b — answer_error is counted in the failures of the summary, overall and by category", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, { category: "temporal" }),
      makeQuestion(3, { category: "temporal" }),
    ]
    const overrides = new Map([
      ...failing(questions[1]!, { message: "refusal", call: FAILING_CALL }),
      ...failing(questions[2]!, { message: "output truncated" }),
    ])
    const { records, summary } = await runWith(questions, { overrides }).result
    const overall = plain(summary.overall.failures)
    const temporal = plain(summary.byCategory.temporal!.failures)
    expect(overall.answer_error).toBe(2)
    expect(temporal.answer_error).toBe(2)
    expect(plain(summary.byCategory.simple!.failures).answer_error).toBe(0)
    expect(summary.overall.accuracy).toBeCloseTo(1 / 3, 9)
    expect(summary).toEqual(summarize(records))
  })

  test("AC2b — summarize counts the answer_error of the records", () => {
    const failed = {
      ...makeRecord(2),
      output: null,
      error: "output truncated",
      grade: { correct: false, failure: "answer_error" },
      calls: [],
    } as unknown as RunRecord
    const summary = summarize([makeRecord(1), failed])
    expect(summary.overall.n).toBe(2)
    expect(summary.overall.accuracy).toBeCloseTo(0.5, 9)
    expect(plain(summary.overall.failures).answer_error).toBe(1)
    expect(plain(summary.overall.failures).wrong_answer).toBe(0)
  })

  test("AC2b — the trace keeps the failed question with its error and its cost", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const overrides = failing(questions[0]!, {
      message: "output truncated",
      call: FAILING_CALL,
    })
    const { result, runsDir } = runWith(questions, { overrides })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(lines).toHaveLength(3)
    const traced = plain(JSON.parse(lines[1]!))
    expect(traced.id).toBe("q-001")
    expect(traced.output).toBeNull()
    expect(traced.error).toBe("output truncated")
    expect(plain(traced.grade).failure).toBe("answer_error")
    expect(traced.costUsd as number).toBeCloseTo(2, 9)
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

function makeRecord(
  n: number,
  overrides: Partial<RunRecord> & Record<string, unknown> = {}
): RunRecord {
  return {
    id: id(n),
    split: "test",
    category: "simple",
    contextNotes: [],
    recall: 1,
    contextComplete: true,
    precision: 1,
    notesInContext: 1,
    output: answered("Denver"),
    grade: { correct: true, failure: null },
    calls: [call("claude-haiku-5-5", 1000, 100, 300)],
    latencyMs: 300,
    costUsd: 0.01,
    // Spread, not a property: the record type does not know `stages` yet.
    ...{ stages: zeroStages() },
    ...overrides,
  }
}

function zeroStages() {
  return { searchMs: 0, judgeMs: 0, fallbackMs: 0, rewriteMs: 0, answerMs: 0 }
}

const wrong = (
  failure:
    | "retrieval_miss"
    | "wrong_answer"
    | "false_abstention"
    | "loop_error"
    | "context_budget"
    | "judge_rejected"
    | "not_followed"
    | "answer_error"
    | "wrong_version"
    | "missed_contradiction"
    | "unsupported_claim"
) => ({ correct: false, failure })

/** Every failure at zero, in the order of AC12. */
const NO_FAILURES = {
  loop_error: 0,
  context_budget: 0,
  judge_rejected: 0,
  not_followed: 0,
  retrieval_miss: 0,
  answer_error: 0,
  false_abstention: 0,
  wrong_version: 0,
  missed_contradiction: 0,
  unsupported_claim: 0,
  wrong_answer: 0,
}

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

  test("AC5 — counts each failure of the Revision 3 taxonomy, with zero for the ones that did not occur", () => {
    const records = [
      makeRecord(1),
      makeRecord(2, { grade: wrong("retrieval_miss") }),
      makeRecord(3, { grade: wrong("retrieval_miss") }),
      makeRecord(4, { grade: wrong("wrong_answer") }),
      makeRecord(5, { category: "temporal", grade: wrong("false_abstention") }),
    ]
    const summary = summarize(records)
    expect(plain(summary.overall.failures)).toEqual({
      ...NO_FAILURES,
      retrieval_miss: 2,
      false_abstention: 1,
      wrong_answer: 1,
    })
    expect(plain(summary.byCategory.simple!.failures)).toEqual({
      ...NO_FAILURES,
      retrieval_miss: 2,
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

  test("AC6 — the settings line holds the index metadata: vault, notes, chunks and links", async () => {
    const { result, runsDir } = runWith(questions, { overrides })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const header = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(header.index).toEqual(INDEX)
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

/**
 * Config B. A model call made by the judge carries `role: "judge"`; the calls
 * of the embedder, the rewriter and the answerer carry no role. A role, not a
 * model name: the judge, the rewriter and the answerer all run on Haiku.
 */
const HAIKU = "claude-haiku-5-5"

function judgeCall(
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
  model = HAIKU
): ModelCall & { role: "judge" } {
  return { ...call(model, inputTokens, outputTokens, latencyMs), role: "judge" }
}

function loopOf(
  rule: string,
  hops: number,
  rewrites: number,
  type: "answer" | "abstain" = "answer",
  notes: Partial<Pick<LoopData, "judged" | "kept" | "frontier">> = {}
): LoopData {
  return {
    outcome: { type, rule },
    hops,
    rewrites,
    judged: {},
    kept: [],
    frontier: [],
    ...notes,
    steps: [
      {
        kind: "search",
        query: "the question",
        judged: { c1: 0.9 },
        kept: ["c1"],
        assessment: { sufficient: 0.9, links: {}, missing: { choice: "none" } },
        action: { type, rule },
      },
    ],
  }
}

const LOOP_SETTINGS = {
  policy: {
    thresholds: { relevance: 0.5, sufficient: 0.7, link: 0.5 },
    budgets: { maxHops: 3, maxRewrites: 1, maxChunks: 12 },
  },
  rewriter: "llm",
  candidates: 50,
}

const B_MODELS = {
  judge: HAIKU,
  rewriter: HAIKU,
  answerer: HAIKU,
  embedder: "mistral-embed",
}

describe("AC2 — records of a loop run (config B)", () => {
  test("AC2 — a record keeps the loop data returned by retrieve: outcome, hops, rewrites and steps", async () => {
    const question = makeQuestion(1)
    const loop = loopOf("sufficient", 2, 1)
    const overrides = new Map([[question.id, { ...goodStep(question), loop }]])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    expect(plain(records[0]).loop).toEqual(loop)
  })

  test("AC2 — the trace line of a record holds its loop", async () => {
    const question = makeQuestion(1)
    const loop = loopOf("answer-best-effort", 1, 0)
    const overrides = new Map([[question.id, { ...goodStep(question), loop }]])
    const { result, runsDir } = runWith([question], { config: "B", overrides })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(plain(JSON.parse(lines[1]!)).loop).toEqual(loop)
  })

  test("AC2 — a record of config A has no loop", async () => {
    const { records } = await runWith([makeQuestion(1)]).result
    expect(plain(records[0]).loop).toBeUndefined()
  })

  test("AC2 — cost sums every call: embeddings, judge, rewriter and answerer", async () => {
    const question = makeQuestion(1)
    const calls = [
      // 0.10 USD: embedding of the query.
      call("mistral-embed", MILLION, 0, 10),
      // 0.10 USD: a judge call.
      judgeCall(MILLION, 0, 200),
      // 0.50 USD: a rewriter call, on the same model as the judge.
      call(HAIKU, 0, MILLION, 300),
    ]
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          retrievalCalls: calls,
          loop: loopOf("sufficient", 0, 1),
          output: answered("Denver"),
          // 0.10 + 0.50 USD.
          answerCall: call(HAIKU, MILLION, MILLION, 600),
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    expect(records[0]!.costUsd).toBeCloseTo(1.3, 9)
    expect(records[0]!.calls).toHaveLength(4)
    expect(records[0]!.calls.slice(0, 3)).toEqual(calls)
  })

  test("AC2 — an answer that returns call null adds no call and no cost", async () => {
    const question = makeQuestion(1)
    const retrievalCalls = [
      call("mistral-embed", MILLION, 0, 10),
      judgeCall(MILLION, 0, 200),
    ]
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          retrievalCalls,
          loop: loopOf("sufficient", 0, 0),
          output: answered("Denver"),
          answerCall: null,
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    expect(records[0]!.calls).toEqual(retrievalCalls)
    expect(records[0]!.costUsd).toBeCloseTo(0.2, 9)
    expect(records[0]!.output).toEqual(answered("Denver"))
    expect(records[0]!.grade).toEqual({ correct: true, failure: null })
  })

  test("AC2 — regression, an abstention of the loop is recorded as given, without answer call, and is correct on a no_answer question", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const output = {
      status: "abstained" as const,
      value: "",
      answer: "No relevant note was found (rule abstain-nothing-relevant).",
      citations: [],
    }
    const retrievalCalls = [
      call("mistral-embed", MILLION, 0, 10),
      judgeCall(MILLION, 0, 200),
    ]
    const overrides = new Map([
      [
        question.id,
        {
          notes: [],
          retrievalCalls,
          loop: loopOf("abstain-nothing-relevant", 0, 1, "abstain"),
          output,
          answerCall: null,
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    const record = plain(records[0])
    expect(record.output).toEqual(output)
    expect(record.contextNotes).toEqual([])
    expect(record.calls).toEqual(retrievalCalls)
    expect(record.recall).toBeNull()
    expect(record.grade).toEqual({ correct: true, failure: null })
  })

  test("AC2 — an answer error keeps the loop and costs the loop calls plus the call the error carries", async () => {
    const question = makeQuestion(1)
    const loop = loopOf("sufficient", 1, 0)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          // 0.10 USD for the loop.
          retrievalCalls: [judgeCall(MILLION, 0, 200)],
          loop,
          output: answered("unused"),
          // 2 USD for the call of the failed answer.
          answerError: {
            message: "output truncated",
            call: call("claude-sonnet-5-5", MILLION, 0, 250),
          },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    const record = plain(records[0])
    expect(record.output).toBeNull()
    expect(record.loop).toEqual(loop)
    expect(records[0]!.costUsd).toBeCloseTo(2.1, 9)
  })

  test("AC2 — the cost of the loop calls counts toward the cost cap", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const overrides = new Map(
      questions.map((q) => [
        q.id,
        {
          notes: q.sources,
          // 2 USD spent in the loop, nothing for the answer.
          retrievalCalls: [judgeCall(MILLION, 0, 10, "claude-sonnet-5-5")],
          loop: loopOf("sufficient", 0, 0),
          output: answered("Denver"),
          answerCall: null,
        } satisfies Step,
      ])
    )
    const { result } = runWith(questions, {
      config: "B",
      maxCostUsd: 2,
      overrides,
    })
    const { records, skipped } = await result
    expect(records).toHaveLength(1)
    expect(skipped).toBe(2)
  })
})

/** A loop record with `judgeCalls` judge calls among its other calls. */
function loopRecord(
  n: number,
  loop: {
    category?: RunRecord["category"]
    rule: string
    hops: number
    rewrites: number
    judgeCalls: number
  }
): RunRecord {
  const calls = [
    call("mistral-embed", 20, 0, 10),
    ...Array.from({ length: loop.judgeCalls }, () => judgeCall(500, 50, 100)),
    // The rewriter and the answerer run on the judge's model, without its role.
    call(HAIKU, 200, 20, 100),
    call(HAIKU, 1000, 100, 300),
  ]
  return {
    ...makeRecord(n, { category: loop.category ?? "simple", calls }),
    loop: loopOf(loop.rule, loop.hops, loop.rewrites),
  }
}

describe("AC3 — loop metrics (config B)", () => {
  const records = [
    loopRecord(1, { rule: "sufficient", hops: 0, rewrites: 0, judgeCalls: 2 }),
    loopRecord(2, { rule: "sufficient", hops: 2, rewrites: 0, judgeCalls: 4 }),
    loopRecord(3, {
      category: "multi_hop",
      rule: "answer-best-effort",
      hops: 1,
      rewrites: 1,
      judgeCalls: 3,
    }),
    loopRecord(4, {
      category: "no_answer",
      rule: "abstain-nothing-relevant",
      hops: 0,
      rewrites: 1,
      judgeCalls: 5,
    }),
  ]

  test("AC3 — mean hops per question, per category and overall", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).meanHops).toBeCloseTo(0.75, 9)
    expect(plain(byCategory.simple).meanHops).toBeCloseTo(1, 9)
    expect(plain(byCategory.multi_hop).meanHops).toBeCloseTo(1, 9)
    expect(plain(byCategory.no_answer).meanHops).toBeCloseTo(0, 9)
  })

  test("AC3 — mean rewrites per question, per category and overall", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).meanRewrites).toBeCloseTo(0.5, 9)
    expect(plain(byCategory.simple).meanRewrites).toBeCloseTo(0, 9)
    expect(plain(byCategory.multi_hop).meanRewrites).toBeCloseTo(1, 9)
    expect(plain(byCategory.no_answer).meanRewrites).toBeCloseTo(1, 9)
  })

  test("AC3 — mean judge calls per question counts the calls with the judge role, not the other calls of the same model", () => {
    const { overall, byCategory } = summarize(records)
    // (2 + 4 + 3 + 5) / 4
    expect(plain(overall).meanJudgeCalls).toBeCloseTo(3.5, 9)
    expect(plain(byCategory.simple).meanJudgeCalls).toBeCloseTo(3, 9)
    expect(plain(byCategory.multi_hop).meanJudgeCalls).toBeCloseTo(3, 9)
    expect(plain(byCategory.no_answer).meanJudgeCalls).toBeCloseTo(5, 9)
  })

  test("AC3 — a loop record without any judge call counts zero, not null", () => {
    const summary = summarize([
      loopRecord(1, {
        rule: "sufficient",
        hops: 0,
        rewrites: 0,
        judgeCalls: 0,
      }),
    ])
    expect(plain(summary.overall).meanJudgeCalls).toBe(0)
    expect(plain(summary.overall).meanHops).toBe(0)
    expect(plain(summary.overall).meanRewrites).toBe(0)
  })

  test("AC3 — finalRules counts the rule of the final action, per category and overall, only for the rules that occurred", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).finalRules).toEqual({
      sufficient: 2,
      "answer-best-effort": 1,
      "abstain-nothing-relevant": 1,
    })
    expect(plain(byCategory.simple).finalRules).toEqual({ sufficient: 2 })
    expect(plain(byCategory.multi_hop).finalRules).toEqual({
      "answer-best-effort": 1,
    })
    expect(plain(byCategory.no_answer).finalRules).toEqual({
      "abstain-nothing-relevant": 1,
    })
  })

  test("AC3 — the loop metrics are null and the rule counts empty for config A records", () => {
    const summary = summarize([makeRecord(1), makeRecord(2)])
    for (const metrics of [summary.overall, summary.byCategory.simple!]) {
      expect(plain(metrics).meanHops).toBeNull()
      expect(plain(metrics).meanRewrites).toBeNull()
      expect(plain(metrics).meanJudgeCalls).toBeNull()
      expect(plain(metrics).finalRules).toEqual({})
    }
  })

  test("AC3 — runEval writes the loop metrics in summary.json", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, { category: "temporal" }),
    ]
    const overrides = new Map([
      [
        "q-001",
        {
          ...goodStep(questions[0]!),
          retrievalCalls: [judgeCall(500, 50, 100), judgeCall(500, 50, 100)],
          loop: loopOf("sufficient", 1, 0),
        },
      ],
      [
        "q-002",
        {
          ...goodStep(questions[1]!),
          retrievalCalls: [judgeCall(500, 50, 100)],
          loop: loopOf("answer-best-effort", 3, 1),
        },
      ],
    ])
    const { result, runsDir } = runWith(questions, { config: "B", overrides })
    const { summary } = await result
    expect(plain(summary.overall).meanHops).toBeCloseTo(2, 9)
    expect(plain(summary.overall).meanRewrites).toBeCloseTo(0.5, 9)
    expect(plain(summary.overall).meanJudgeCalls).toBeCloseTo(1.5, 9)
    expect(plain(summary.byCategory.temporal).finalRules).toEqual({
      "answer-best-effort": 1,
    })
    const written = JSON.parse(
      readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
    ) as { overall: Record<string, unknown> }
    expect(written.overall.meanHops).toBeCloseTo(2, 9)
    expect(written.overall.finalRules).toEqual({
      sufficient: 1,
      "answer-best-effort": 1,
    })
  })
})

describe("AC4 — settings line and report of a loop run (config B)", () => {
  const questions = [
    makeQuestion(1),
    makeQuestion(2, { category: "multi_hop" }),
    makeQuestion(3, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    }),
  ]
  const overrides = new Map<string, Step>([
    [
      "q-001",
      {
        ...goodStep(questions[0]!),
        retrievalCalls: [judgeCall(500, 50, 100), judgeCall(500, 50, 100)],
        loop: loopOf("sufficient", 1, 0),
      },
    ],
    [
      "q-002",
      {
        ...goodStep(questions[1]!),
        retrievalCalls: [judgeCall(500, 50, 100), judgeCall(500, 50, 100)],
        loop: loopOf("sufficient", 2, 1),
      },
    ],
    [
      "q-003",
      {
        notes: [],
        retrievalCalls: [judgeCall(500, 50, 100)],
        loop: loopOf("abstain-nothing-relevant", 0, 0, "abstain"),
        output: {
          status: "abstained",
          value: "",
          answer: "No relevant note (abstain-nothing-relevant).",
          citations: [],
        },
        answerCall: null,
      },
    ],
  ])

  test("AC4 — the settings line holds the loop settings and the judge and rewriter models", async () => {
    const { result, runsDir } = runWith(questions, {
      config: "B",
      models: B_MODELS,
      loop: LOOP_SETTINGS,
      overrides,
    })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const header = plain(JSON.parse(lines[0]!))
    expect(header.config).toBe("B")
    expect(header.models).toEqual(B_MODELS)
    expect(header.loop).toEqual(LOOP_SETTINGS)
  })

  test("AC4 — the run folder of config B is named after its config", async () => {
    const { result, runsDir } = runWith(questions, {
      config: "B",
      models: B_MODELS,
      loop: LOOP_SETTINGS,
      overrides,
    })
    await result
    expect(readRunDir(runsDir)).toMatch(/[^/]+-B-test$/)
  })

  /** The markdown tables of a report, as header cells and rows by first cell. */
  function tablesOf(report: string) {
    const tables: Array<{ header: string[]; rows: Map<string, string[]> }> = []
    let current: string[][] = []
    const flush = () => {
      if (current.length > 0) {
        const [header, , ...body] = current as [
          string[],
          string[],
          ...string[][],
        ]
        tables.push({
          header,
          rows: new Map(body.map((cells) => [cells[0]!, cells])),
        })
      }
      current = []
    }
    for (const line of report.split("\n")) {
      if (!line.startsWith("|")) {
        flush()
        continue
      }
      current.push(
        line
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim())
      )
    }
    flush()
    return tables
  }

  /** The value of `column` on the row `label`, in whichever table has the column. */
  function cell(report: string, column: string, label: string): string {
    const table = tablesOf(report).find((t) => t.header.includes(column))
    expect(table).toBeDefined()
    const row = table!.rows.get(label)
    expect(row).toBeDefined()
    return row![table!.header.indexOf(column)]!
  }

  async function reportOf(): Promise<string> {
    const { result, runsDir } = runWith(questions, {
      config: "B",
      models: B_MODELS,
      loop: LOOP_SETTINGS,
      overrides,
    })
    await result
    return readFileSync(join(readRunDir(runsDir), "report.md"), "utf8")
  }

  test("AC4 — report.md has the columns hops, rewrites and judge calls, per category and overall", async () => {
    const report = await reportOf()
    expect(Number(cell(report, "hops", "overall"))).toBeCloseTo(1, 9)
    expect(Number(cell(report, "hops", "simple"))).toBeCloseTo(1, 9)
    expect(Number(cell(report, "hops", "multi_hop"))).toBeCloseTo(2, 9)
    expect(Number(cell(report, "hops", "no_answer"))).toBeCloseTo(0, 9)
    expect(Number(cell(report, "rewrites", "overall"))).toBeCloseTo(1 / 3, 2)
    expect(Number(cell(report, "rewrites", "multi_hop"))).toBeCloseTo(1, 9)
    expect(Number(cell(report, "judge calls", "overall"))).toBeCloseTo(5 / 3, 2)
    expect(Number(cell(report, "judge calls", "no_answer"))).toBeCloseTo(1, 9)
  })

  test("AC4 — report.md has a column per final rule that occurred, with its count", async () => {
    const report = await reportOf()
    expect(cell(report, "sufficient", "overall")).toBe("2")
    expect(cell(report, "sufficient", "simple")).toBe("1")
    expect(cell(report, "sufficient", "multi_hop")).toBe("1")
    expect(cell(report, "abstain-nothing-relevant", "overall")).toBe("1")
    expect(cell(report, "abstain-nothing-relevant", "no_answer")).toBe("1")
  })

  test("AC4 — report.md keeps the columns of config A", async () => {
    const report = await reportOf()
    const table = tablesOf(report).find((t) => t.header.includes("accuracy"))
    expect(table).toBeDefined()
    for (const column of ["n", "recall", "p50 (ms)", "p95 (ms)"]) {
      expect(table!.header).toContain(column)
    }
  })
})

/** The error a promise rejects with; fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error("rejected with a non-Error value", { cause: error })
  }
  throw new Error("expected the promise to reject")
}

/** A step whose answer is wrong, to read the failure of its context. */
function wrongStep(notes: string[], loop?: LoopData): Step {
  return {
    notes,
    output: answered("Austin"),
    answerCall: call(HAIKU, 1000, 100, 300),
    ...(loop ? { loop } : {}),
  }
}

describe("AC10 — context measures", () => {
  const groups = {
    sources: ["A.md", "B.md", "C.md"],
    sourceGroups: [["A.md", "B.md"], ["C.md"]],
  }

  async function recordOf(question: Question, step: Step) {
    const overrides = new Map([[question.id, step]])
    const { records } = await runWith([question], { overrides }).result
    return plain(records[0])
  }

  test("AC10 — contextComplete is true when every source group has a note in the context", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      wrongStep(["B.md", "C.md"])
    )
    expect(record.contextComplete).toBe(true)
  })

  test("AC10 — contextComplete is false when a source group has no note in the context", async () => {
    const record = await recordOf(makeQuestion(1, groups), wrongStep(["A.md"]))
    expect(record.contextComplete).toBe(false)
  })

  test("AC10 — contextComplete is false for an empty context on a question with sources", async () => {
    const record = await recordOf(makeQuestion(1, groups), wrongStep([]))
    expect(record.contextComplete).toBe(false)
  })

  test("AC10 — contextComplete is null for a question without sources", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const record = await recordOf(question, wrongStep(["X.md"]))
    expect(record.contextComplete).toBeNull()
  })

  test("AC10 — precision is the share of the distinct context notes that belong to a source group", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      // Distinct notes: B.md, C.md, X.md; two of the three are sources.
      wrongStep(["B.md", "C.md", "X.md", "X.md", "B.md"])
    )
    expect(record.precision).toBeCloseTo(2 / 3, 9)
  })

  test("AC10 — precision is 1 when every context note belongs to a source group", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      wrongStep(["A.md", "B.md", "C.md"])
    )
    expect(record.precision).toBe(1)
  })

  test("AC10 — precision is 0 when no context note belongs to a source group", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      wrongStep(["X.md", "Y.md"])
    )
    expect(record.precision).toBe(0)
  })

  test("AC10 — precision is 0 for a question without sources and a non-empty context", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const record = await recordOf(question, wrongStep(["X.md"]))
    expect(record.precision).toBe(0)
  })

  test("AC10 — precision is null when the context is empty, with or without sources", async () => {
    const noSource = makeQuestion(2, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const overrides = new Map([
      ["q-001", wrongStep([])],
      ["q-002", wrongStep([])],
    ])
    const { records } = await runWith([makeQuestion(1, groups), noSource], {
      overrides,
    }).result
    expect(plain(records[0]).precision).toBeNull()
    expect(plain(records[1]).precision).toBeNull()
  })

  test("AC10 — notesInContext counts the distinct context notes", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      wrongStep(["A.md", "A.md", "B.md", "X.md", "X.md"])
    )
    expect(record.notesInContext).toBe(3)
  })

  test("AC10 — notesInContext is 0 for an empty context", async () => {
    const record = await recordOf(makeQuestion(1, groups), wrongStep([]))
    expect(record.notesInContext).toBe(0)
  })

  test("AC10 — duplicates in the context do not change recall or contextComplete", async () => {
    const record = await recordOf(
      makeQuestion(1, groups),
      wrongStep(["A.md", "A.md", "A.md"])
    )
    expect(record.recall).toBe(0.5)
    expect(record.contextComplete).toBe(false)
  })

  test("AC10 — the trace line of a record holds the three measures", async () => {
    const question = makeQuestion(1, groups)
    const overrides = new Map([[question.id, wrongStep(["B.md", "X.md"])]])
    const { result, runsDir } = runWith([question], { overrides })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const traced = plain(JSON.parse(lines[1]!))
    expect(traced.contextComplete).toBe(false)
    expect(traced.precision).toBeCloseTo(0.5, 9)
    expect(traced.notesInContext).toBe(2)
  })
})

describe("AC11 — failures by layer in a run", () => {
  const question = makeQuestion(1, {
    sources: ["A.md", "B.md"],
    sourceGroups: [["A.md"], ["B.md"]],
  })
  const scores = { relevance: 0.2 }

  async function failureOf(step: Step, q: Question = question) {
    const overrides = new Map([[q.id, step]])
    const { records } = await runWith([q], { config: "B", overrides }).result
    return records[0]!.grade
  }

  test("AC11 — context_budget: the loop kept the missing note but the context budget cut it", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": scores, "B.md": scores },
      kept: ["A.md", "B.md"],
    })
    expect(await failureOf(wrongStep(["A.md"], loop))).toEqual({
      correct: false,
      failure: "context_budget",
    })
  })

  test("AC11 — judge_rejected: the loop judged the missing note and did not keep it", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": scores, "B.md": scores },
      kept: ["A.md"],
    })
    expect(await failureOf(wrongStep(["A.md"], loop))).toEqual({
      correct: false,
      failure: "judge_rejected",
    })
  })

  test("AC11 — not_followed: the missing note is in the frontier of the loop", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": scores },
      kept: ["A.md"],
      frontier: ["B.md"],
    })
    expect(await failureOf(wrongStep(["A.md"], loop))).toEqual({
      correct: false,
      failure: "not_followed",
    })
  })

  test("AC11 — retrieval_miss: the loop never saw the missing note", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": scores },
      kept: ["A.md"],
    })
    expect(await failureOf(wrongStep(["A.md"], loop))).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  test("AC11 — an abstention of the loop with a rejected note is judge_rejected", async () => {
    const loop = loopOf("abstain-nothing-relevant", 0, 1, "abstain", {
      judged: { "B.md": scores },
    })
    const step: Step = {
      notes: [],
      loop,
      output: {
        status: "abstained",
        value: "",
        answer: "No relevant note (abstain-nothing-relevant).",
        citations: [],
      },
      answerCall: null,
    }
    expect(await failureOf(step)).toEqual({
      correct: false,
      failure: "judge_rejected",
    })
  })

  test("AC11 — the run passes the note paths judged by the loop, the keys of judged, to the grader", async () => {
    // B.md is judged and not kept even though its score is high: only the lists decide.
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "B.md": { relevance: 0.99 } },
      kept: [],
    })
    expect((await failureOf(wrongStep(["A.md"], loop))).failure).toBe(
      "judge_rejected"
    )
  })

  test("AC11 — a complete context is of the answer family whatever the loop holds: wrong_answer", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": scores, "B.md": scores },
      kept: ["A.md", "B.md"],
    })
    expect(await failureOf(wrongStep(["A.md", "B.md"], loop))).toEqual({
      correct: false,
      failure: "wrong_answer",
    })
  })

  test("AC11 — a complete context and an abstention is a false_abstention", async () => {
    const step: Step = {
      notes: ["A.md", "B.md"],
      output: {
        status: "abstained",
        value: "",
        answer: "The excerpts do not say.",
        citations: [],
      },
      loop: loopOf("sufficient", 1, 0),
      answerCall: call(HAIKU, 1000, 100, 300),
    }
    expect((await failureOf(step)).failure).toBe("false_abstention")
  })

  test("AC11 — config A, without a loop, names every retrieval failure retrieval_miss", async () => {
    const overrides = new Map([[question.id, wrongStep(["A.md"])]])
    const { records } = await runWith([question], { overrides }).result
    expect(records[0]!.grade).toEqual({
      correct: false,
      failure: "retrieval_miss",
    })
  })

  test("AC11 — a correct answer on an incomplete context has no failure", async () => {
    const loop = loopOf("sufficient", 1, 0, "answer", { kept: ["B.md"] })
    const step: Step = {
      notes: ["A.md"],
      output: answered("Denver"),
      loop,
      answerCall: call(HAIKU, 1000, 100, 300),
    }
    expect(await failureOf(step)).toEqual({ correct: true, failure: null })
  })

  test("AC11 — report.md lists the failures with their ids, the retrieval family before the answer family", async () => {
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)]
    const overrides = new Map<string, Step>([
      // Wrong answer on a complete context.
      ["q-001", wrongStep(questions[0]!.sources)],
      // Incomplete context, never retrieved.
      ["q-002", wrongStep(["Other.md"])],
      ["q-003", wrongStep(["Other.md"])],
    ])
    const { result, runsDir } = runWith(questions, { overrides })
    await result
    const report = readFileSync(join(readRunDir(runsDir), "report.md"), "utf8")
    const missAt = report.indexOf("### retrieval_miss")
    const wrongAt = report.indexOf("### wrong_answer")
    expect(missAt).toBeGreaterThanOrEqual(0)
    expect(wrongAt).toBeGreaterThan(missAt)
    expect(report.indexOf("q-002, q-003", missAt)).toBeGreaterThan(missAt)
    expect(report.indexOf("q-001", wrongAt)).toBeGreaterThan(wrongAt)
  })
})

describe("AC13 — context and layer metrics", () => {
  const records = [
    makeRecord(1, {
      category: "simple",
      contextComplete: true,
      precision: 1,
      notesInContext: 2,
    }),
    makeRecord(2, {
      category: "simple",
      contextComplete: false,
      precision: 0.5,
      notesInContext: 4,
      grade: wrong("judge_rejected"),
    }),
    makeRecord(3, {
      category: "no_answer",
      contextComplete: null,
      precision: null,
      notesInContext: 0,
    }),
    makeRecord(4, {
      category: "temporal",
      contextComplete: true,
      precision: 0,
      notesInContext: 3,
      grade: wrong("wrong_answer"),
    }),
  ]

  test("AC13 — contextCompleteRate is the share of complete contexts over the questions with sources", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).contextCompleteRate as number).toBeCloseTo(2 / 3, 9)
    expect(plain(byCategory.simple).contextCompleteRate as number).toBeCloseTo(
      0.5,
      9
    )
    expect(plain(byCategory.temporal).contextCompleteRate).toBe(1)
  })

  test("AC13 — contextCompleteRate is null when no question has sources", () => {
    const { byCategory } = summarize(records)
    expect(plain(byCategory.no_answer).contextCompleteRate).toBeNull()
  })

  test("AC13 — meanPrecision averages the records with a non-empty context", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).meanPrecision as number).toBeCloseTo(0.5, 9)
    expect(plain(byCategory.simple).meanPrecision as number).toBeCloseTo(
      0.75,
      9
    )
    expect(plain(byCategory.temporal).meanPrecision).toBe(0)
  })

  test("AC13 — meanPrecision is null when every context is empty", () => {
    const { byCategory } = summarize(records)
    expect(plain(byCategory.no_answer).meanPrecision).toBeNull()
  })

  test("AC13 — meanNotesInContext averages the notes in the context over every record", () => {
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).meanNotesInContext as number).toBeCloseTo(2.25, 9)
    expect(plain(byCategory.simple).meanNotesInContext as number).toBeCloseTo(
      3,
      9
    )
    expect(plain(byCategory.no_answer).meanNotesInContext).toBe(0)
  })

  const graded = [
    makeRecord(1),
    makeRecord(2, { category: "temporal", grade: wrong("loop_error") }),
    makeRecord(3, { category: "temporal", grade: wrong("context_budget") }),
    makeRecord(4, { grade: wrong("judge_rejected") }),
    makeRecord(5, { grade: wrong("not_followed") }),
    makeRecord(6, { grade: wrong("retrieval_miss") }),
    makeRecord(7, { category: "temporal", grade: wrong("answer_error") }),
    makeRecord(8, { grade: wrong("false_abstention") }),
    makeRecord(9, { grade: wrong("wrong_answer") }),
  ]

  test("AC13 — failuresByFamily counts the failures of each family, a correct answer in none", () => {
    const { overall, byCategory } = summarize(graded)
    expect(plain(overall).failuresByFamily).toEqual({ retrieval: 5, answer: 3 })
    expect(plain(byCategory.temporal).failuresByFamily).toEqual({
      retrieval: 2,
      answer: 1,
    })
    expect(plain(byCategory.simple).failuresByFamily).toEqual({
      retrieval: 3,
      answer: 2,
    })
  })

  test("AC13 — failuresByFamily is zero for both families when every answer is correct", () => {
    const { overall } = summarize([makeRecord(1), makeRecord(2)])
    expect(plain(overall).failuresByFamily).toEqual({ retrieval: 0, answer: 0 })
  })

  test("AC13 — failures keeps a count for every failure of the taxonomy", () => {
    const { overall } = summarize(graded)
    expect(plain(overall.failures)).toEqual({
      ...NO_FAILURES,
      loop_error: 1,
      context_budget: 1,
      judge_rejected: 1,
      not_followed: 1,
      retrieval_miss: 1,
      answer_error: 1,
      false_abstention: 1,
      wrong_answer: 1,
    })
  })

  const abstained = {
    status: "abstained" as const,
    value: "",
    answer: "No answer.",
    citations: [],
  }

  test("AC13 — abstentions separates the abstentions of the loop from those of the answerer", () => {
    const summary = summarize([
      // The loop abstained: no answerer call.
      makeRecord(1, {
        category: "no_answer",
        output: abstained,
        loop: loopOf("abstain-nothing-relevant", 0, 1, "abstain"),
      }),
      makeRecord(2, {
        category: "no_answer",
        output: abstained,
        loop: loopOf("abstain-nothing-relevant", 0, 0, "abstain"),
      }),
      // The answerer abstained, on a loop run.
      makeRecord(3, {
        output: abstained,
        loop: loopOf("sufficient", 1, 0, "answer"),
      }),
      // The answerer abstained, config A (no loop).
      makeRecord(4, { output: abstained }),
      // Answered.
      makeRecord(5, { loop: loopOf("sufficient", 1, 0, "answer") }),
      // The answerer threw: no output, no abstention.
      makeRecord(6, {
        output: null,
        grade: wrong("answer_error"),
        loop: loopOf("sufficient", 1, 0, "answer"),
      }),
      // The loop failed: no output, no abstention.
      makeRecord(7, {
        output: null,
        grade: wrong("loop_error"),
        loop: {
          ...loopOf("loop_error", 0, 0),
          outcome: { type: "error", rule: "loop_error" },
        },
      }),
    ])
    expect(plain(summary.overall).abstentions).toEqual({ loop: 2, answerer: 2 })
    expect(plain(summary.byCategory.no_answer).abstentions).toEqual({
      loop: 2,
      answerer: 0,
    })
    expect(plain(summary.byCategory.simple).abstentions).toEqual({
      loop: 0,
      answerer: 2,
    })
  })

  test("AC13 — abstentions are zero for a run without any abstention", () => {
    const { overall } = summarize([makeRecord(1), makeRecord(2)])
    expect(plain(overall).abstentions).toEqual({ loop: 0, answerer: 0 })
  })

  test("AC13 — runEval writes the new metrics in summary.json", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, {
        sources: ["A.md", "B.md"],
        sourceGroups: [["A.md"], ["B.md"]],
      }),
    ]
    const overrides = new Map<string, Step>([
      [
        "q-001",
        { ...goodStep(questions[0]!), notes: ["Notes/source-1.md", "X.md"] },
      ],
      ["q-002", wrongStep(["A.md"])],
    ])
    const { result, runsDir } = runWith(questions, { overrides })
    const { summary } = await result
    expect(plain(summary.overall).contextCompleteRate).toBeCloseTo(0.5, 9)
    expect(plain(summary.overall).meanPrecision).toBeCloseTo(0.75, 9)
    expect(plain(summary.overall).meanNotesInContext).toBeCloseTo(1.5, 9)
    expect(plain(summary.overall).failuresByFamily).toEqual({
      retrieval: 1,
      answer: 0,
    })
    const written = JSON.parse(
      readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
    ) as { overall: Record<string, unknown> }
    expect(written.overall.contextCompleteRate).toBeCloseTo(0.5, 9)
    expect(written.overall.meanPrecision).toBeCloseTo(0.75, 9)
    expect(written.overall.meanNotesInContext).toBeCloseTo(1.5, 9)
    expect(written.overall.failuresByFamily).toEqual({
      retrieval: 1,
      answer: 0,
    })
    expect(written.overall.abstentions).toEqual({ loop: 0, answerer: 0 })
  })
})

describe("AC14 — loop errors", () => {
  const LOOP_ERROR_CALLS = [
    // 2 USD: a judge call that was paid for before the loop failed.
    judgeCall(MILLION, 0, 200, "claude-sonnet-5-5"),
    // 0.10 USD: the query embedding.
    call("mistral-embed", MILLION, 0, 10),
  ]
  const LOOP_ERROR_STEPS = [{ kind: "search", query: "q" }, { kind: "judge" }]
  const failedLoop = {
    message: "judge returned an invalid answer",
    calls: LOOP_ERROR_CALLS,
    steps: LOOP_ERROR_STEPS,
  }

  function failingLoop(question: Question): Map<string, Step> {
    return new Map([
      [
        question.id,
        { notes: [], output: answered("unused"), loopError: failedLoop },
      ],
    ])
  }

  test("AC14 — a loop that throws a LoopError is recorded with its message, its calls and a null output", async () => {
    const question = makeQuestion(1)
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    const record = plain(records[0])
    expect(record.id).toBe("q-001")
    expect(record.error).toBe("judge returned an invalid answer")
    expect(record.calls).toEqual(LOOP_ERROR_CALLS)
    expect(record.output).toBeNull()
    expect(record.contextNotes).toEqual([])
  })

  test("AC14 — the record holds a loop of outcome error, rule loop_error, with the steps of the error and empty lists", async () => {
    const question = makeQuestion(1)
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    expect(plain(records[0]).loop).toEqual({
      outcome: { type: "error", rule: "loop_error" },
      hops: 0,
      rewrites: 0,
      steps: LOOP_ERROR_STEPS,
      judged: {},
      kept: [],
      frontier: [],
    })
  })

  test("AC14 — the grade is a loop_error failure", async () => {
    const question = makeQuestion(1)
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    expect(records[0]!.grade).toEqual({ correct: false, failure: "loop_error" })
  })

  test("AC14 — a loop_error is a failure even on a question that expects an abstention", async () => {
    const question = makeQuestion(1, {
      category: "no_answer",
      expected: { kind: "abstain" },
      stale: [],
      sources: [],
      sourceGroups: [],
    })
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    expect(records[0]!.grade).toEqual({ correct: false, failure: "loop_error" })
    expect(plain(records[0]).contextComplete).toBeNull()
  })

  test("AC14 — the cost counts the calls of the error", async () => {
    const question = makeQuestion(1)
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    expect(records[0]!.costUsd).toBeCloseTo(2.1, 9)
  })

  test("AC14 — the answerer is not called for a question whose loop failed", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const overrides = failingLoop(questions[0]!)
    const { fake, result } = runWith(questions, { config: "B", overrides })
    await result
    expect(fake.answerCalls.map((a) => a.question)).toEqual([
      questions[1]!.question,
    ])
  })

  test("AC14 — the context measures of a failed loop are those of an empty context", async () => {
    const question = makeQuestion(1)
    const { records } = await runWith([question], {
      config: "B",
      overrides: failingLoop(question),
    }).result
    const record = plain(records[0])
    expect(record.recall).toBe(0)
    expect(record.contextComplete).toBe(false)
    expect(record.precision).toBeNull()
    expect(record.notesInContext).toBe(0)
  })

  test("AC14 — the run goes on with the next questions", async () => {
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)]
    const { records, skipped } = await runWith(questions, {
      config: "B",
      overrides: failingLoop(questions[1]!),
    }).result
    expect(records.map((r) => r.id)).toEqual(["q-001", "q-002", "q-003"])
    expect(skipped).toBe(0)
    expect(records.map((r) => r.grade.failure)).toEqual([
      null,
      "loop_error",
      null,
    ])
  })

  test("AC14 — the cost of a failed loop counts toward the cost cap", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const overrides = new Map<string, Step>(
      questions.map((q) => [
        q.id,
        { notes: [], output: answered("unused"), loopError: failedLoop },
      ])
    )
    const { records, skipped } = await runWith(questions, {
      config: "B",
      maxCostUsd: 2,
      overrides,
    }).result
    expect(records).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  test("AC14 — the trace keeps the failed question with its loop, its error and its cost", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const { result, runsDir } = runWith(questions, {
      config: "B",
      overrides: failingLoop(questions[0]!),
    })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(lines).toHaveLength(3)
    const traced = plain(JSON.parse(lines[1]!))
    expect(traced.error).toBe("judge returned an invalid answer")
    expect(traced.output).toBeNull()
    expect(plain(traced.loop).outcome).toEqual({
      type: "error",
      rule: "loop_error",
    })
    expect(plain(traced.grade).failure).toBe("loop_error")
    expect(traced.costUsd as number).toBeCloseTo(2.1, 9)
  })

  test("AC14 — loop_error is counted in the failures, in the retrieval family, and is no abstention", async () => {
    const questions = [
      makeQuestion(1),
      makeQuestion(2, { category: "temporal" }),
    ]
    const { summary } = await runWith(questions, {
      config: "B",
      overrides: failingLoop(questions[1]!),
    }).result
    expect(plain(summary.overall.failures).loop_error).toBe(1)
    expect(plain(summary.byCategory.temporal!.failures).loop_error).toBe(1)
    expect(plain(summary.byCategory.simple!.failures).loop_error).toBe(0)
    expect(plain(summary.overall).failuresByFamily).toEqual({
      retrieval: 1,
      answer: 0,
    })
    expect(plain(summary.overall).abstentions).toEqual({ loop: 0, answerer: 0 })
  })

  test("AC14 — a failed loop does not count in the answerer's input tokens", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const { summary } = await runWith(questions, {
      config: "B",
      overrides: failingLoop(questions[1]!),
    }).result
    // Only q-001 reached the answerer, with 1000 input tokens.
    expect(summary.overall.meanInputTokens).toBeCloseTo(1000, 9)
  })

  test("AC14 — any other error thrown by retrieve stops the run", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const overrides = new Map<string, Step>([
      [
        "q-001",
        { notes: [], output: answered("unused"), retrieveError: "index gone" },
      ],
    ])
    const { fake, result } = runWith(questions, { overrides })
    const error = await rejection(result)
    expect(error.message).toBe("index gone")
    expect(fake.answerCalls).toEqual([])
  })
})

describe("AC8 (eval-config-b) — candidates in the settings line and the report header", () => {
  const questions = [makeQuestion(1)]

  test("AC8 — the settings line holds k and candidates", async () => {
    const { result, runsDir } = runWith(questions, { k: 5, candidates: 30 })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const header = plain(JSON.parse(lines[0]!))
    expect(header.k).toBe(5)
    expect(header.candidates).toBe(30)
  })

  test("AC8 — the settings line of a B run holds the candidates next to the loop settings", async () => {
    const { result, runsDir } = runWith(questions, {
      config: "B",
      models: B_MODELS,
      loop: LOOP_SETTINGS,
      candidates: 50,
    })
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const header = plain(JSON.parse(lines[0]!))
    expect(header.candidates).toBe(50)
    expect(header.loop).toEqual(LOOP_SETTINGS)
  })

  test("AC8 — the report header shows k, candidates and the commit", async () => {
    const { result, runsDir } = runWith(questions, { k: 5, candidates: 50 })
    await result
    const report = readFileSync(join(readRunDir(runsDir), "report.md"), "utf8")
    expect(report.split("\n")).toContain(
      "k = 5, candidates = 50, commit abc1234"
    )
  })

  test("AC8 — renderReport takes the candidates from its settings", () => {
    const settings = {
      config: "A",
      split: "test" as const,
      k: 5,
      candidates: 20,
      gitCommit: "def5678",
    }
    const report = renderReport(settings, [], summarize([]))
    expect(report.split("\n")).toContain(
      "k = 5, candidates = 20, commit def5678"
    )
  })
})

describe("AC9 (eval-config-b) — loop records", () => {
  test("AC9 — a B record's loop holds the final rule, hops, rewrites, steps, judged, kept and frontier as returned", async () => {
    const question = makeQuestion(1)
    const loop = loopOf("sufficient", 2, 1, "answer", {
      judged: {
        "Notes/source-1.md": { relevance: 0.9 },
        "Notes/dropped.md": { relevance: 0.1 },
      },
      kept: ["Notes/source-1.md"],
      frontier: ["Notes/linked.md"],
    })
    const overrides = new Map([[question.id, { ...goodStep(question), loop }]])
    const { result, runsDir } = runWith([question], { config: "B", overrides })
    const { records } = await result
    expect(plain(records[0]).loop).toEqual(loop)
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    expect(plain(JSON.parse(lines[1]!)).loop).toEqual(loop)
  })
})

type Role = "embed" | "judge" | "fallback" | "rewrite" | "answer"

const ROLE_NAMES: Role[] = ["embed", "judge", "fallback", "rewrite", "answer"]

const STAGE_NAMES = [
  "searchMs",
  "judgeMs",
  "fallbackMs",
  "rewriteMs",
  "answerMs",
] as const

/** A call that carries its role. */
function roleCall(
  role: Role,
  model: string,
  inputTokens: number,
  outputTokens: number
): ModelCall {
  return { ...call(model, inputTokens, outputTokens, 10), role }
}

function stagesOf(record: unknown): Record<string, number> {
  return plain(record).stages as Record<string, number>
}

describe("AC4 (eval-config-c) — prices", () => {
  test("AC4 — the price table holds jev-1.13.0 at 0.042 USD per million input tokens, output free", () => {
    expect(PRICES["jev-1.13.0"]).toEqual({ input: 0.042, output: 0 })
  })

  test("AC4 — the price table holds clef-flash at zero", () => {
    expect(PRICES["clef-flash"]).toEqual({ input: 0, output: 0 })
  })

  test("AC4 — callCostUsd prices a jev-1.13.0 call on its input tokens only", () => {
    expect(callCostUsd(call("jev-1.13.0", MILLION, MILLION, 10))).toBeCloseTo(
      0.042,
      9
    )
    expect(callCostUsd(call("jev-1.13.0", 500_000, 0, 10))).toBeCloseTo(
      0.021,
      9
    )
  })

  test("AC4 — callCostUsd prices a clef-flash call at zero", () => {
    expect(callCostUsd(call("clef-flash", MILLION, MILLION, 10))).toBe(0)
  })

  test("AC4 — a record's costUsd includes the jev-1.13.0 calls of the loop", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          retrievalCalls: [roleCall("judge", "jev-1.13.0", MILLION, 0)],
          loop: loopOf("sufficient", 0, 0),
          // 0.10 USD.
          answerCall: call(HAIKU, MILLION, 0, 100),
        },
      ],
    ])
    const { records } = await runWith([question], {
      config: "C",
      overrides,
    }).result
    expect(records[0]!.costUsd).toBeCloseTo(0.142, 9)
  })

  test("AC4 — the settings line prices jev-1.13.0 and clef-flash", async () => {
    const { result, runsDir } = runWith([makeQuestion(1)])
    await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const prices = plain(JSON.parse(lines[0]!)).prices as Record<
      string,
      unknown
    >
    expect(prices["jev-1.13.0"]).toEqual({ input: 0.042, output: 0 })
    expect(prices["clef-flash"]).toEqual({ input: 0, output: 0 })
  })
})

describe("AC6 (eval-config-c) — stages in the records", () => {
  const LOOP_STAGES = {
    searchMs: 11,
    judgeMs: 22,
    fallbackMs: 33,
    rewriteMs: 44,
  }

  test("AC6 — config A: searchMs is the wall-clock time of retrieve, the other loop stages are 0", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [question.id, { ...goodStep(question), retrieveDelayMs: 40 }],
    ])
    const { records } = await runWith([question], { overrides }).result
    const stages = stagesOf(records[0])
    expect(stages.searchMs).toBeGreaterThanOrEqual(35)
    expect(stages.searchMs).toBeLessThan(1000)
    expect(stages.judgeMs).toBe(0)
    expect(stages.fallbackMs).toBe(0)
    expect(stages.rewriteMs).toBe(0)
  })

  test("AC6 — answerMs is the wall-clock time of the answer call", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [question.id, { ...goodStep(question), answerDelayMs: 40 }],
    ])
    const { records } = await runWith([question], { overrides }).result
    const { answerMs } = stagesOf(records[0])
    expect(answerMs).toBeGreaterThanOrEqual(35)
    expect(answerMs).toBeLessThan(1000)
  })

  test("AC6 — a record has the five stages, as numbers", async () => {
    const { records } = await runWith([makeQuestion(1), makeQuestion(2)]).result
    for (const record of records) {
      const stages = stagesOf(record)
      expect(Object.keys(stages).sort()).toEqual([...STAGE_NAMES].sort())
      for (const name of STAGE_NAMES) {
        expect(Number.isFinite(stages[name])).toBe(true)
        expect(stages[name]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test("AC6 — the loop stages returned by retrieve are kept as they are, and answerMs is measured", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          loop: loopOf("sufficient", 1, 1),
          stages: LOOP_STAGES,
          // The measured time of retrieve must not replace the loop's searchMs.
          retrieveDelayMs: 30,
          answerDelayMs: 30,
        },
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    const stages = stagesOf(records[0])
    expect(stages.searchMs).toBe(11)
    expect(stages.judgeMs).toBe(22)
    expect(stages.fallbackMs).toBe(33)
    expect(stages.rewriteMs).toBe(44)
    expect(stages.answerMs).toBeGreaterThanOrEqual(25)
    expect(stages.answerMs).toBeLessThan(1000)
  })

  test("AC6 — answerMs is 0 when the answer returns no call, even if the answerer took time", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          loop: loopOf("abstain-nothing-relevant", 0, 0, "abstain"),
          stages: LOOP_STAGES,
          answerCall: null,
          answerDelayMs: 30,
        },
      ],
    ])
    const { records } = await runWith([question], {
      config: "C",
      overrides,
    }).result
    expect(stagesOf(records[0])).toEqual({ ...LOOP_STAGES, answerMs: 0 })
  })

  test("AC6 — a loop error record has all-zero stages, whatever the time the loop took", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: [],
          output: answered("unused"),
          retrieveDelayMs: 30,
          loopError: { message: "judge failed", calls: [], steps: [] },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "C",
      overrides,
    }).result
    expect(plain(records[0]).error).toBe("judge failed")
    expect(stagesOf(records[0])).toEqual(zeroStages())
  })

  test("AC6 — the trace line of a record holds its stages", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          loop: loopOf("sufficient", 1, 0),
          stages: LOOP_STAGES,
        },
      ],
    ])
    const { result, runsDir } = runWith([question], { config: "B", overrides })
    const { records } = await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const traced = stagesOf(JSON.parse(lines[1]!))
    expect(traced).toEqual(stagesOf(records[0]))
    expect(traced.judgeMs).toBe(22)
    expect(Object.keys(traced).sort()).toEqual([...STAGE_NAMES].sort())
  })

  test("AC6 — a record's loop keeps the fallback list returned by retrieve, and has none for B", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const withFallback = loopOf("sufficient", 1, 0, "answer", {
      judged: { "A.md": { relevance: 0.4 }, "B.md": { relevance: 0.9 } },
    })
    withFallback.fallback = ["A.md"]
    const overrides = new Map([
      ["q-001", { ...goodStep(questions[0]!), loop: withFallback }],
      [
        "q-002",
        { ...goodStep(questions[1]!), loop: loopOf("sufficient", 0, 0) },
      ],
    ])
    const { records } = await runWith(questions, {
      config: "C",
      overrides,
    }).result
    expect(plain(records[0]).loop).toEqual(withFallback)
    expect(plain(plain(records[0]).loop).fallback).toEqual(["A.md"])
    expect(plain(plain(records[1]).loop).fallback).toBeUndefined()
  })
})

describe("AC7 (eval-config-c) — stage, role and fallback metrics", () => {
  function withStages(
    n: number,
    category: RunRecord["category"],
    stages: Partial<ReturnType<typeof zeroStages>>
  ): RunRecord {
    return makeRecord(n, { category, stages: { ...zeroStages(), ...stages } })
  }

  const records = [
    withStages(1, "simple", { searchMs: 10, judgeMs: 100, answerMs: 1000 }),
    withStages(2, "simple", { searchMs: 30, judgeMs: 300, answerMs: 3000 }),
    withStages(3, "simple", { searchMs: 20, judgeMs: 200, answerMs: 2000 }),
    withStages(4, "temporal", {
      searchMs: 40,
      fallbackMs: 400,
      rewriteMs: 4000,
    }),
    withStages(5, "temporal", {
      searchMs: 50,
      fallbackMs: 500,
      rewriteMs: 5000,
    }),
    withStages(6, "temporal", {
      searchMs: 60,
      fallbackMs: 900,
      rewriteMs: 3000,
    }),
    withStages(7, "multi_hop", { searchMs: 70, answerMs: 7000 }),
  ]

  test("AC7 — the median of each stage, overall and per category", () => {
    const { overall, byCategory } = summarize(records)
    const median = (m: unknown) => plain(m).stageMedianMs
    // Overall, sorted: searchMs 10..70 -> 40; judgeMs 0,0,0,0,100,200,300 -> 0.
    expect(median(overall)).toEqual({
      searchMs: 40,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 1000,
    })
    expect(median(byCategory.simple)).toEqual({
      searchMs: 20,
      judgeMs: 200,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 2000,
    })
    expect(median(byCategory.temporal)).toEqual({
      searchMs: 50,
      judgeMs: 0,
      fallbackMs: 500,
      rewriteMs: 4000,
      answerMs: 0,
    })
    expect(median(byCategory.multi_hop)).toEqual({
      searchMs: 70,
      judgeMs: 0,
      fallbackMs: 0,
      rewriteMs: 0,
      answerMs: 7000,
    })
  })

  test("AC7 — the mean of each stage, overall and per category", () => {
    const { overall, byCategory } = summarize(records)
    const mean = (m: unknown) => plain(m).stageMeanMs as Record<string, number>
    expect(mean(overall).searchMs).toBeCloseTo(280 / 7, 9)
    expect(mean(overall).judgeMs).toBeCloseTo(600 / 7, 9)
    expect(mean(overall).fallbackMs).toBeCloseTo(1800 / 7, 9)
    expect(mean(overall).rewriteMs).toBeCloseTo(12000 / 7, 9)
    expect(mean(overall).answerMs).toBeCloseTo(13000 / 7, 9)
    expect(mean(byCategory.simple).searchMs).toBeCloseTo(20, 9)
    expect(mean(byCategory.simple).judgeMs).toBeCloseTo(200, 9)
    expect(mean(byCategory.temporal).fallbackMs).toBeCloseTo(600, 9)
    expect(mean(byCategory.temporal).rewriteMs).toBeCloseTo(4000, 9)
    expect(mean(byCategory.multi_hop).answerMs).toBeCloseTo(7000, 9)
  })

  test("AC7 — the stage metrics are null for every stage when there is no record", () => {
    const empty = {
      searchMs: null,
      judgeMs: null,
      fallbackMs: null,
      rewriteMs: null,
      answerMs: null,
    }
    const { overall } = summarize([])
    expect(plain(overall).stageMedianMs).toEqual(empty)
    expect(plain(overall).stageMeanMs).toEqual(empty)
  })

  test("AC7 — runEval summarizes the stages of its records", async () => {
    const questions = [makeQuestion(1), makeQuestion(2), makeQuestion(3)]
    const overrides = new Map(
      questions.map((q, i) => [
        q.id,
        {
          ...goodStep(q),
          loop: loopOf("sufficient", 0, 0),
          stages: {
            searchMs: 10 * (i + 1),
            judgeMs: 0,
            fallbackMs: 5,
            rewriteMs: 0,
          },
        },
      ])
    )
    const { result, runsDir } = runWith(questions, { config: "C", overrides })
    const { summary } = await result
    expect(plain(summary.overall).stageMedianMs).toMatchObject({
      searchMs: 20,
      fallbackMs: 5,
    })
    expect(plain(summary.overall).stageMeanMs).toMatchObject({
      searchMs: 20,
      fallbackMs: 5,
    })
    const written = JSON.parse(
      readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
    ) as { overall: Record<string, Record<string, number>> }
    expect(written.overall.stageMedianMs!.searchMs).toBe(20)
  })

  test("AC7 — cost and calls per role: mean per question, over all the records, calls without a role not counted", () => {
    const first = makeRecord(1, {
      category: "simple",
      calls: [
        // 0.10 USD.
        roleCall("embed", "mistral-embed", MILLION, 0),
        // 0.10 USD each.
        roleCall("judge", HAIKU, MILLION, 0),
        roleCall("judge", HAIKU, MILLION, 0),
        // 0.50 USD.
        roleCall("fallback", HAIKU, 0, MILLION),
        // 0.60 USD.
        roleCall("answer", HAIKU, MILLION, MILLION),
      ],
    })
    const second = makeRecord(2, {
      category: "temporal",
      calls: [
        roleCall("embed", "mistral-embed", MILLION, 0),
        // A call without role is counted in no role.
        call(HAIKU, MILLION, 0, 10),
        roleCall("answer", HAIKU, MILLION, MILLION),
        // 2 USD, the rewriter.
        roleCall("rewrite", "claude-sonnet-5-5", MILLION, 0),
      ],
    })
    const { overall, byCategory } = summarize([first, second])
    const cost = (m: unknown) => plain(m).costByRole as Record<string, number>
    const calls = (m: unknown) => plain(m).callsByRole as Record<string, number>

    expect(Object.keys(cost(overall)).sort()).toEqual([...ROLE_NAMES].sort())
    expect(Object.keys(calls(overall)).sort()).toEqual([...ROLE_NAMES].sort())

    expect(cost(overall).embed).toBeCloseTo(0.1, 9)
    expect(cost(overall).judge).toBeCloseTo(0.1, 9)
    expect(cost(overall).fallback).toBeCloseTo(0.25, 9)
    expect(cost(overall).rewrite).toBeCloseTo(1, 9)
    expect(cost(overall).answer).toBeCloseTo(0.6, 9)
    expect(calls(overall)).toEqual({
      embed: 1,
      judge: 1,
      fallback: 0.5,
      rewrite: 0.5,
      answer: 1,
    })

    expect(cost(byCategory.simple).judge).toBeCloseTo(0.2, 9)
    expect(cost(byCategory.simple).rewrite).toBe(0)
    expect(calls(byCategory.simple)).toEqual({
      embed: 1,
      judge: 2,
      fallback: 1,
      rewrite: 0,
      answer: 1,
    })
    expect(cost(byCategory.temporal).rewrite).toBeCloseTo(2, 9)
    expect(cost(byCategory.temporal).judge).toBe(0)
    expect(calls(byCategory.temporal)).toEqual({
      embed: 1,
      judge: 0,
      fallback: 0,
      rewrite: 1,
      answer: 1,
    })
  })

  test("AC7 — a role with no call costs 0 and counts 0, not null", () => {
    const { overall } = summarize([makeRecord(1)])
    const cost = plain(overall).costByRole as Record<string, number>
    const calls = plain(overall).callsByRole as Record<string, number>
    for (const role of ROLE_NAMES) {
      expect(cost[role]).toBe(0)
      expect(calls[role]).toBe(0)
    }
  })

  /** A loop record with `judged` notes and, for config C, a fallback list. */
  function fallbackRecord(
    n: number,
    category: RunRecord["category"],
    judged: number,
    fallback: string[] | undefined
  ): RunRecord {
    const notes = Array.from(
      { length: judged },
      (_, i) => `Notes/n-${n}-${i}.md`
    )
    const loop = loopOf("sufficient", 0, 0, "answer", {
      judged: Object.fromEntries(
        notes.map((note) => [note, { relevance: 0.5 }])
      ),
    })
    if (fallback) loop.fallback = fallback
    return makeRecord(n, { category, loop })
  }

  test("AC7 — fallbackNoteRate and fallbackQuestionRate, overall and per category", () => {
    const records = [
      fallbackRecord(1, "simple", 4, ["Notes/n-1-0.md"]),
      fallbackRecord(2, "temporal", 6, ["a.md", "b.md", "c.md"]),
      fallbackRecord(3, "simple", 2, []),
      // Config B record: no fallback list, not counted.
      fallbackRecord(4, "multi_hop", 10, undefined),
      // Config A record: no loop at all, not counted.
      makeRecord(5, { category: "no_answer" }),
    ]
    const { overall, byCategory } = summarize(records)
    // (1 + 3 + 0) / (4 + 6 + 2); 2 of the 3 records with a list.
    expect(plain(overall).fallbackNoteRate as number).toBeCloseTo(4 / 12, 9)
    expect(plain(overall).fallbackQuestionRate as number).toBeCloseTo(2 / 3, 9)
    // simple: (1 + 0) / (4 + 2); 1 of 2.
    expect(plain(byCategory.simple).fallbackNoteRate as number).toBeCloseTo(
      1 / 6,
      9
    )
    expect(plain(byCategory.simple).fallbackQuestionRate as number).toBeCloseTo(
      1 / 2,
      9
    )
    expect(plain(byCategory.temporal).fallbackNoteRate as number).toBeCloseTo(
      0.5,
      9
    )
    expect(plain(byCategory.temporal).fallbackQuestionRate).toBe(1)
  })

  test("AC7 — the fallback rates are null when no record has a fallback list", () => {
    const { overall, byCategory } = summarize([
      fallbackRecord(1, "simple", 4, undefined),
      fallbackRecord(2, "multi_hop", 3, undefined),
      makeRecord(3, { category: "temporal" }),
    ])
    for (const metrics of [
      overall,
      byCategory.simple!,
      byCategory.multi_hop!,
      byCategory.temporal!,
    ]) {
      expect(plain(metrics).fallbackNoteRate).toBeNull()
      expect(plain(metrics).fallbackQuestionRate).toBeNull()
    }
  })

  test("AC7 — a fallback rate of zero is 0, not null, when the lists are empty", () => {
    const { overall } = summarize([
      fallbackRecord(1, "simple", 4, []),
      fallbackRecord(2, "simple", 2, []),
    ])
    expect(plain(overall).fallbackNoteRate).toBe(0)
    expect(plain(overall).fallbackQuestionRate).toBe(0)
  })

  test("AC7 — runEval writes the fallback rates and the role metrics in summary.json", async () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const loopWith = (fallback: string[]) => {
      const loop = loopOf("sufficient", 0, 0, "answer", {
        judged: { "A.md": { relevance: 0.5 }, "B.md": { relevance: 0.5 } },
      })
      loop.fallback = fallback
      return loop
    }
    const overrides = new Map([
      [
        "q-001",
        {
          ...goodStep(questions[0]!),
          loop: loopWith(["A.md"]),
          retrievalCalls: [roleCall("judge", HAIKU, MILLION, 0)],
        },
      ],
      [
        "q-002",
        {
          ...goodStep(questions[1]!),
          loop: loopWith([]),
          retrievalCalls: [roleCall("judge", HAIKU, MILLION, 0)],
        },
      ],
    ])
    const { result, runsDir } = runWith(questions, { config: "C", overrides })
    await result
    const written = JSON.parse(
      readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
    ) as { overall: Record<string, unknown> }
    expect(written.overall.fallbackNoteRate).toBeCloseTo(0.25, 9)
    expect(written.overall.fallbackQuestionRate).toBeCloseTo(0.5, 9)
    const judge = (written.overall.callsByRole as Record<string, number>).judge
    expect(judge).toBe(1)
    const judgeCost = (written.overall.costByRole as Record<string, number>)
      .judge
    expect(judgeCost).toBeCloseTo(0.1, 9)
  })
})

function progressLine(record: RunRecord, done: number, total: number): string {
  const format = (runModule as unknown as Record<string, unknown>).progressLine
  if (typeof format !== "function") {
    throw new Error("progressLine is not exported by run.ts")
  }
  return (format as (r: RunRecord, d: number, t: number) => string)(
    record,
    done,
    total
  )
}

describe("AC16 (revision 4) — progress", () => {
  test("AC16 — progressLine prints the position, the id, the category, the verdict, the latency in seconds and the cost", () => {
    const record = makeRecord(13, {
      category: "multi_hop",
      latencyMs: 5200,
      costUsd: 0.0021,
    })
    expect(progressLine(record, 12, 60)).toBe(
      "[12/60] q-013 multi_hop correct 5.2 s 0.0021 USD"
    )
  })

  test("AC16 — progressLine prints wrong (<failure>) instead of correct for a wrong answer", () => {
    const record = makeRecord(4, {
      category: "temporal",
      grade: wrong("retrieval_miss"),
      latencyMs: 800,
      costUsd: 0.01,
    })
    expect(progressLine(record, 1, 5)).toBe(
      "[1/5] q-004 temporal wrong (retrieval_miss) 0.8 s 0.0100 USD"
    )
  })

  test("AC16 — progressLine rounds the latency to one decimal and the cost to four", () => {
    const rounded = makeRecord(1, { latencyMs: 5240, costUsd: 0.00214 })
    expect(progressLine(rounded, 1, 2)).toBe(
      "[1/2] q-001 simple correct 5.2 s 0.0021 USD"
    )
    const up = makeRecord(2, { latencyMs: 5260, costUsd: 0.00216 })
    expect(progressLine(up, 2, 2)).toBe(
      "[2/2] q-002 simple correct 5.3 s 0.0022 USD"
    )
    const zero = makeRecord(3, { latencyMs: 0, costUsd: 0 })
    expect(progressLine(zero, 3, 3)).toBe(
      "[3/3] q-003 simple correct 0.0 s 0.0000 USD"
    )
    const big = makeRecord(4, { latencyMs: 12_000, costUsd: 12.5 })
    expect(progressLine(big, 4, 4)).toBe(
      "[4/4] q-004 simple correct 12.0 s 12.5000 USD"
    )
  })

  test("AC16 — onProgress is called once per question, in order, with done from 1 to n and total n", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const seen: Array<{ id: string; done: number; total: number }> = []
    const { result } = runWith(questions, {
      onProgress: (record, done, total) => {
        seen.push({ id: record.id, done, total })
      },
    })
    const { records } = await result
    expect(records).toHaveLength(3)
    expect(seen).toEqual([
      { id: "q-001", done: 1, total: 3 },
      { id: "q-002", done: 2, total: 3 },
      { id: "q-003", done: 3, total: 3 },
    ])
  })

  test("AC16 — onProgress receives the record of the question, the one the run returns", async () => {
    const questions = [1, 2].map((n) => makeQuestion(n))
    const received: RunRecord[] = []
    const { result } = runWith(questions, {
      onProgress: (record) => {
        received.push(record)
      },
    })
    const { records } = await result
    expect(received).toEqual(records)
  })

  test("AC16 — the trace line of the question is already on disk when onProgress runs", async () => {
    const questions = [1, 2, 3].map((n) => makeQuestion(n))
    const runsDir = join(makeTempDir(), "runs")
    const onDisk: Array<{ done: number; lines: unknown[] }> = []
    const received: RunRecord[] = []
    const { result } = runWith(questions, {
      runsDir,
      onProgress: (record, done) => {
        received.push(record)
        const lines = readFileSync(
          join(readRunDir(runsDir), "trace.jsonl"),
          "utf8"
        )
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as unknown)
        onDisk.push({ done, lines })
      },
    })
    await result
    expect(onDisk.map((entry) => entry.done)).toEqual([1, 2, 3])
    for (const [index, entry] of onDisk.entries()) {
      // The settings line, then one line per question done so far.
      expect(entry.lines).toHaveLength(entry.done + 1)
      expect(plain(entry.lines.at(-1)).id).toBe(received[index]!.id)
      expect(entry.lines.at(-1)).toEqual(
        JSON.parse(JSON.stringify(received[index])) as unknown
      )
    }
  })

  test("AC16 — onProgress is also called for a question whose answer failed", async () => {
    const questions = [1, 2].map((n) => makeQuestion(n))
    const overrides = new Map<string, Step>([
      [
        "q-001",
        {
          notes: questions[0]!.sources,
          output: answered("Denver"),
          answerError: { message: "output truncated" },
        },
      ],
    ])
    const seen: Array<{ id: string; failure: string | null; done: number }> = []
    const { result } = runWith(questions, {
      overrides,
      onProgress: (record, done) => {
        seen.push({ id: record.id, failure: record.grade.failure, done })
      },
    })
    await result
    expect(seen).toEqual([
      { id: "q-001", failure: "answer_error", done: 1 },
      { id: "q-002", failure: null, done: 2 },
    ])
  })

  test("AC16 — onProgress is not called for the questions the cost cap skips, and total stays the number of questions given", async () => {
    const questions = [1, 2, 3, 4, 5].map((n) => makeQuestion(n))
    // Each question costs exactly 2 USD (one million sonnet input tokens).
    const overrides = new Map<string, Step>(
      questions.map((q) => [
        q.id,
        {
          notes: q.sources,
          output: answered("Denver"),
          answerCall: call("claude-sonnet-5-5", MILLION, 0, 100),
        },
      ])
    )
    const seen: Array<{ id: string; done: number; total: number }> = []
    const { result } = runWith(questions, {
      maxCostUsd: 3,
      overrides,
      onProgress: (record, done, total) => {
        seen.push({ id: record.id, done, total })
      },
    })
    const { skipped } = await result
    expect(skipped).toBe(3)
    expect(seen).toEqual([
      { id: "q-001", done: 1, total: 5 },
      { id: "q-002", done: 2, total: 5 },
    ])
  })

  test("AC16 — onProgress is never called when the cap is reached before the first question", async () => {
    const questions = [1, 2].map((n) => makeQuestion(n))
    let calls = 0
    const { result } = runWith(questions, {
      maxCostUsd: 0,
      onProgress: () => {
        calls += 1
      },
    })
    await result
    expect(calls).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Revision 5 — the retrieval brick measured alone
// ---------------------------------------------------------------------------

function retrievalMsOf(record: unknown): number {
  return plain(record).retrievalMs as number
}

describe("AC17 (revision 5) — retrieval time", () => {
  test("AC17 — retrievalMs is a finite number on every record", async () => {
    const { records } = await runWith([makeQuestion(1), makeQuestion(2)]).result
    for (const record of records) {
      expect(typeof retrievalMsOf(record)).toBe("number")
      expect(Number.isFinite(retrievalMsOf(record))).toBe(true)
      expect(retrievalMsOf(record)).toBeGreaterThanOrEqual(0)
    }
  })

  test("AC17 — retrievalMs is at least the time retrieve took, and less than latencyMs when the answer takes time", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        { ...goodStep(question), retrieveDelayMs: 40, answerDelayMs: 60 },
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    const record = records[0]!
    expect(retrievalMsOf(record)).toBeGreaterThanOrEqual(35)
    expect(retrievalMsOf(record)).toBeLessThan(1000)
    expect(record.latencyMs - retrievalMsOf(record)).toBeGreaterThanOrEqual(50)
  })

  test("AC17 — retrievalMs never exceeds latencyMs", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [question.id, { ...goodStep(question), retrieveDelayMs: 40 }],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(retrievalMsOf(records[0])).toBeGreaterThanOrEqual(35)
    expect(retrievalMsOf(records[0])).toBeLessThanOrEqual(records[0]!.latencyMs)
  })

  test("AC17 — retrievalMs is the wall-clock time of retrieve, not the sum of the stages it reports", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          loop: loopOf("sufficient", 1, 1),
          // 1000 ms of stages reported by a retrieve that took about 30 ms.
          stages: {
            searchMs: 100,
            judgeMs: 400,
            fallbackMs: 300,
            rewriteMs: 200,
          },
          retrieveDelayMs: 30,
        },
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    expect(retrievalMsOf(records[0])).toBeGreaterThanOrEqual(25)
    expect(retrievalMsOf(records[0])).toBeLessThan(900)
  })

  test("AC17 — retrievalMs stops at the end of retrieve, also when the answer returns no call", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          ...goodStep(question),
          loop: loopOf("abstain-nothing-relevant", 0, 0, "abstain"),
          answerCall: null,
          retrieveDelayMs: 30,
          answerDelayMs: 60,
        },
      ],
    ])
    const { records } = await runWith([question], {
      config: "B",
      overrides,
    }).result
    expect(retrievalMsOf(records[0])).toBeGreaterThanOrEqual(25)
    expect(
      records[0]!.latencyMs - retrievalMsOf(records[0])
    ).toBeGreaterThanOrEqual(50)
  })

  test("AC17 — a loop error has the time up to the error as retrievalMs", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: [],
          output: answered("unused"),
          retrieveDelayMs: 40,
          loopError: { message: "judge failed", calls: [], steps: [] },
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], {
      config: "C",
      overrides,
    }).result
    expect(plain(records[0]).error).toBe("judge failed")
    expect(retrievalMsOf(records[0])).toBeGreaterThanOrEqual(35)
    expect(retrievalMsOf(records[0])).toBeLessThan(1000)
    expect(retrievalMsOf(records[0])).toBeLessThanOrEqual(records[0]!.latencyMs)
  })

  test("AC17 — an answer error keeps the retrieval time apart from the time of the failed answer", async () => {
    const question = makeQuestion(1)
    const overrides = new Map([
      [
        question.id,
        {
          notes: question.sources,
          output: answered("unused"),
          answerError: { message: "answer failed" },
          retrieveDelayMs: 40,
          answerDelayMs: 60,
        } satisfies Step,
      ],
    ])
    const { records } = await runWith([question], { overrides }).result
    expect(plain(records[0]).error).toBe("answer failed")
    expect(retrievalMsOf(records[0])).toBeGreaterThanOrEqual(35)
    expect(
      records[0]!.latencyMs - retrievalMsOf(records[0])
    ).toBeGreaterThanOrEqual(50)
  })

  test("AC17 — the trace line of a record holds its retrievalMs", async () => {
    const question = makeQuestion(1)
    const { result, runsDir } = runWith([question])
    const { records } = await result
    const lines = readFileSync(join(readRunDir(runsDir), "trace.jsonl"), "utf8")
      .trim()
      .split("\n")
    const traced = JSON.parse(lines[1]!) as Record<string, unknown>
    expect(typeof traced.retrievalMs).toBe("number")
    expect(traced.retrievalMs).toBe(retrievalMsOf(records[0]))
  })
})

describe("AC18 (revision 5) — retrieval measures", () => {
  /** Retrieval cost 1 USD: the judge and the fallback at 0.50 each; the answer costs 0.60 more. */
  const judgeAndFallback = [
    roleCall("judge", HAIKU, 0, MILLION),
    roleCall("fallback", HAIKU, 0, MILLION),
  ]
  const answerCall = roleCall("answer", HAIKU, MILLION, MILLION)

  const costRecords = [
    // Retrieval cost 1.
    makeRecord(1, {
      category: "simple",
      calls: [...judgeAndFallback, answerCall],
    }),
    // 2: the rewriter, at 2 USD per million input tokens.
    makeRecord(2, {
      category: "temporal",
      calls: [roleCall("rewrite", "claude-sonnet-5-5", MILLION, 0), answerCall],
    }),
    // 0.5.
    makeRecord(3, {
      category: "temporal",
      calls: [roleCall("judge", HAIKU, 0, MILLION), answerCall],
    }),
    // 0.5.
    makeRecord(4, {
      category: "simple",
      calls: [roleCall("judge", HAIKU, 0, MILLION), answerCall],
    }),
  ]

  test("AC18 — meanRetrievalCostUsd is the mean per question of the cost of the calls that are not the answer, per category and overall", () => {
    const { overall, byCategory } = summarize(costRecords)
    expect(plain(overall).meanRetrievalCostUsd).toBeCloseTo(1, 9)
    expect(plain(byCategory.simple).meanRetrievalCostUsd).toBeCloseTo(0.75, 9)
    expect(plain(byCategory.temporal).meanRetrievalCostUsd).toBeCloseTo(1.25, 9)
  })

  test("AC18 — the answer calls are left out: a question whose only call is the answer costs 0 to retrieve, not null", () => {
    const records = [
      makeRecord(1, { calls: [...judgeAndFallback, answerCall] }),
      makeRecord(2, { calls: [answerCall] }),
    ]
    expect(plain(summarize(records).overall).meanRetrievalCostUsd).toBeCloseTo(
      0.5,
      9
    )
    expect(
      plain(summarize([makeRecord(1, { calls: [answerCall] })]).overall)
        .meanRetrievalCostUsd
    ).toBe(0)
  })

  test("AC18 — meanRetrievalCostUsd is null when a call has no role, as in the traces written before roles", () => {
    const old = makeRecord(5, {
      category: "temporal",
      calls: [call(HAIKU, MILLION, 0, 10), answerCall],
    })
    const { overall, byCategory } = summarize([...costRecords, old])
    expect(plain(overall).meanRetrievalCostUsd).toBeNull()
    expect(plain(byCategory.temporal).meanRetrievalCostUsd).toBeNull()
    // The category whose records all have roles keeps its mean.
    expect(plain(byCategory.simple).meanRetrievalCostUsd).toBeCloseTo(0.75, 9)
  })

  test("AC18 — the default hand-built record, whose call has no role, gives a null retrieval cost", () => {
    const { overall } = summarize([makeRecord(1), makeRecord(2)])
    expect(plain(overall).meanRetrievalCostUsd).toBeNull()
  })

  /** Retrieval times 100, 200, ..., 2100 ms in a scrambled order; latencies are 5 s more. */
  const retrievalTimes = Array.from({ length: 21 }, (_, i) => (i + 1) * 100)
  const scrambled = [
    ...retrievalTimes.filter((_, i) => i % 2 === 1).reverse(),
    ...retrievalTimes.filter((_, i) => i % 2 === 0),
  ]

  test("AC18 — retrievalP50Ms and retrievalP95Ms are nearest-rank percentiles of retrievalMs, not of latencyMs", () => {
    const records = scrambled.map((retrievalMs, i) =>
      makeRecord(i + 1, { retrievalMs, latencyMs: retrievalMs + 5000 })
    )
    const { overall, byCategory } = summarize(records)
    expect(plain(overall).retrievalP50Ms).toBe(1100)
    expect(plain(overall).retrievalP95Ms).toBe(2000)
    expect(plain(byCategory.simple).retrievalP50Ms).toBe(1100)
    expect(plain(byCategory.simple).retrievalP95Ms).toBe(2000)
  })

  test("AC18 — the retrieval percentiles are computed per category", () => {
    const records = [
      makeRecord(1, { category: "simple", retrievalMs: 100, latencyMs: 900 }),
      makeRecord(2, {
        category: "temporal",
        retrievalMs: 9000,
        latencyMs: 9500,
      }),
    ]
    const { overall, byCategory } = summarize(records)
    expect(plain(byCategory.simple).retrievalP50Ms).toBe(100)
    expect(plain(byCategory.simple).retrievalP95Ms).toBe(100)
    expect(plain(byCategory.temporal).retrievalP50Ms).toBe(9000)
    expect(plain(byCategory.temporal).retrievalP95Ms).toBe(9000)
    expect(plain(overall).retrievalP50Ms).toBe(100)
    expect(plain(overall).retrievalP95Ms).toBe(9000)
  })

  test("AC18 — a record without retrievalMs but with stages counts latencyMs minus answerMs", () => {
    const old = makeRecord(1, {
      latencyMs: 1000,
      stages: { ...zeroStages(), searchMs: 50, judgeMs: 350, answerMs: 400 },
    })
    const alone = plain(summarize([old]).overall)
    expect(alone.retrievalP50Ms).toBe(600)
    expect(alone.retrievalP95Ms).toBe(600)

    const records = [
      makeRecord(2, { retrievalMs: 200, latencyMs: 700 }),
      makeRecord(3, {
        latencyMs: 1000,
        stages: { ...zeroStages(), answerMs: 400 },
      }),
    ]
    // Sorted 200, 600: rank 1 for the median, rank 2 for p95.
    const { overall } = summarize(records)
    expect(plain(overall).retrievalP50Ms).toBe(200)
    expect(plain(overall).retrievalP95Ms).toBe(600)
  })

  test("AC18 — a record with neither retrievalMs nor stages is left out of the percentiles", () => {
    const neither = makeRecord(1, { latencyMs: 9999, stages: undefined })
    const withTime = makeRecord(2, { retrievalMs: 200, latencyMs: 700 })
    const { overall } = summarize([neither, withTime])
    expect(plain(overall).retrievalP50Ms).toBe(200)
    expect(plain(overall).retrievalP95Ms).toBe(200)
  })

  test("AC18 — the retrieval percentiles and cost are null for records from before retrievalMs, stages and roles", () => {
    const records = [
      makeRecord(1, { latencyMs: 800, stages: undefined }),
      makeRecord(2, {
        category: "temporal",
        latencyMs: 1200,
        stages: undefined,
      }),
    ]
    const { overall, byCategory } = summarize(records)
    for (const metrics of [overall, byCategory.simple, byCategory.temporal]) {
      expect(plain(metrics).retrievalP50Ms).toBeNull()
      expect(plain(metrics).retrievalP95Ms).toBeNull()
      expect(plain(metrics).meanRetrievalCostUsd).toBeNull()
    }
  })

  test("AC18 — the retrieval percentiles are null when there is no record", () => {
    const { overall } = summarize([])
    expect(plain(overall).retrievalP50Ms).toBeNull()
    expect(plain(overall).retrievalP95Ms).toBeNull()
  })

  describe("in a run", () => {
    const questions = [makeQuestion(1), makeQuestion(2)]
    const answerStep = roleCall("answer", HAIKU, MILLION, MILLION)

    /** Retrieval cost 0.5 for q-001 and 2.5 for q-002: a mean of 1.5. */
    function roledOverrides(): Map<string, Step> {
      const [first, second] = questions as [Question, Question]
      return new Map<string, Step>([
        [
          first.id,
          {
            ...goodStep(first),
            retrievalCalls: [roleCall("judge", HAIKU, 0, MILLION)],
            answerCall: answerStep,
            retrieveDelayMs: 30,
            answerDelayMs: 40,
          },
        ],
        [
          second.id,
          {
            ...goodStep(second),
            retrievalCalls: [
              roleCall("judge", HAIKU, 0, MILLION),
              roleCall("rewrite", "claude-sonnet-5-5", MILLION, 0),
            ],
            answerCall: answerStep,
            retrieveDelayMs: 30,
            answerDelayMs: 40,
          },
        ],
      ])
    }

    test("AC18 — runEval summarizes the retrieval cost and times of its records, and writes them in summary.json", async () => {
      const { result, runsDir } = runWith(questions, {
        overrides: roledOverrides(),
      })
      const { summary } = await result
      const overall = plain(summary.overall)
      expect(overall.meanRetrievalCostUsd).toBeCloseTo(1.5, 9)
      expect(overall.retrievalP50Ms as number).toBeGreaterThanOrEqual(25)
      expect(overall.retrievalP95Ms as number).toBeGreaterThanOrEqual(25)
      // The answerer's 40 ms are in the end-to-end latency only.
      expect(summary.overall.latencyP50Ms as number).toBeGreaterThanOrEqual(
        (overall.retrievalP50Ms as number) + 35
      )
      const written = JSON.parse(
        readFileSync(join(readRunDir(runsDir), "summary.json"), "utf8")
      ) as { overall: Record<string, number> }
      expect(written.overall.meanRetrievalCostUsd).toBeCloseTo(1.5, 9)
      expect(written.overall.retrievalP50Ms).toBe(
        overall.retrievalP50Ms as number
      )
      expect(written.overall.retrievalP95Ms).toBe(
        overall.retrievalP95Ms as number
      )
    })

    interface ReportTable {
      header: string[]
      rows: Map<string, string[]>
    }

    function reportTables(report: string): ReportTable[] {
      const tables: ReportTable[] = []
      let current: string[][] = []
      const flush = () => {
        if (current.length > 0) {
          const [header, , ...body] = current as [
            string[],
            string[],
            ...string[][],
          ]
          tables.push({
            header,
            rows: new Map(body.map((cells) => [cells[0]!, cells])),
          })
        }
        current = []
      }
      for (const line of report.split("\n")) {
        if (!line.startsWith("|")) {
          flush()
          continue
        }
        current.push(
          line
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim())
        )
      }
      flush()
      return tables
    }

    function reportCell(report: string, column: string, label: string): string {
      const table = reportTables(report).find((t) => t.header.includes(column))
      expect({ column, found: table !== undefined }).toEqual({
        column,
        found: true,
      })
      const row = table!.rows.get(label)
      expect(row).toBeDefined()
      return row![table!.header.indexOf(column)]!
    }

    async function reportOf(overrides?: Map<string, Step>): Promise<string> {
      const { result, runsDir } = runWith(questions, { overrides })
      await result
      return readFileSync(join(readRunDir(runsDir), "report.md"), "utf8")
    }

    test("AC18 — report.md shows the retrieval cost and the retrieval p50 and p95 next to the end-to-end ones", async () => {
      const report = await reportOf(roledOverrides())
      for (const label of ["simple", "overall"]) {
        expect(
          reportCell(report, "retrieval cost/question (USD)", label)
        ).toMatch(/^\d/)
        expect(reportCell(report, "retrieval p50 (ms)", label)).toMatch(/^\d/)
        expect(reportCell(report, "retrieval p95 (ms)", label)).toMatch(/^\d/)
      }
      expect(
        Number(reportCell(report, "retrieval cost/question (USD)", "overall"))
      ).toBeCloseTo(1.5, 5)
      expect(
        Number(reportCell(report, "retrieval p50 (ms)", "overall"))
      ).toBeLessThan(Number(reportCell(report, "p50 (ms)", "overall")))
      // The end-to-end columns are still there, for the whole question.
      expect(reportCell(report, "cost/question (USD)", "overall")).toMatch(
        /^\d/
      )
      expect(reportCell(report, "p95 (ms)", "overall")).toMatch(/^\d/)
    })

    test("AC18 — report.md shows - for a retrieval cost that the missing roles make unknown", async () => {
      // goodStep's answer call has no role.
      const report = await reportOf()
      expect(
        reportCell(report, "retrieval cost/question (USD)", "overall")
      ).toBe("-")
      expect(reportCell(report, "retrieval p50 (ms)", "overall")).toMatch(/^\d/)
    })
  })
})
