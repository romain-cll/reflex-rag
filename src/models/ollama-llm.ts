import { z } from "zod"
import {
  LLMCallError,
  type LLM,
  type LLMJsonResponse,
  type LLMRequest,
  type LLMResponse,
} from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { ollamaBaseUrl } from "./system-one.ts"

/**
 * Pinned, so that the runs can be reproduced. 8-bit like Clef-flash (mxfp8),
 * but on Ollama's GGUF runner: the MLX runner of `qwen3.5:9b-mxfp8` answers
 * 501 "structured output is unavailable" to any `format` (Ollama 0.40.1).
 */
export const QWEN_MODEL = "qwen3.5:9b-q8_0"
/**
 * Constant for every call: a change of `num_ctx` makes Ollama reload the
 * model.
 */
export const NUM_CTX = 32768
/**
 * The Modelfile's sampling (`temperature 1`, `presence_penalty 1.5`) is set
 * for chat: it penalises every repeated token of a list of probabilities, and
 * the same judge request kept from 8 to 28 of its 28 notes. Greedy sampling
 * makes the calls deterministic.
 */
const SAMPLING = { temperature: 0, presence_penalty: 0 }
/**
 * The output cap over the request's `maxTokens`, sized for Haiku: Qwen writes
 * the same JSON in more tokens, and a local output costs nothing.
 */
const OUTPUT_HEADROOM = 2
const ERROR_BODY_CHARS = 200
const NANOS_PER_MS = 1e6

/** The part of an `/api/chat` reply (`stream: false`) the adapter reads. */
const ChatReplySchema = z.object({
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().default(0),
  eval_count: z.number().default(0),
  /** Nanoseconds. */
  load_duration: z.number().default(0),
})

export interface OllamaLLMOptions {
  baseUrl: string
  model?: string
  fetch?: typeof fetch
}

/**
 * A model served by Ollama. Thinking is off, sampling is greedy and the
 * output is capped at twice the request's `maxTokens`; the load time of the model is reported apart from the
 * latency of the call.
 */
export class OllamaLLM implements LLM {
  readonly model: string
  private readonly baseUrl: string
  private readonly fetch: typeof fetch

  constructor(options: OllamaLLMOptions) {
    this.baseUrl = options.baseUrl
    this.model = options.model ?? QWEN_MODEL
    this.fetch = options.fetch ?? fetch
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const { text, call } = await this.chat(request)
    return { text, call }
  }

  async completeJson<T>(
    request: LLMRequest,
    schema: z.ZodType<T>
  ): Promise<LLMJsonResponse<T>> {
    const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema)
    delete jsonSchema["$schema"]
    const { text, call } = await this.chat(request, jsonSchema)
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new LLMCallError("Ollama output is not JSON", call)
    }
    const validated = schema.safeParse(json)
    if (!validated.success) {
      throw new LLMCallError(
        `Ollama output is invalid against the schema: ${validated.error.message}`,
        call
      )
    }
    return { value: validated.data, call }
  }

  private async chat(
    request: LLMRequest,
    format?: Record<string, unknown>
  ): Promise<{ text: string; call: ModelCall }> {
    const numPredict = request.maxTokens * OUTPUT_HEADROOM
    const startedAt = performance.now()
    const reply = await this.send({
      model: this.model,
      stream: false,
      think: false,
      messages: [
        ...(request.system === undefined
          ? []
          : [{ role: "system", content: request.system }]),
        { role: "user", content: request.prompt },
      ],
      ...(format === undefined ? {} : { format }),
      options: { num_ctx: NUM_CTX, num_predict: numPredict, ...SAMPLING },
    })
    const loadMs = reply.load_duration / NANOS_PER_MS
    const call: ModelCall = {
      model: this.model,
      inputTokens: reply.prompt_eval_count,
      outputTokens: reply.eval_count,
      latencyMs: Math.max(0, performance.now() - startedAt - loadMs),
      loadMs,
    }
    if (reply.done_reason === "length") {
      throw new LLMCallError(
        "Ollama output truncated (done_reason length)",
        call
      )
    }
    if (reply.prompt_eval_count + numPredict > NUM_CTX) {
      throw new LLMCallError(
        `Ollama prompt fills the context window (num_ctx ${NUM_CTX}) and may have been truncated`,
        call
      )
    }
    return { text: reply.message.content, call }
  }

  private async send(body: unknown): Promise<z.infer<typeof ChatReplySchema>> {
    let response: Response
    try {
      response = await this.fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Ollama request failed: ${reason}`, { cause: error })
    }
    if (!response.ok) {
      const firstLine = ((await response.text()).split("\n")[0] ?? "").slice(
        0,
        ERROR_BODY_CHARS
      )
      throw new Error(
        `Ollama request failed (${response.status}): ${firstLine}`
      )
    }
    let json: unknown
    try {
      json = await response.json()
    } catch (error) {
      throw new Error("Ollama response is not JSON", { cause: error })
    }
    const parsed = ChatReplySchema.safeParse(json)
    if (!parsed.success) {
      throw new Error(
        `Ollama response is invalid: ${z.prettifyError(parsed.error)}`
      )
    }
    return parsed.data
  }
}

/** Qwen served by Ollama (`OLLAMA_HOST`), without a key. */
export function ollamaLLM(options: { fetch?: typeof fetch } = {}): OllamaLLM {
  return new OllamaLLM({
    ...options,
    baseUrl: ollamaBaseUrl(process.env.OLLAMA_HOST),
  })
}
