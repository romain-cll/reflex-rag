import { existsSync } from "node:fs"
import {
  QuestionSetSchema,
  SPLITS,
  type Question,
  type Split,
} from "../../evals/schema.ts"
import {
  answerQuestion,
  type Answer,
  type ContextChunk,
} from "../answer/answerer.ts"
import type { Embedder } from "../core/embedder.ts"
import type { Judge } from "../core/judge.ts"
import type { LLM, LLMRequest } from "../core/llm.ts"
import type { DatedChunk, ModelCall } from "../core/types.ts"
import { openIndex, type Index } from "../index/read.ts"
import { callCostUsd } from "../eval/prices.ts"
import { runEval, type EvalOptions } from "../eval/run.ts"
import { LLMJudge } from "../judge/llm-judge.ts"
import { runLoop } from "../loop/loop.ts"
import { DEFAULT_POLICY, type PolicyConfig } from "../loop/policy.ts"
import { CodeRewriter, LLMRewriter } from "../loop/rewriter.ts"
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
  /** Config B only. */
  rewrite?: string
  candidates?: string
}

const REWRITERS = ["llm", "code"] as const

type RewriterKind = (typeof REWRITERS)[number]

interface EvalSettings {
  split: Split
  limit: number | null
  k: number
  maxCostUsd: number
  dryRun: boolean
  rewrite: RewriterKind
  candidates: number
}

const QUESTIONS_PATH = "evals/dev/questions.json"
const INDEX_PATH = ".reflex/index.db"
const RUNS_DIR = "runs"
const ANSWERER_MODEL = "claude-haiku-5-5"
const DEFAULT_CANDIDATES = 50
/** Rough size of a token, for the dry-run estimate. */
const CHARS_PER_TOKEN = 4

export async function evalCommand(
  config: EvalConfig,
  options: EvalCliOptions
): Promise<number> {
  try {
    if (config === "C") throw new Error("config C is not implemented")
    return await runConfig(config, parseSettings(config, options))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`reflex eval: ${message.split("\n")[0]}`)
    return 1
  }
}

function parseSettings(
  config: "A" | "B",
  options: EvalCliOptions
): EvalSettings {
  if (config === "A" && options.rewrite !== undefined) {
    throw new Error("--rewrite only applies to config B, not to config A")
  }
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
    rewrite: parseRewriter(options.rewrite),
    candidates:
      options.candidates === undefined
        ? DEFAULT_CANDIDATES
        : parseNumber("candidates", options.candidates, true),
  }
}

function parseRewriter(text: string | undefined): RewriterKind {
  if (text === undefined) return "llm"
  const kind = REWRITERS.find((candidate) => candidate === text)
  if (kind === undefined) {
    throw new Error(
      `invalid --rewrite "${text}", expected ${REWRITERS.join(" or ")}`
    )
  }
  return kind
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

/** What differs between the configs: how a question is retrieved and answered. */
type Pipeline = Pick<EvalOptions, "retrieve" | "answer" | "k" | "loop"> & {
  /** The models, but the embedder's. */
  models: Record<string, string>
}

async function runConfig(
  config: "A" | "B",
  settings: EvalSettings
): Promise<number> {
  for (const path of [QUESTIONS_PATH, INDEX_PATH]) {
    if (!existsSync(path)) throw new Error(`${path} not found`)
  }
  const mistralKey = requireKey("MISTRAL_API_KEY")
  if (!settings.dryRun) requireKey("ANTHROPIC_API_KEY")
  const questions = await loadQuestions(settings)

  const index = openIndex(INDEX_PATH)
  try {
    const embedder = new MistralEmbedder({ apiKey: mistralKey })
    if (settings.dryRun) {
      return config === "A"
        ? await dryRunA(questions, retrieverOf(index, embedder), settings)
        : await dryRunB(questions, index, embedder, settings)
    }

    const pipeline =
      config === "A"
        ? pipelineA(index, embedder, settings)
        : pipelineB(index, embedder, settings)
    const { vaultPath, notes, chunks, links } = index.meta()
    const result = await runEval({
      questions,
      ...pipeline,
      maxCostUsd: settings.maxCostUsd,
      runsDir: RUNS_DIR,
      config,
      split: settings.split,
      models: { ...pipeline.models, embedder: embedder.model },
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

function pipelineA(
  index: Index,
  embedder: Embedder,
  settings: EvalSettings
): Pipeline {
  const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
  return {
    retrieve: retrieverOf(index, embedder),
    answer: (query, context) => answerQuestion(query, context, llm),
    k: settings.k,
    models: { answerer: llm.model },
  }
}

/**
 * Config B: the judged retrieval loop, then the answerer, unless the loop
 * abstained. The judge, the rewriter and the answerer share one Haiku client.
 * `--k` does not apply: the loop retrieves `--candidates` chunks per search.
 */
function pipelineB(
  index: Index,
  embedder: Embedder,
  settings: EvalSettings
): Pipeline {
  const retriever = new HybridRetriever(index, embedder)
  const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
  const judge = new RoleTaggedJudge(new LLMJudge(llm))
  const rewriter =
    settings.rewrite === "llm" ? new LLMRewriter(llm) : new CodeRewriter()
  return {
    retrieve: async (query, candidates) => {
      const result = await runLoop(query, {
        retrieve: (text, k) => retriever.retrieve(text, k),
        index,
        judge,
        rewriter,
        policy: DEFAULT_POLICY,
        candidates,
      })
      const { context, calls, outcome, hops, rewrites, steps } = result
      return { context, calls, loop: { outcome, hops, rewrites, steps } }
    },
    answer: async (query, context, loop) =>
      loop?.outcome.type === "abstain"
        ? { output: abstentionOutput(loop.outcome.rule), call: null }
        : answerQuestion(query, context, llm),
    k: settings.candidates,
    loop: {
      policy: DEFAULT_POLICY,
      rewriter: rewriter.kind,
      candidates: settings.candidates,
    },
    models: {
      judge: llm.model,
      rewriter: rewriter.kind === "llm" ? llm.model : "none",
      answerer: llm.model,
    },
  }
}

/** The output of a question the loop abstained on, which the answerer never sees. */
export function abstentionOutput(rule: string): Answer {
  return {
    status: "abstained",
    value: "",
    answer: `The retrieval loop abstained (rule ${rule}).`,
    citations: [],
  }
}

/** Marks the calls of a judge as such: they share their model with the rewriter and the answerer. */
class RoleTaggedJudge implements Judge {
  constructor(private readonly judge: Judge) {}

  async relevance(...args: Parameters<Judge["relevance"]>) {
    const result = await this.judge.relevance(...args)
    return { ...result, calls: tagged(result.calls) }
  }

  async assess(...args: Parameters<Judge["assess"]>) {
    const result = await this.judge.assess(...args)
    return { ...result, calls: tagged(result.calls) }
  }
}

function tagged(calls: ModelCall[]): ModelCall[] {
  return calls.map((call) => ({ ...call, role: "judge" }))
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
 * An LLM that records the requests instead of sending them: no Anthropic call
 * is possible. Its JSON reply is a stub that every schema of the pipeline
 * accepts (the answerer's, the judge's), and its text reply is a short query.
 */
function recordingLLM(requests: LLMRequest[]): LLM {
  const stub = {
    status: "abstained",
    value: "",
    answer: "",
    citations: [],
    chunks: [],
    sufficient: 0,
    missing: {
      detail_in_linked_note: 0,
      newer_version: 0,
      topic_not_found: 0,
      unidentified: 0,
    },
    links: [],
  }
  return {
    model: ANSWERER_MODEL,
    complete: (request) => {
      requests.push(request)
      return Promise.resolve({ text: "query", call: noCall })
    },
    completeJson: (request, schema) => {
      requests.push(request)
      return Promise.resolve({ value: schema.parse(stub), call: noCall })
    },
  }
}

/** The call a request would make, at its largest: all `maxTokens` come back. */
function estimatedCall(request: LLMRequest): ModelCall {
  return {
    model: ANSWERER_MODEL,
    inputTokens: Math.ceil(
      ((request.system?.length ?? 0) + request.prompt.length) / CHARS_PER_TOKEN
    ),
    outputTokens: request.maxTokens,
    latencyMs: 0,
  }
}

/**
 * Retrieves for every question (Mistral embeddings only) and prints the size
 * of the run. The prompts are built by the answerer itself, against a
 * recording LLM.
 */
async function dryRunA(
  questions: Question[],
  retrieve: ReturnType<typeof retrieverOf>,
  settings: EvalSettings
): Promise<number> {
  const requests: LLMRequest[] = []
  const recorder = recordingLLM(requests)

  let retrievalCostUsd = 0
  for (const question of questions) {
    const { context, calls } = await retrieve(question.question, settings.k)
    retrievalCostUsd += sum(calls.map(callCostUsd))
    await answerQuestion(question.question, context, recorder)
  }

  const answerCalls = requests.map(estimatedCall)
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

/**
 * Config B: retrieves the candidates of every question (Mistral embeddings
 * only) and prints an upper bound of the run, from `upperBoundCalls`.
 */
async function dryRunB(
  questions: Question[],
  index: Index,
  embedder: Embedder,
  settings: EvalSettings
): Promise<number> {
  const retriever = new HybridRetriever(index, embedder)
  const { maxRewrites } = DEFAULT_POLICY.budgets
  let embeddings = 0
  let embeddingCostUsd = 0
  let anthropicCalls: ModelCall[] = []
  for (const question of questions) {
    const { chunks, calls } = await retriever.retrieve(
      question.question,
      settings.candidates
    )
    embeddings += calls.length
    // Every rewrite embeds a new query, about as long as the question.
    embeddingCostUsd += sum(calls.map(callCostUsd)) * (1 + maxRewrites)
    const candidates: DatedChunk[] = chunks.map(({ chunk }) => ({
      ...chunk,
      noteDate: index.getNote(chunk.notePath)?.date ?? null,
    }))
    anthropicCalls = anthropicCalls.concat(
      await upperBoundCalls(
        question.question,
        candidates,
        DEFAULT_POLICY,
        settings.rewrite
      )
    )
  }

  const costUsd = embeddingCostUsd + sum(anthropicCalls.map(callCostUsd))
  console.log(
    [
      `Dry run, config B, ${settings.split} split (only the query embeddings were requested)`,
      `  questions:        ${questions.length}`,
      `  loop:             ${settings.candidates} candidates, ${settings.rewrite} rewriter`,
      `  expected calls:   ${embeddings} Mistral embeddings (up to ${embeddings * (1 + maxRewrites)}), up to ${anthropicCalls.length} Anthropic (${ANSWERER_MODEL})`,
      `  cost upper bound: ${costUsd.toFixed(4)} USD (cap ${settings.maxCostUsd} USD)`,
    ].join("\n")
  )
  return 0
}

/**
 * The Anthropic calls one question can make at most, sized from its retrieved
 * candidates: the loop assesses once and judges the candidates once at the
 * start, then once more per possible hop and rewrite, with one rewriter call
 * per possible rewrite, and the answerer ends it. The prompts are built by the
 * judge, the rewriter and the answerer themselves, against a recording LLM;
 * every call is priced with its full `maxTokens` of output. The assessments
 * and the answer see the longest candidates, within the chunk budget.
 */
export async function upperBoundCalls(
  question: string,
  candidates: DatedChunk[],
  policy: PolicyConfig,
  rewriter: RewriterKind
): Promise<ModelCall[]> {
  const requests: LLMRequest[] = []
  const recorder = recordingLLM(requests)
  const judge = new LLMJudge(recorder)
  const longest = [...candidates]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, policy.budgets.maxChunks)

  const { maxHops, maxRewrites } = policy.budgets
  for (let turn = 0; turn <= maxHops + maxRewrites; turn++) {
    await judge.relevance(question, candidates)
    await judge.assess(question, longest, [])
  }
  if (rewriter === "llm") {
    for (let rewrite = 0; rewrite < maxRewrites; rewrite++) {
      await new LLMRewriter(recorder).rewrite(question, longest, "unidentified")
    }
  }
  await answerQuestion(question, longest, recorder)
  return requests.map(estimatedCall)
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
