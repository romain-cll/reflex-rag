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
import {
  JudgeCallsError,
  type Judge,
  type NoteForJudge,
} from "../core/judge.ts"
import { LLMCallError, type LLM, type LLMRequest } from "../core/llm.ts"
import type { SystemOne, SystemOneRequest } from "../core/system-one.ts"
import type { Chunk, ModelCall, Role } from "../core/types.ts"
import { openIndex, type Index } from "../index/read.ts"
import { callCostUsd } from "../eval/prices.ts"
import { runEval, type EvalOptions } from "../eval/run.ts"
import { FallbackJudge } from "../judge/fallback-judge.ts"
import { LLMJudge } from "../judge/llm-judge.ts"
import { SystemOneJudge } from "../judge/system-one-judge.ts"
import { noteText, runLoop } from "../loop/loop.ts"
import { DEFAULT_POLICY, POLICIES, type PolicyConfig } from "../loop/policy.ts"
import { CodeRewriter, LLMRewriter, type Rewriter } from "../loop/rewriter.ts"
import {
  AnthropicLLM,
  THINKING_HEADROOM_TOKENS,
} from "../models/anthropic-llm.ts"
import { MistralEmbedder } from "../models/mistral-embedder.ts"
import { clefSystemOne, JEV_MODEL, jevSystemOne } from "../models/system-one.ts"
import { HybridRetriever } from "../retrieval/hybrid.ts"

export type EvalConfig = "A" | "B" | "C"

/** The options of `reflex eval`, as typed on the command line. */
export interface EvalCliOptions {
  split?: string
  limit?: string
  k?: string
  maxCost?: string
  dryRun?: boolean
  /** Configs B and C. */
  rewrite?: string
  candidates?: string
  /** Config C only. */
  systemOne?: string
  fallback?: string
}

const REWRITERS = ["llm", "code"] as const

type RewriterKind = (typeof REWRITERS)[number]

const SYSTEM_ONES = ["jev", "clef"] as const

type SystemOneKind = (typeof SYSTEM_ONES)[number]

interface EvalSettings {
  split: Split
  limit: number | null
  k: number
  maxCostUsd: number
  dryRun: boolean
  rewrite: RewriterKind
  candidates: number
  systemOne: SystemOneKind
  /** A note whose best verdict is below it is judged again by the LLM. */
  fallback: number
}

const QUESTIONS_PATH = "evals/dev/questions.json"
const INDEX_PATH = ".reflex/index.db"
const RUNS_DIR = "runs"
const ANSWERER_MODEL = "claude-haiku-5-5"
/** Notes in the context. */
const DEFAULT_K = 5
const DEFAULT_CANDIDATES = 50
const DEFAULT_FALLBACK = 0.6
/** Rough size of a token, for the dry-run estimate. */
const CHARS_PER_TOKEN = 4

export async function evalCommand(
  config: EvalConfig,
  options: EvalCliOptions
): Promise<number> {
  try {
    return await runConfig(config, parseSettings(config, options))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`reflex eval: ${message.split("\n")[0]}`)
    return 1
  }
}

function parseSettings(
  config: EvalConfig,
  options: EvalCliOptions
): EvalSettings {
  if (config === "A" && options.rewrite !== undefined) {
    throw new Error(
      "--rewrite only applies to configs B and C, not to config A"
    )
  }
  for (const [name, value] of [
    ["system-one", options.systemOne],
    ["fallback", options.fallback],
  ]) {
    if (config !== "C" && value !== undefined) {
      throw new Error(
        `--${name} only applies to config C, not to config ${config}`
      )
    }
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
    k: options.k === undefined ? DEFAULT_K : parseNumber("k", options.k, true),
    maxCostUsd:
      options.maxCost === undefined
        ? 1
        : parseNumber("max-cost", options.maxCost, false),
    dryRun: options.dryRun ?? false,
    rewrite: parseChoice("rewrite", options.rewrite, REWRITERS, "llm"),
    candidates:
      options.candidates === undefined
        ? DEFAULT_CANDIDATES
        : parseNumber("candidates", options.candidates, true),
    systemOne: parseChoice("system-one", options.systemOne, SYSTEM_ONES, "jev"),
    fallback:
      options.fallback === undefined
        ? DEFAULT_FALLBACK
        : parseFallback(options.fallback),
  }
}

function parseChoice<T extends string>(
  name: string,
  text: string | undefined,
  choices: readonly T[],
  byDefault: T
): T {
  if (text === undefined) return byDefault
  const choice = choices.find((candidate) => candidate === text)
  if (choice === undefined) {
    throw new Error(
      `invalid --${name} "${text}", expected ${choices.join(" or ")}`
    )
  }
  return choice
}

function parseFallback(text: string): number {
  const value = text.trim() === "" ? NaN : Number(text)
  if (!(value >= 0 && value <= 1)) {
    throw new Error(`--fallback must be a number from 0 to 1, got "${text}"`)
  }
  return value
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
type Pipeline = Pick<
  EvalOptions,
  "retrieve" | "answer" | "k" | "candidates" | "loop"
> & {
  /** The models, but the embedder's. */
  models: Record<string, string>
}

async function runConfig(
  config: EvalConfig,
  settings: EvalSettings
): Promise<number> {
  for (const path of [QUESTIONS_PATH, INDEX_PATH]) {
    if (!existsSync(path)) throw new Error(`${path} not found`)
  }
  const mistralKey = requireKey("MISTRAL_API_KEY")
  if (!settings.dryRun) requireKey("ANTHROPIC_API_KEY")
  const systemOne = config === "C" ? systemOneOf(settings.systemOne) : undefined
  const questions = await loadQuestions(settings)

  const index = openIndex(INDEX_PATH)
  try {
    const embedder = new MistralEmbedder({ apiKey: mistralKey })
    if (settings.dryRun) {
      return config === "A"
        ? await dryRunA(
            questions,
            retrieverOf(index, embedder, settings),
            settings
          )
        : await dryRunLoop(
            config,
            questions,
            index,
            embedder,
            settings,
            systemOne
          )
    }

    const pipeline =
      config === "A"
        ? pipelineA(index, embedder, settings)
        : config === "B"
          ? pipelineB(index, embedder, settings)
          : pipelineC(index, embedder, settings, systemOne!)
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

/** Jev needs `TYPESAFE_API_KEY`: `jevSystemOne` rejects its absence. */
function systemOneOf(kind: SystemOneKind): SystemOne {
  return kind === "jev" ? jevSystemOne() : clefSystemOne()
}

function pipelineA(
  index: Index,
  embedder: Embedder,
  settings: EvalSettings
): Pipeline {
  const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
  return {
    retrieve: retrieverOf(index, embedder, settings),
    answer: (query, context) =>
      roleTagged("answer", () => answerQuestion(query, context, llm)),
    k: settings.k,
    candidates: settings.candidates,
    models: { answerer: llm.model },
  }
}

/**
 * Config B: the judged retrieval loop, then the answerer, unless the loop
 * abstained. The judge, the rewriter and the answerer share one Haiku client.
 * `--k` caps the notes of the context, `--candidates` the chunks per search.
 */
function pipelineB(
  index: Index,
  embedder: Embedder,
  settings: EvalSettings
): Pipeline {
  const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
  return loopPipeline(
    "B",
    index,
    embedder,
    settings,
    llm,
    new RoleTaggedJudge(new LLMJudge(llm))
  )
}

/**
 * Config C: like B, but the system one judges the notes, and the LLM judges
 * again those on which it hesitates (`--fallback`).
 */
function pipelineC(
  index: Index,
  embedder: Embedder,
  settings: EvalSettings,
  systemOne: SystemOne
): Pipeline {
  const llm = new AnthropicLLM({ model: ANSWERER_MODEL })
  return loopPipeline(
    "C",
    index,
    embedder,
    settings,
    llm,
    new FallbackJudge(
      new SystemOneJudge(systemOne),
      new RoleTaggedJudge(new LLMJudge(llm)),
      { threshold: settings.fallback }
    ),
    systemOne.model
  )
}

/** The models and the loop part of the settings line of a B or C run. */
interface LoopSettings {
  models: Record<string, string>
  loop: {
    policy: PolicyConfig
    rewriter: RewriterKind
    candidates: number
    /** Config C only. */
    fallbackThreshold?: number
    systemOne?: SystemOneKind
  }
}

/**
 * The model of the judge is the system one's in C, which also names its
 * fallback model, the Haiku client's.
 */
export function loopSettings(
  config: "B" | "C",
  settings: EvalSettings,
  systemOneModel?: string
): LoopSettings {
  const models: Record<string, string> = {
    rewriter: settings.rewrite === "llm" ? ANSWERER_MODEL : "none",
    answerer: ANSWERER_MODEL,
  }
  const loop: LoopSettings["loop"] = {
    policy: loopPolicy(settings.k, POLICIES[config]),
    rewriter: settings.rewrite,
    candidates: settings.candidates,
  }
  if (config === "B") {
    return { models: { judge: ANSWERER_MODEL, ...models }, loop }
  }
  if (systemOneModel === undefined) {
    throw new Error("config C needs the model of its system one")
  }
  return {
    models: { judge: systemOneModel, fallback: ANSWERER_MODEL, ...models },
    loop: {
      ...loop,
      fallbackThreshold: settings.fallback,
      systemOne: settings.systemOne,
    },
  }
}

/**
 * The retrieval loop and the answerer of the configs B and C, which differ by
 * their judge.
 */
function loopPipeline(
  config: "B" | "C",
  index: Index,
  embedder: Embedder,
  settings: EvalSettings,
  llm: LLM,
  judge: Judge,
  systemOneModel?: string
): Pipeline {
  const retriever = new HybridRetriever(index, embedder)
  const rewriter = roleTaggedRewriter(
    settings.rewrite === "llm" ? new LLMRewriter(llm) : new CodeRewriter()
  )
  const { models, loop } = loopSettings(config, settings, systemOneModel)
  return {
    retrieve: async (query) => {
      const {
        context,
        calls,
        outcome,
        hops,
        rewrites,
        steps,
        judged,
        kept,
        frontier,
        fallback,
        stages,
      } = await runLoop(query, {
        retrieve: async (text, k) => {
          const retrieval = await retriever.retrieve(text, k)
          return { ...retrieval, calls: withRole(retrieval.calls, "embed") }
        },
        index,
        judge,
        rewriter,
        policy: loop.policy,
        candidates: settings.candidates,
      })
      return {
        context,
        calls,
        stages,
        loop: {
          outcome,
          hops,
          rewrites,
          steps,
          judged,
          kept,
          frontier,
          ...(config === "C" ? { fallback } : {}),
        },
      }
    },
    answer: async (query, context, loop) =>
      loop?.outcome.type === "abstain"
        ? { output: abstentionOutput(loop.outcome.rule), call: null }
        : roleTagged("answer", () => answerQuestion(query, context, llm)),
    k: settings.k,
    candidates: settings.candidates,
    loop,
    models,
  }
}

/** `policy`, the default one unless given, with `k` as the cap of the notes in the context. */
export function loopPolicy(
  k: number,
  policy: PolicyConfig = DEFAULT_POLICY
): PolicyConfig {
  return { ...policy, budgets: { ...policy.budgets, maxNotes: k } }
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

/** Marks the calls of an LLM judge as judge calls: they share their model with the rewriter and the answerer. */
class RoleTaggedJudge implements Judge {
  constructor(private readonly inner: Judge) {}

  judge(...args: Parameters<Judge["judge"]>) {
    return roleTagged("judge", () => this.inner.judge(...args))
  }
}

function roleTaggedRewriter(inner: Rewriter): Rewriter {
  return {
    kind: inner.kind,
    rewrite: (...args) => roleTagged("rewrite", () => inner.rewrite(...args)),
  }
}

/**
 * The result of `run`, or the failure it throws, with the calls it carries
 * (`call`, `calls`, the billed call of an `LLMCallError`) set to `role` unless
 * they have one.
 */
export async function roleTagged<
  T extends { call?: ModelCall | null; calls?: ModelCall[] },
>(role: Role, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run()
    return {
      ...result,
      ...(result.call ? { call: withRole([result.call], role)[0]! } : {}),
      ...(result.calls ? { calls: withRole(result.calls, role) } : {}),
    }
  } catch (error) {
    // The billed calls of a failure count for their role too.
    if (error instanceof LLMCallError) {
      throw new LLMCallError(error.message, withRole([error.call], role)[0]!)
    }
    if (error instanceof JudgeCallsError) {
      throw new JudgeCallsError(error.message, withRole(error.calls, role), {
        cause: error.cause,
      })
    }
    throw error
  }
}

/** The calls with `role` set where they have none. */
export function withRole(calls: ModelCall[], role: Role): ModelCall[] {
  return calls.map((call) => ({ ...call, role: call.role ?? role }))
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

/** The distinct note paths of the chunks, in order of first appearance, at most `k`. */
export function topNotes(chunks: Chunk[], k: number): string[] {
  return [...new Set(chunks.map((chunk) => chunk.notePath))].slice(0, k)
}

/** One context item per note: its path, its date, no heading, its whole text. */
export function notesContext(
  index: Pick<Index, "getNote" | "chunksOf">,
  paths: string[]
): ContextChunk[] {
  return paths.map((path) => ({
    notePath: path,
    noteDate: index.getNote(path)?.date ?? null,
    heading: "",
    text: noteText(index, path),
  }))
}

/**
 * Retrieval for config A: hybrid search of `candidates` chunks, then the
 * `k` best notes, each whole with its date.
 */
function retrieverOf(
  index: Index,
  embedder: Embedder,
  { candidates }: EvalSettings
) {
  const retriever = new HybridRetriever(index, embedder)
  return async (query: string, k: number) => {
    const { chunks, calls } = await retriever.retrieve(query, candidates)
    const context = notesContext(
      index,
      topNotes(
        chunks.map(({ chunk }) => chunk),
        k
      )
    )
    return { context, calls: withRole(calls, "embed") }
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
    notes: [],
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

/**
 * The call a request would make, at its largest: all `maxTokens` of visible
 * output come back, after the whole thinking headroom.
 */
function estimatedCall(request: LLMRequest): ModelCall {
  return {
    model: ANSWERER_MODEL,
    inputTokens: Math.ceil(
      ((request.system?.length ?? 0) + request.prompt.length) / CHARS_PER_TOKEN
    ),
    outputTokens: request.maxTokens + THINKING_HEADROOM_TOKENS,
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
 * Configs B and C: retrieves the candidates of every question (Mistral
 * embeddings only) and prints an upper bound of the run, from
 * `upperBoundCalls` (B) or `upperBoundCallsC`.
 */
async function dryRunLoop(
  config: "B" | "C",
  questions: Question[],
  index: Index,
  embedder: Embedder,
  settings: EvalSettings,
  systemOne: SystemOne | undefined
): Promise<number> {
  const retriever = new HybridRetriever(index, embedder)
  const policy = loopPolicy(settings.k, POLICIES[config])
  const { maxRewrites } = policy.budgets
  let embeddings = 0
  let embeddingCostUsd = 0
  let calls: ModelCall[] = []
  for (const question of questions) {
    const retrieval = await retriever.retrieve(
      question.question,
      settings.candidates
    )
    embeddings += retrieval.calls.length
    // Every rewrite embeds a new query, about as long as the question.
    embeddingCostUsd +=
      sum(retrieval.calls.map(callCostUsd)) * (1 + maxRewrites)
    const candidates = topNotes(
      retrieval.chunks.map(({ chunk }) => chunk),
      Infinity
    ).map((path) => noteForJudge(index, path))
    calls = calls.concat(
      systemOne
        ? await upperBoundCallsC(
            question.question,
            candidates,
            policy,
            settings.rewrite,
            systemOne.model
          )
        : await upperBoundCalls(
            question.question,
            candidates,
            policy,
            settings.rewrite
          )
    )
  }

  const systemOneCalls = calls.filter((call) => call.model === systemOne?.model)
  const anthropicCalls = calls.filter((call) => !systemOneCalls.includes(call))
  const systemOneCostUsd = sum(systemOneCalls.map(callCostUsd))
  const anthropicCostUsd = sum(anthropicCalls.map(callCostUsd))
  const costUsd = embeddingCostUsd + systemOneCostUsd + anthropicCostUsd
  console.log(
    [
      `Dry run, config ${config}, ${settings.split} split (only the query embeddings were requested)`,
      `  questions:        ${questions.length}`,
      `  loop:             ${settings.candidates} candidates, ${settings.rewrite} rewriter${systemOne ? `, ${settings.systemOne} system one, fallback below ${settings.fallback}` : ""}`,
      `  expected calls:   ${embeddings} Mistral embeddings (up to ${embeddings * (1 + maxRewrites)}), ${systemOne ? `up to ${systemOneCalls.length} system one (${systemOne.model}), ` : ""}up to ${anthropicCalls.length} Anthropic (${ANSWERER_MODEL})`,
      ...(systemOne
        ? [
            `  system one:       ${systemOneCostUsd.toFixed(4)} USD`,
            `  Anthropic:        ${anthropicCostUsd.toFixed(4)} USD`,
          ]
        : []),
      `  cost upper bound: ${costUsd.toFixed(4)} USD (cap ${settings.maxCostUsd} USD)`,
    ].join("\n")
  )
  return 0
}

/**
 * The Anthropic calls one question can make at most, sized from its candidate
 * notes: the loop judges the candidates at the start, then once more per
 * possible hop and rewrite, each time on all of them, with one rewriter call
 * per possible rewrite, and the answerer ends it. The prompts are built by the
 * judge, the rewriter and the answerer themselves, against a recording LLM;
 * every call is priced with its full `maxTokens` of output plus the thinking
 * headroom. The rewriter and
 * the answerer see the longest candidates, within the note budget.
 */
export async function upperBoundCalls(
  question: string,
  candidates: NoteForJudge[],
  policy: PolicyConfig,
  rewriter: RewriterKind
): Promise<ModelCall[]> {
  const requests: LLMRequest[] = []
  const recorder = recordingLLM(requests)
  const judge = new LLMJudge(recorder)
  const longest = [...candidates]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, policy.budgets.maxNotes)
  const context: ContextChunk[] = longest.map((note) => ({
    notePath: note.path,
    noteDate: note.date,
    heading: "",
    text: note.text,
  }))

  const { maxHops, maxRewrites } = policy.budgets
  for (let turn = 0; turn <= maxHops + maxRewrites; turn++) {
    await judge.judge(question, candidates)
  }
  if (rewriter === "llm") {
    for (let rewrite = 0; rewrite < maxRewrites; rewrite++) {
      await new LLMRewriter(recorder).rewrite(
        question,
        longest.map(({ path, text }) => ({ path, text }))
      )
    }
  }
  await answerQuestion(question, context, recorder)
  return requests.map(estimatedCall)
}

/**
 * The calls one question can make at most with config C: the system-one calls
 * first, one per candidate note and per possible turn, sized from the request
 * the system-one judge builds for the note; then the calls of
 * `upperBoundCalls`, the worst case of the fallback, the rewriter and the
 * answerer. A system-one call has no output, which is free.
 */
export async function upperBoundCallsC(
  question: string,
  candidates: NoteForJudge[],
  policy: PolicyConfig,
  rewriter: RewriterKind,
  systemOneModel: string = JEV_MODEL
): Promise<ModelCall[]> {
  const requests: SystemOneRequest[] = []
  const recorder: SystemOne = {
    model: systemOneModel,
    decide: (request) => {
      requests.push(request)
      return Promise.resolve({
        answers: {
          verdict: {
            type: "choice",
            choice: "none",
            probabilities: { answer: 0, step: 0, none: 1 },
            confidence: 1,
          },
        },
        call: noCall,
      })
    },
  }
  await new SystemOneJudge(recorder).judge(question, candidates)
  const turns = 1 + policy.budgets.maxHops + policy.budgets.maxRewrites
  const turnCalls = requests.map((request): ModelCall => ({
    model: systemOneModel,
    inputTokens: Math.ceil(JSON.stringify(request).length / CHARS_PER_TOKEN),
    outputTokens: 0,
    latencyMs: 0,
  }))
  return [
    ...Array.from({ length: turns }, () => turnCalls).flat(),
    ...(await upperBoundCalls(question, candidates, policy, rewriter)),
  ]
}

/** A note as the judge reads it: its text and its distinct link targets. */
function noteForJudge(index: Index, path: string): NoteForJudge {
  const links = index.outgoingLinks(path)
  return {
    path,
    date: index.getNote(path)?.date ?? null,
    text: noteText(index, path),
    links: [...new Set(links.map((link) => link.targetPath))],
  }
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
