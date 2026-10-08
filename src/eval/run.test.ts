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
    retrieve: (query: string, k: number) => {
      retrieved.push({ query, k })
      const step = steps.get(query)
      if (!step) throw new Error(`unscripted question: ${query}`)
      const context = step.notes.map(chunk)
      contexts.set(query, context)
      return Promise.resolve({
        context,
        calls: step.retrievalCalls ?? [],
        ...(step.loop ? { loop: step.loop } : {}),
      })
    },
    answer: (question: string, context: ContextChunk[]) => {
      answerCalls.push({ question, context })
      const step = steps.get(question)
      if (!step) throw new Error(`unscripted question: ${question}`)
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
    expect(plain(summary.overall.failures)).toEqual({
      retrieval_miss: 2,
      false_abstention: 1,
      wrong_version: 0,
      missed_contradiction: 0,
      unsupported_claim: 0,
      wrong_answer: 1,
      answer_error: 0,
    })
    expect(plain(summary.byCategory.simple!.failures)).toEqual({
      retrieval_miss: 2,
      false_abstention: 0,
      wrong_version: 0,
      missed_contradiction: 0,
      unsupported_claim: 0,
      wrong_answer: 1,
      answer_error: 0,
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
  type: "answer" | "abstain" = "answer"
): LoopData {
  return {
    outcome: { type, rule },
    hops,
    rewrites,
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
  } as unknown as RunRecord
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
