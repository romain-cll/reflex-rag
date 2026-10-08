import { existsSync } from "node:fs"
import {
  QuestionSetSchema,
  SPLITS,
  type Question,
  type Split,
} from "../../evals/schema.ts"
import { answerQuestion, type ContextChunk } from "../answer/answerer.ts"
import type { Embedder } from "../core/embedder.ts"
import type { LLM, LLMRequest } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { openIndex, type Index } from "../index/read.ts"
import { callCostUsd } from "../eval/prices.ts"
import { runEval } from "../eval/run.ts"
import { AnthropicLLM } from "../models/anthropic-llm.ts"
import { MistralEmbedder } from "../models/mistral-embedder.ts"
import { HybridRetriever } from "../retrieval/hybrid.ts"

export type EvalConfig = "A" | "B" | "C"

/** The options of `reflex eval`, as typed on the command line. */
export interface EvalCliOptions {
  split?: string
  limit?: string
  k?: string
  maxCost?: string
  dryRun?: boolean
}

interface EvalSettings {
  split: Split
  limit: number | null
  k: number
  maxCostUsd: number
  dryRun: boolean
}

const QUESTIONS_PATH = "evals/dev/questions.json"
const INDEX_PATH = ".reflex/index.db"
const RUNS_DIR = "runs"
const ANSWERER_MODEL = "claude-haiku-5-5"
/** Rough size of a token, for the dry-run estimate. */
const CHARS_PER_TOKEN = 4

export async function evalCommand(
  config: EvalConfig,
  options: EvalCliOptions
): Promise<number> {
  try {
    if (config !== "A") {
      throw new Error(`config ${config} is not implemented`)
    }
    return await runConfigA(parseSettings(options))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`reflex eval: ${message.split("\n")[0]}`)
    return 1
  }
}

function parseSettings(options: EvalCliOptions): EvalSettings {
  const split = options.split ?? "test"
  if (!isSplit(split)) {
    throw new Error(`invalid split "${split}", expected ${SPLITS.join(" or ")}`)
  }
  return {
    split,
    limit:
      options.limit === undefined
        ? null
        : parseNumber("limit", options.limit, true),
    k: options.k === undefined ? 8 : parseNumber("k", options.k, true),
    maxCostUsd:
      options.maxCost === undefined
        ? 1
        : parseNumber("max-cost", options.maxCost, false),
    dryRun: options.dryRun ?? false,
  }
}

function isSplit(value: string): value is Split {
  return (SPLITS as readonly string[]).includes(value)
}

function parseNumber(name: string, text: string, integer: boolean): number {
  const value = text.trim() === "" ? NaN : Number(text)
  const valid = integer ? Number.isInteger(value) && value > 0 : value >= 0
  if (!valid) {
    const expected = integer
      ? "a positive integer"
      : "a number of USD, 0 or more"
    throw new Error(`--${name} must be ${expected}, got "${text}"`)
  }
  return value
}

async function runConfigA(settings: EvalSettings): Promise<number> {
  for (const path of [QUESTIONS_PATH, INDEX_PATH]) {
    if (!existsSync(path)) throw new Error(`${path} not found`)
  }
  const mistralKey = requireKey("MISTRAL_API_KEY")
  if (!settings.dryRun) requireKey("ANTHROPIC_API_KEY")
  const questions = await loadQuestions(settings)

  const index = openIndex(INDEX_PATH)
  try {
    const embedder = new MistralEmbedder({ apiKey: mistralKey })
    const retrieve = retrieverOf(index, embedder)
    if (settings.dryRun) return await dryRun(questions, retrieve, settings)

    const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
    const { vaultPath, notes, chunks, links } = index.meta()
    const result = await runEval({
      questions,
      retrieve,
      answer: (query, context) => answerQuestion(query, context, llm),
      k: settings.k,
      maxCostUsd: settings.maxCostUsd,
      runsDir: RUNS_DIR,
      config: "A",
      split: settings.split,
      models: { answerer: llm.model, embedder: embedder.model },
      thresholds: {},
      gitCommit: gitCommit(),
      index: { vault: vaultPath, notes, chunks, links },
    })
    const { overall } = result.summary
    console.log(
      [
        `Run written to ${result.runDir}`,
        `  questions:  ${overall.n}${result.skipped > 0 ? ` (${result.skipped} skipped by the cost cap)` : ""}`,
        `  accuracy:   ${overall.accuracy === null ? "-" : (overall.accuracy * 100).toFixed(1) + "%"}`,
      ].join("\n")
    )
    return 0
  } finally {
    index.close()
  }
}

function requireKey(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is missing or empty`)
  return value
}

async function loadQuestions(settings: EvalSettings): Promise<Question[]> {
  let data: unknown
  try {
    data = JSON.parse(await Bun.file(QUESTIONS_PATH).text())
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${QUESTIONS_PATH} is not valid JSON: ${reason}`, {
      cause: error,
    })
  }
  const parsed = QuestionSetSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    throw new Error(
      `${QUESTIONS_PATH} is invalid: ${issue.path.join(".")}: ${issue.message}`
    )
  }
  const inSplit = parsed.data.questions.filter(
    (question) => question.split === settings.split
  )
  return settings.limit === null ? inSplit : inSplit.slice(0, settings.limit)
}

/** Retrieval for config A: hybrid search, each chunk with the date of its note. */
function retrieverOf(index: Index, embedder: Embedder) {
  const retriever = new HybridRetriever(index, embedder)
  return async (query: string, k: number) => {
    const { chunks, calls } = await retriever.retrieve(query, k)
    const context: ContextChunk[] = chunks.map(({ chunk }) => ({
      notePath: chunk.notePath,
      noteDate: index.getNote(chunk.notePath)?.date ?? null,
      heading: chunk.heading,
      text: chunk.text,
    }))
    return { context, calls }
  }
}

function gitCommit(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
  return result.exitCode === 0 ? result.stdout.toString().trim() : "unknown"
}

/**
 * Retrieves for every question (Mistral embeddings only) and prints the size
 * of the run. The prompts are built by the answerer itself, against an LLM that
 * records the request instead of sending it: no Anthropic call is possible.
 */
async function dryRun(
  questions: Question[],
  retrieve: ReturnType<typeof retrieverOf>,
  settings: EvalSettings
): Promise<number> {
  const requests: LLMRequest[] = []
  const recorder: LLM = {
    model: ANSWERER_MODEL,
    complete: () => Promise.reject(new Error("dry run: no model call")),
    completeJson: (request, schema) => {
      requests.push(request)
      const value = schema.parse({
        status: "abstained",
        answer: "",
        citations: [],
      })
      return Promise.resolve({ value, call: noCall })
    },
  }

  let retrievalCostUsd = 0
  for (const question of questions) {
    const { context, calls } = await retrieve(question.question, settings.k)
    retrievalCostUsd += sum(calls.map(callCostUsd))
    await answerQuestion(question.question, context, recorder)
  }

  const answerCalls: ModelCall[] = requests.map((request) => ({
    model: ANSWERER_MODEL,
    inputTokens: Math.ceil(
      ((request.system?.length ?? 0) + request.prompt.length) / CHARS_PER_TOKEN
    ),
    outputTokens: request.maxTokens,
    latencyMs: 0,
  }))
  const costUsd = retrievalCostUsd + sum(answerCalls.map(callCostUsd))
  const meanTokens =
    sum(answerCalls.map((call) => call.inputTokens)) / (answerCalls.length || 1)
  console.log(
    [
      `Dry run, config A, ${settings.split} split (only the query embeddings were requested)`,
      `  questions:        ${questions.length}`,
      `  expected calls:   ${questions.length} Mistral embeddings, ${answerCalls.length} Anthropic (${ANSWERER_MODEL})`,
      `  context:          ~${Math.round(meanTokens)} input tokens per question`,
      `  cost upper bound: ${costUsd.toFixed(4)} USD (cap ${settings.maxCostUsd} USD)`,
    ].join("\n")
  )
  return 0
}

const noCall: ModelCall = {
  model: ANSWERER_MODEL,
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
