import { z } from "zod"
import type { Embedder, Embedding } from "../core/embedder.ts"
import type { ModelCall } from "../core/types.ts"

const ENDPOINT = "https://api.mistral.ai/v1/embeddings"
const BASE_BACKOFF_MS = 1000
const ERROR_BODY_CHARS = 200

const ResponseSchema = z.object({
  data: z.array(
    z.object({ embedding: z.array(z.number()), index: z.number().int() })
  ),
  usage: z.object({ prompt_tokens: z.number() }),
})

export interface MistralEmbedderOptions {
  apiKey: string
  model?: string
  batchSize?: number
  maxRetries?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export class MistralEmbedder implements Embedder {
  readonly model: string
  readonly dimensions = 1024
  private readonly apiKey: string
  private readonly batchSize: number
  private readonly maxRetries: number
  private readonly fetch: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: MistralEmbedderOptions) {
    this.apiKey = options.apiKey
    this.model = options.model ?? "mistral-embed"
    this.batchSize = options.batchSize ?? 32
    this.maxRetries = options.maxRetries ?? 5
    this.fetch = options.fetch ?? fetch
    this.sleep = options.sleep ?? Bun.sleep
  }

  async embed(texts: string[]): Promise<Embedding> {
    const vectors: Float32Array[] = []
    const calls: ModelCall[] = []
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize)
      const result = await this.embedBatch(batch)
      vectors.push(...result.vectors)
      calls.push(result.call)
    }
    return { vectors, calls }
  }

  private async embedBatch(
    batch: string[]
  ): Promise<{ vectors: Float32Array[]; call: ModelCall }> {
    for (let attempt = 0; ; attempt++) {
      const startedAt = performance.now()
      const response = await this.post(batch)
      if (response.ok) {
        const { vectors, promptTokens } = await parseResponse(response, batch)
        const call: ModelCall = {
          model: this.model,
          inputTokens: promptTokens,
          outputTokens: 0,
          latencyMs: performance.now() - startedAt,
        }
        return { vectors, call }
      }
      if (!isRetryable(response.status) || attempt >= this.maxRetries) {
        throw await httpError(response)
      }
      await this.sleep(retryDelayMs(response, attempt))
    }
  }

  private post(batch: string[]): Promise<Response> {
    return this.fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: batch }),
    })
  }
}

async function parseResponse(
  response: Response,
  batch: string[]
): Promise<{ vectors: Float32Array[]; promptTokens: number }> {
  const parsed = ResponseSchema.parse(await response.json())
  if (parsed.data.length !== batch.length) {
    throw new Error(
      `Mistral returned ${parsed.data.length} embeddings for ${batch.length} inputs`
    )
  }
  const vectors = new Array<Float32Array>(batch.length)
  for (const item of parsed.data) {
    if (item.index < 0 || item.index >= batch.length || vectors[item.index]) {
      throw new Error(`Mistral returned an invalid item index: ${item.index}`)
    }
    vectors[item.index] = Float32Array.from(item.embedding)
  }
  return { vectors, promptTokens: parsed.usage.prompt_tokens }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/** Retry-After (in seconds) when the server sends one, else 1 s, 2 s, 4 s… */
function retryDelayMs(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get("Retry-After"))
  if (response.headers.has("Retry-After") && seconds >= 0) return seconds * 1000
  return BASE_BACKOFF_MS * 2 ** attempt
}

async function httpError(response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, ERROR_BODY_CHARS)
  return new Error(
    `Mistral embeddings request failed (${response.status}): ${body}`
  )
}
