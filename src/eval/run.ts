import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  CATEGORIES,
  type Category,
  type Question,
  type Split,
} from "../../evals/schema.ts"
import type { Answer, ContextChunk } from "../answer/answerer.ts"
import type { ModelCall } from "../core/types.ts"
import { RULES } from "../loop/policy.ts"
import {
  contextMeasuresOf,
  FAILURE_INFO,
  FAILURES,
  grade,
  type ContextMeasures,
  type Failure,
  type Grade,
  type LoopNotes,
} from "./grade.ts"
import { callCostUsd, PRICES } from "./prices.ts"

/** What the retrieval loop of config B reports next to the context. */
export interface LoopTrace {
  /** The action of the last step. */
  outcome: { type: string; rule: string }
  hops: number
  rewrites: number
  steps: unknown[]
  /** Note path -> scores of the judge's questions. */
  judged: Record<string, unknown>
  /** Paths of the notes the loop kept. */
  kept: string[]
  /** Paths of the notes one link away from a judged note, never judged. */
  frontier: string[]
}

/** The note paths of a loop, as the grader takes them. */
export function loopNotesOf(
  loop: LoopTrace | undefined
): LoopNotes | undefined {
  return (
    loop && {
      judged: Object.keys(loop.judged),
      kept: loop.kept,
      frontier: loop.frontier,
    }
  )
}

export interface RunRecord extends ContextMeasures {
  id: string
  split: Split
  category: Category
  /** Note paths of the retrieved context, in rank order. */
  contextNotes: string[]
  /** `null` when the loop or the answerer threw. */
  output: Answer | null
  /** The message of the error the loop or the answerer threw. */
  error?: string
  /** The retrieval loop of config B; absent for config A. */
  loop?: LoopTrace
  grade: Grade
  /** The retrieval calls, then the answer call when there is one. */
  calls: ModelCall[]
  latencyMs: number
  costUsd: number
}

export interface Metrics {
  n: number
  accuracy: number | null
  meanRecall: number | null
  /** Over the questions with sources. */
  contextCompleteRate: number | null
  /** Over the records with a non-empty context. */
  meanPrecision: number | null
  meanNotesInContext: number | null
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  meanCostUsd: number | null
  /** Input tokens of the answer call, i.e. the context size. */
  meanInputTokens: number | null
  failures: Record<Failure, number>
  failuresByFamily: Record<"retrieval" | "answer", number>
  /** Abstentions made by the loop (no answerer call) and by the answerer. */
  abstentions: { loop: number; answerer: number }
  /** Means over the records with a loop; `null` when none has one. */
  meanHops: number | null
  meanRewrites: number | null
  meanJudgeCalls: number | null
  /** Count of each final policy rule, only the rules that occurred. */
  finalRules: Record<string, number>
}

export interface Summary {
  overall: Metrics
  byCategory: Partial<Record<Category, Metrics>>
}

export interface EvalOptions {
  questions: Question[]
  retrieve: (
    query: string,
    k: number
  ) => Promise<{
    context: ContextChunk[]
    calls: ModelCall[]
    loop?: LoopTrace
  }>
  /** `call` is `null` when no model was called. */
  answer: (
    query: string,
    context: ContextChunk[],
    loop?: LoopTrace
  ) => Promise<{ output: Answer; call: ModelCall | null }>
  k: number
  /** Chunks retrieved per search. */
  candidates: number
  /** The run stops before a question once its cumulative cost has reached this. */
  maxCostUsd: number
  runsDir: string
  config: string
  split: Split
  models: Record<string, string>
  /** Config B: the policy, the rewriter and the number of candidates. */
  loop?: Record<string, unknown>
  thresholds: Record<string, number>
  gitCommit: string
  index: IndexInfo
}

/** What the run was made on, from the index metadata. */
export interface IndexInfo {
  vault: string
  notes: number
  chunks: number
  links: number
}

/** The first line of the trace. */
export interface RunSettings {
  config: string
  split: Split
  k: number
  candidates: number
  models: Record<string, string>
  loop?: Record<string, unknown>
  prices: typeof PRICES
  thresholds: Record<string, number>
  gitCommit: string
  index: IndexInfo
}

export interface EvalResult {
  records: RunRecord[]
  summary: Summary
  /** Questions not processed because the cost cap was reached. */
  skipped: number
  runDir: string
}

/**
 * Runs the questions in order through retrieval and the answerer, grading each
 * answer. Every record is appended to the trace as soon as it is done, so that
 * a failure midway keeps what has been paid for.
 */
export async function runEval(options: EvalOptions): Promise<EvalResult> {
  const { questions, config, split } = options
  const runDir = join(options.runsDir, `${timestamp()}-${config}-${split}`)
  await mkdir(runDir, { recursive: true })
  const tracePath = join(runDir, "trace.jsonl")
  await writeFile(tracePath, jsonLine(settingsOf(options)))

  const records: RunRecord[] = []
  let totalCostUsd = 0
  for (const question of questions) {
    if (totalCostUsd >= options.maxCostUsd) break
    const record = await evaluate(question, options)
    records.push(record)
    totalCostUsd += record.costUsd
    await appendFile(tracePath, jsonLine(record))
  }

  const summary = summarize(records)
  await writeFile(
    join(runDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  )
  const skipped = questions.length - records.length
  await writeFile(
    join(runDir, "report.md"),
    renderReport(settingsOf(options), records, summary, {
      maxCostUsd: options.maxCostUsd,
      skipped,
    })
  )
  return { records, summary, skipped, runDir }
}

async function evaluate(
  question: Question,
  { retrieve, answer, k }: EvalOptions
): Promise<RunRecord> {
  const startedAt = performance.now()
  let retrieved
  try {
    retrieved = await retrieve(question.question, k)
  } catch (error) {
    if (!isLoopError(error)) throw error
    return {
      ...recordOf(question, [], error.calls, performance.now() - startedAt),
      output: null,
      error: error.message,
      loop: {
        outcome: { type: "error", rule: "loop_error" },
        hops: 0,
        rewrites: 0,
        steps: error.steps,
        judged: {},
        kept: [],
        frontier: [],
      },
      grade: { correct: false, failure: "loop_error" },
    }
  }
  const { context, calls: retrievalCalls, loop } = retrieved
  const attempt = await attemptAnswer(answer, question.question, context, loop)
  const latencyMs = performance.now() - startedAt

  const contextNotes = context.map((chunk) => chunk.notePath)
  const calls = attempt.call
    ? [...retrievalCalls, attempt.call]
    : retrievalCalls
  const record = {
    ...recordOf(question, contextNotes, calls, latencyMs),
    ...(loop ? { loop } : {}),
  }
  if (attempt.output === null) {
    return {
      ...record,
      output: null,
      error: attempt.error,
      grade: { correct: false, failure: "answer_error" },
    }
  }
  return {
    ...record,
    output: attempt.output,
    grade: grade(question, attempt.output, contextNotes, loopNotesOf(loop)),
  }
}

/** What a record holds whatever the outcome of the question. */
function recordOf(
  question: Question,
  contextNotes: string[],
  calls: ModelCall[],
  latencyMs: number
) {
  return {
    id: question.id,
    split: question.split,
    category: question.category,
    contextNotes,
    ...contextMeasuresOf(question, contextNotes),
    calls,
    latencyMs,
    costUsd: sum(calls.map(callCostUsd)),
  }
}

/** What a `LoopError` carries: the calls it paid for and its steps. */
function isLoopError(
  error: unknown
): error is Error & { calls: ModelCall[]; steps: unknown[] } {
  return (
    error instanceof Error &&
    "calls" in error &&
    Array.isArray(error.calls) &&
    "steps" in error &&
    Array.isArray(error.steps)
  )
}

type Attempt =
  | { output: Answer; call: ModelCall | null }
  | { output: null; error: string; call?: ModelCall }

/** An error thrown after the API answered carries the `call` that was billed. */
async function attemptAnswer(
  answer: EvalOptions["answer"],
  question: string,
  context: ContextChunk[],
  loop: LoopTrace | undefined
): Promise<Attempt> {
  try {
    return await answer(question, context, loop)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const { call } = error as { call?: ModelCall }
    return { output: null, error: message, call }
  }
}

export function summarize(records: RunRecord[]): Summary {
  const byCategory: Summary["byCategory"] = {}
  for (const category of CATEGORIES) {
    const inCategory = records.filter((record) => record.category === category)
    if (inCategory.length > 0) byCategory[category] = metricsOf(inCategory)
  }
  return { overall: metricsOf(records), byCategory }
}

function metricsOf(records: RunRecord[]): Metrics {
  const failures = Object.fromEntries(
    FAILURES.map((failure) => [
      failure,
      records.filter((record) => record.grade.failure === failure).length,
    ])
  ) as Record<Failure, number>
  const latencies = records.map((record) => record.latencyMs)
  return {
    n: records.length,
    accuracy: mean(records.map((record) => (record.grade.correct ? 1 : 0))),
    meanRecall: mean(nonNull(records.map((record) => record.recall))),
    contextCompleteRate: mean(
      nonNull(records.map((record) => record.contextComplete)).map(Number)
    ),
    meanPrecision: mean(nonNull(records.map((record) => record.precision))),
    meanNotesInContext: mean(records.map((record) => record.notesInContext)),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    meanCostUsd: mean(records.map((record) => record.costUsd)),
    meanInputTokens: mean(
      records.flatMap((record) =>
        hasAnswerCall(record) ? [record.calls.at(-1)!.inputTokens] : []
      )
    ),
    failures,
    failuresByFamily: {
      retrieval: familyCount(failures, "retrieval"),
      answer: familyCount(failures, "answer"),
    },
    abstentions: {
      loop: records.filter(abstainedByLoop).length,
      answerer: records.filter(
        (record) =>
          record.output?.status === "abstained" && !abstainedByLoop(record)
      ).length,
    },
    ...loopMetricsOf(records),
  }
}

function familyCount(
  failures: Record<Failure, number>,
  family: "retrieval" | "answer"
): number {
  return sum(
    FAILURES.filter((failure) => FAILURE_INFO[failure].family === family).map(
      (failure) => failures[failure]
    )
  )
}

function abstainedByLoop(record: RunRecord): boolean {
  return (
    record.output?.status === "abstained" &&
    record.loop?.outcome.type === "abstain"
  )
}

/** An abstaining loop gives its output without calling the answerer. */
function hasAnswerCall(record: RunRecord): boolean {
  return record.output !== null && record.loop?.outcome.type !== "abstain"
}

function loopMetricsOf(
  records: RunRecord[]
): Pick<
  Metrics,
  "meanHops" | "meanRewrites" | "meanJudgeCalls" | "finalRules"
> {
  const looped = records.flatMap((record) =>
    record.loop ? [{ loop: record.loop, calls: record.calls }] : []
  )
  const finalRules: Record<string, number> = {}
  for (const { loop } of looped) {
    finalRules[loop.outcome.rule] = (finalRules[loop.outcome.rule] ?? 0) + 1
  }
  return {
    meanHops: mean(looped.map(({ loop }) => loop.hops)),
    meanRewrites: mean(looped.map(({ loop }) => loop.rewrites)),
    meanJudgeCalls: mean(
      looped.map(
        ({ calls }) => calls.filter(({ role }) => role === "judge").length
      )
    ),
    finalRules,
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function nonNull<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null)
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length
}

/** Nearest-rank percentile, `p` in (0, 1]. */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(p * sorted.length) - 1]!
}

/** The run settings, first line of the trace. */
function settingsOf(options: EvalOptions): RunSettings {
  return {
    config: options.config,
    split: options.split,
    k: options.k,
    candidates: options.candidates,
    models: options.models,
    ...(options.loop ? { loop: options.loop } : {}),
    prices: PRICES,
    thresholds: options.thresholds,
    gitCommit: options.gitCommit,
    index: options.index,
  }
}

export function jsonLine(value: unknown): string {
  return JSON.stringify(value) + "\n"
}

/** ISO 8601 UTC without the characters that are awkward in a folder name. */
function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

type Column = [string, (metrics: Metrics) => string]

const COLUMNS: Column[] = [
  ["n", (m) => String(m.n)],
  ["accuracy", (m) => percent(m.accuracy)],
  ["recall", (m) => percent(m.meanRecall)],
  ["context complete", (m) => percent(m.contextCompleteRate)],
  ["precision", (m) => percent(m.meanPrecision)],
  ["notes in context", (m) => fixed(m.meanNotesInContext, 2)],
  ["p50 (ms)", (m) => fixed(m.latencyP50Ms, 0)],
  ["p95 (ms)", (m) => fixed(m.latencyP95Ms, 0)],
  ["cost/question (USD)", (m) => fixed(m.meanCostUsd, 5)],
  ["input tokens", (m) => fixed(m.meanInputTokens, 0)],
  ...FAILURES.map((failure): Column => [
    failure,
    (m) => String(m.failures[failure]),
  ]),
]

/** Added for a loop run: the loop means, then a count per final rule that occurred. */
function loopColumns(summary: Summary): Column[] {
  if (summary.overall.meanHops === null) return []
  return [
    ["hops", (m) => fixed(m.meanHops, 2)],
    ["rewrites", (m) => fixed(m.meanRewrites, 2)],
    ["judge calls", (m) => fixed(m.meanJudgeCalls, 2)],
    ...Object.keys(summary.overall.finalRules)
      .sort((a, b) => ruleRank(a) - ruleRank(b))
      .map((rule): Column => [rule, (m) => String(m.finalRules[rule] ?? 0)]),
  ]
}

/** The position of a rule in the policy; the rules it does not list come last. */
function ruleRank(rule: string): number {
  const rank = (RULES as readonly string[]).indexOf(rule)
  return rank === -1 ? RULES.length : rank
}

function percent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`
}

function fixed(value: number | null, digits: number): string {
  return value === null ? "-" : value.toFixed(digits)
}

/**
 * `costCap` is given when the run was stopped by its cost cap, which only the
 * run itself knows.
 */
export function renderReport(
  settings: Pick<RunSettings, "config" | "split" | "k" | "gitCommit"> &
    Partial<Pick<RunSettings, "candidates">>,
  records: RunRecord[],
  summary: Summary,
  costCap?: { maxCostUsd: number; skipped: number }
): string {
  const columns = [...COLUMNS, ...loopColumns(summary)]
  const row = (label: string, metrics: Metrics) =>
    `| ${[label, ...columns.map(([, format]) => format(metrics))].join(" | ")} |`
  const lines = [
    `# Eval run: config ${settings.config}, ${settings.split} split`,
    "",
    [
      `k = ${settings.k}`,
      ...(settings.candidates === undefined
        ? []
        : [`candidates = ${settings.candidates}`]),
      `commit ${settings.gitCommit}`,
    ].join(", "),
  ]
  if (costCap && costCap.skipped > 0) {
    lines.push(
      "",
      `Stopped by the cost cap (${costCap.maxCostUsd} USD): ${costCap.skipped} question(s) skipped.`
    )
  }
  lines.push(
    "",
    "## Metrics",
    "",
    `| category | ${columns.map(([name]) => name).join(" | ")} |`,
    `| ${["---", ...columns.map(() => "---:")].join(" | ")} |`
  )
  for (const category of CATEGORIES) {
    const metrics = summary.byCategory[category]
    if (metrics) lines.push(row(category, metrics))
  }
  lines.push(row("overall", summary.overall), "", "## Failures")
  if (summary.overall.accuracy === 1) lines.push("", "None.")
  for (const failure of FAILURES) {
    const ids = records
      .filter((record) => record.grade.failure === failure)
      .map((record) => record.id)
    if (ids.length > 0) lines.push("", `### ${failure}`, "", ids.join(", "))
  }
  return lines.join("\n") + "\n"
}
