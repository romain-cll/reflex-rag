import { z } from "zod"
import type {
  SystemOne,
  SystemOneAnswer,
  SystemOneRequest,
} from "../core/system-one.ts"
import type { ModelCall } from "../core/types.ts"

const MAX_RETRIES = 3
const DEFAULT_RETRY_BASE_MS = 1000
const DEFAULT_TIMEOUT_MS = 60_000
const ERROR_BODY_CHARS = 200

const JEV_URL = "https://api.typesafe.ai"
/** Pinned, so that the published runs can be reproduced. */
export const JEV_MODEL = "jev-1.13.0"
const OLLAMA_PORT = 11434
const DEFAULT_OLLAMA_HOST = `http://localhost:${OLLAMA_PORT}`
const CLEF_MODEL = "clef-flash"

/**
 * What Ollama accepts of `/v1/systemone` (measured 2026-10-30, Ollama 0.40.1):
 * it answers 413 above 64 KiB of text and schema and 400 above 64 questions,
 * and never truncates.
 */
export const CLEF_LIMITS = { maxQuestions: 64, maxBytes: 65536 }

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
  z.object({ type: z.literal("noul"), noul: z.number() }),
])

const ResponseSchema = z.object({
  answers: z.record(z.string(), AnswerSchema),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
})

/** The models Ollama has loaded, from `/api/ps`. */
const LoadedModelsSchema = z.object({
  models: z.array(
    z.object({ name: z.string().optional(), model: z.string().optional() })
  ),
})

/** The request that loads the model: one question, answered by the model. */
const WARM_UP_REQUEST: SystemOneRequest = {
  state: "warm-up",
  questions: {
    warmup: { type: "noul", instructions: "Is this a warm-up request?" },
  },
}

export interface HttpSystemOneOptions {
  baseUrl: string
  model: string
  apiKey?: string
  fetch?: typeof fetch
  /** First retry delay in milliseconds, doubled at each retry. Default 1000. */
  retryBaseMs?: number
  /** Each attempt is aborted after it, and the abort is retried. Default 60000. */
  timeoutMs?: number
  /**
   * For a model served by Ollama, which loads it on the first request: before
   * each request, asks `/api/ps` whether the model is loaded, and if not loads
   * it with a warm-up request, whose time is reported as `loadMs` and kept out
   * of `latencyMs`.
   */
  preload?: boolean
}

export class HttpSystemOne implements SystemOne {
  readonly model: string
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly fetch: typeof fetch
  private readonly retryBaseMs: number
  private readonly timeoutMs: number
  private readonly preload: boolean
  /** The warm-up in flight, shared by the requests that wait for the model. */
  private warmUp: Promise<number> | undefined

  constructor(options: HttpSystemOneOptions) {
    this.baseUrl = options.baseUrl
    this.model = options.model
    this.apiKey = options.apiKey
    this.fetch = options.fetch ?? fetch
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.preload = options.preload ?? false
  }

  async decide(
    request: SystemOneRequest
  ): Promise<{ answers: Record<string, SystemOneAnswer>; call: ModelCall }> {
    const loadMs = this.preload ? await this.ensureLoaded() : undefined
    const { body, latencyMs } = await this.exchange(request)
    const answers = Object.fromEntries(
      Object.keys(request.questions)
        .filter((id) => id in body.answers)
        .map((id) => [id, body.answers[id] as SystemOneAnswer])
    )
    const call: ModelCall = {
      model: this.model,
      inputTokens: body.usage.input_tokens,
      outputTokens: body.usage.output_tokens,
      latencyMs,
      ...(loadMs === undefined ? {} : { loadMs }),
    }
    return { answers, call }
  }

  /** The parsed response, and the time of the attempt that got it. */
  private async exchange(request: SystemOneRequest) {
    for (let attempt = 0; ; attempt++) {
      const startedAt = performance.now()
      const outcome = await this.post(request)
      if (outcome instanceof Response && outcome.ok) {
        const body = await parseBody(outcome)
        return { body, latencyMs: performance.now() - startedAt }
      }
      const retryable =
        outcome instanceof Response ? isRetryable(outcome.status) : true
      if (!retryable || attempt >= MAX_RETRIES) throw await failure(outcome)
      await Bun.sleep(this.retryBaseMs * 2 ** attempt)
    }
  }

  /**
   * The time spent loading the model for this request: 0 when it is loaded or
   * when another request loads it (and carries the time).
   */
  private async ensureLoaded(): Promise<number> {
    if (this.warmUp === undefined && (await this.isLoaded())) return 0
    if (this.warmUp !== undefined) {
      await this.warmUp
      return 0
    }
    const startedAt = performance.now()
    const warmUp = this.exchange(WARM_UP_REQUEST).then(
      () => performance.now() - startedAt
    )
    this.warmUp = warmUp
    try {
      return await warmUp
    } finally {
      this.warmUp = undefined
    }
  }

  /** Whether `/api/ps` lists the model; any failure counts as not loaded, and the warm-up reports it. */
  private async isLoaded(): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/ps`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!response.ok) return false
      const parsed = LoadedModelsSchema.safeParse(await response.json())
      if (!parsed.success) return false
      const names = [this.model, `${this.model}:latest`]
      return parsed.data.models.some(
        ({ name, model }) =>
          names.includes(name ?? "") || names.includes(model ?? "")
      )
    } catch {
      return false
    }
  }

  /** The response, or the error of a network failure. */
  private async post(request: SystemOneRequest): Promise<Response | Error> {
    try {
      return await this.fetch(`${this.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey === undefined
            ? {}
            : { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          model: this.model,
          state: request.state,
          questions: request.questions,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }
}

type Factory = Pick<HttpSystemOneOptions, "fetch" | "retryBaseMs" | "timeoutMs">

/** Jev, TypeSafe's hosted system one, with the key of `TYPESAFE_API_KEY`. */
export function jevSystemOne(options: Factory = {}): HttpSystemOne {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (apiKey === undefined || apiKey === "") {
    throw new Error("TYPESAFE_API_KEY is not set: Jev needs an API key")
  }
  return new HttpSystemOne({
    ...options,
    baseUrl: JEV_URL,
    model: JEV_MODEL,
    apiKey,
  })
}

/** Clef-flash, served locally by Ollama (`OLLAMA_HOST`), without a key. */
export function clefSystemOne(options: Factory = {}): HttpSystemOne {
  return new HttpSystemOne({
    ...options,
    baseUrl: ollamaBaseUrl(process.env.OLLAMA_HOST),
    model: CLEF_MODEL,
    preload: true,
  })
}

/** `OLLAMA_HOST` as Ollama reads it: `http://` and `:11434` when missing, the default when empty. */
export function ollamaBaseUrl(host: string | undefined): string {
  if (host === undefined || host === "") return DEFAULT_OLLAMA_HOST
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(host)
    ? host
    : `http://${host}`
  return /:\d+$/.test(withScheme) ? withScheme : `${withScheme}:${OLLAMA_PORT}`
}

async function parseBody(response: Response) {
  let json: unknown
  try {
    json = await response.json()
  } catch (error) {
    throw new Error("System-one response is not JSON", { cause: error })
  }
  const parsed = ResponseSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(
      `System-one response is invalid: ${z.prettifyError(parsed.error)}`
    )
  }
  return parsed.data
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 529 || status >= 500
}

async function failure(outcome: Response | Error): Promise<Error> {
  if (outcome instanceof Error) {
    return new Error(`System-one request failed: ${outcome.message}`, {
      cause: outcome,
    })
  }
  const firstLine = ((await outcome.text()).split("\n")[0] ?? "").slice(
    0,
    ERROR_BODY_CHARS
  )
  return new Error(
    `System-one request failed (${outcome.status}): ${firstLine}`
  )
}
