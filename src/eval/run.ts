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
import { FAILURES, grade, type Failure, type Grade } from "./grade.ts"
import { callCostUsd, PRICES } from "./prices.ts"

export interface RunRecord {
  id: string
  split: Split
  category: Category
  /** Note paths of the retrieved context, in rank order. */
  contextNotes: string[]
  /** Share of the question's sources among the context notes; `null` when it has none. */
  recall: number | null
  /** `null` when the answerer threw. */
  output: Answer | null
  /** The message of the error the answerer threw. */
  error?: string
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
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  meanCostUsd: number | null
  /** Input tokens of the answer call, i.e. the context size. */
  meanInputTokens: number | null
  failures: Record<Failure, number>
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
  ) => Promise<{ context: ContextChunk[]; calls: ModelCall[] }>
  answer: (
    query: string,
    context: ContextChunk[]
  ) => Promise<{ output: Answer; call: ModelCall }>
  k: number
  /** The run stops before a question once its cumulative cost has reached this. */
  maxCostUsd: number
  runsDir: string
  config: string
  split: Split
  models: Record<string, string>
  thresholds: Record<string, number>
  gitCommit: string
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
    renderReport(options, records, summary, skipped)
  )
  return { records, summary, skipped, runDir }
}

async function evaluate(
  question: Question,
  { retrieve, answer, k }: EvalOptions
): Promise<RunRecord> {
  const startedAt = performance.now()
  const { context, calls: retrievalCalls } = await retrieve(
    question.question,
    k
  )
  const attempt = await attemptAnswer(answer, question.question, context)
  const latencyMs = performance.now() - startedAt

  const contextNotes = context.map((chunk) => chunk.notePath)
  const calls =
    attempt.call === undefined
      ? retrievalCalls
      : [...retrievalCalls, attempt.call]
  const record = {
    id: question.id,
    split: question.split,
    category: question.category,
    contextNotes,
    recall: recallOf(question.sources, contextNotes),
    calls,
    latencyMs,
    costUsd: sum(calls.map(callCostUsd)),
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
    grade: grade(question, attempt.output, contextNotes),
  }
}

type Attempt =
  | { output: Answer; call: ModelCall }
  | { output: null; error: string; call?: ModelCall }

/** An error thrown after the API answered carries the `call` that was billed. */
async function attemptAnswer(
  answer: EvalOptions["answer"],
  question: string,
  context: ContextChunk[]
): Promise<Attempt> {
  try {
    return await answer(question, context)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const { call } = error as { call?: ModelCall }
    return { output: null, error: message, call }
  }
}

function recallOf(sources: string[], contextNotes: string[]): number | null {
  if (sources.length === 0) return null
  const found = sources.filter((source) => contextNotes.includes(source))
  return found.length / sources.length
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
    meanRecall: mean(
      records.flatMap((record) =>
        record.recall === null ? [] : [record.recall]
      )
    ),
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    meanCostUsd: mean(records.map((record) => record.costUsd)),
    meanInputTokens: mean(
      records.flatMap((record) =>
        record.output === null ? [] : [record.calls.at(-1)!.inputTokens]
      )
    ),
    failures,
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
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
function settingsOf(options: EvalOptions) {
  return {
    config: options.config,
    split: options.split,
    k: options.k,
    models: options.models,
    prices: PRICES,
    thresholds: options.thresholds,
    gitCommit: options.gitCommit,
  }
}

function jsonLine(value: unknown): string {
  return JSON.stringify(value) + "\n"
}

/** ISO 8601 UTC without the characters that are awkward in a folder name. */
function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

const COLUMNS: Array<[string, (metrics: Metrics) => string]> = [
  ["n", (m) => String(m.n)],
  ["accuracy", (m) => percent(m.accuracy)],
  ["recall", (m) => percent(m.meanRecall)],
  ["p50 (ms)", (m) => fixed(m.latencyP50Ms, 0)],
  ["p95 (ms)", (m) => fixed(m.latencyP95Ms, 0)],
  ["cost/question (USD)", (m) => fixed(m.meanCostUsd, 5)],
  ["input tokens", (m) => fixed(m.meanInputTokens, 0)],
  ...FAILURES.map((failure): [string, (metrics: Metrics) => string] => [
    failure,
    (m) => String(m.failures[failure]),
  ]),
]

function percent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`
}

function fixed(value: number | null, digits: number): string {
  return value === null ? "-" : value.toFixed(digits)
}

function renderReport(
  options: EvalOptions,
  records: RunRecord[],
  summary: Summary,
  skipped: number
): string {
  const row = (label: string, metrics: Metrics) =>
    `| ${[label, ...COLUMNS.map(([, format]) => format(metrics))].join(" | ")} |`
  const lines = [
    `# Eval run: config ${options.config}, ${options.split} split`,
    "",
    `k = ${options.k}, commit ${options.gitCommit}`,
  ]
  if (skipped > 0) {
    lines.push(
      "",
      `Stopped by the cost cap (${options.maxCostUsd} USD): ${skipped} question(s) skipped.`
    )
  }
  lines.push(
    "",
    "## Metrics",
    "",
    `| category | ${COLUMNS.map(([name]) => name).join(" | ")} |`,
    `| ${["---", ...COLUMNS.map(() => "---:")].join(" | ")} |`
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
