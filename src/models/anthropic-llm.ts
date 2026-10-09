import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import {
  LLMCallError,
  type LLM,
  type LLMJsonResponse,
  type LLMRequest,
  type LLMResponse,
} from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"

/**
 * Haiku 5.5 thinks adaptively by default, and its thinking tokens count
 * against `max_tokens`. A request's `maxTokens` is the budget of the visible
 * output; this headroom is added on top for the thinking.
 */
export const THINKING_HEADROOM_TOKENS = 4096

export interface AnthropicLLMOptions {
  client?: Anthropic
  model?: string
  effort?: "low" | "medium" | "high"
}

/** The part of a Messages API response the wrapper reads. */
interface MessageResult {
  stop_reason: string | null
  content: { type: string; text?: string }[]
  usage: { input_tokens: number; output_tokens: number }
}

export class AnthropicLLM implements LLM {
  readonly model: string
  private readonly client: Anthropic
  private readonly effort: "low" | "medium" | "high"

  constructor(options: AnthropicLLMOptions = {}) {
    this.client = options.client ?? new Anthropic()
    this.model = options.model ?? "claude-haiku-5-5"
    this.effort = options.effort ?? "low"
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startedAt = performance.now()
    const message = await this.send(() =>
      this.client.messages.create({
        ...this.baseParams(request),
        output_config: { effort: this.effort },
      })
    )
    const call = this.callOf(message, startedAt)
    assertCompleted(message, call)
    return { text: textOf(message), call }
  }

  async completeJson<T>(
    request: LLMRequest,
    schema: z.ZodType<T>
  ): Promise<LLMJsonResponse<T>> {
    const startedAt = performance.now()
    const message = await this.send(() =>
      this.client.messages.parse({
        ...this.baseParams(request),
        output_config: {
          effort: this.effort,
          format: lenientOutputFormat(schema),
        },
      })
    )
    const call = this.callOf(message, startedAt)
    assertCompleted(message, call)
    if (message.parsed_output === null) {
      throw new LLMCallError(
        "Anthropic response could not be parsed: the text is not JSON",
        call
      )
    }
    const validated = schema.safeParse(message.parsed_output)
    if (!validated.success) {
      throw new LLMCallError(
        `Anthropic output is invalid against the schema: ${validated.error.message}`,
        call
      )
    }
    return { value: validated.data, call }
  }

  private baseParams(request: LLMRequest) {
    return {
      model: this.model,
      max_tokens: request.maxTokens + THINKING_HEADROOM_TOKENS,
      ...(request.system === undefined ? {} : { system: request.system }),
      messages: [{ role: "user" as const, content: request.prompt }],
    }
  }

  private callOf(message: MessageResult, startedAt: number): ModelCall {
    return {
      model: this.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs: performance.now() - startedAt,
    }
  }

  private async send<M>(request: () => Promise<M>): Promise<M> {
    try {
      return await request()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Anthropic request failed: ${reason}`, { cause: error })
    }
  }
}

function assertCompleted(message: MessageResult, call: ModelCall): void {
  if (message.stop_reason === "refusal") {
    throw new LLMCallError(
      "Anthropic model refused the request (stop_reason refusal)",
      call
    )
  }
  if (message.stop_reason === "max_tokens") {
    throw new LLMCallError(
      "Anthropic output truncated (stop_reason max_tokens)",
      call
    )
  }
}

function textOf(message: MessageResult): string {
  return message.content
    .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("")
}

/**
 * `messages.parse` runs the `parse` of the output format on the text before
 * returning, whatever the `stop_reason`: a truncated or refused response would
 * fail there and hide its cause and its billed tokens. This format gives the
 * schema of `z.toJSONSchema` (the SDK's zod helper degrades the enums of zod 4)
 * with a `parse` that never throws, so that the wrapper checks `stop_reason`
 * first, then validates the parsed JSON itself.
 */
function lenientOutputFormat<T>(schema: z.ZodType<T>) {
  const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema)
  delete jsonSchema["$schema"]
  return {
    type: "json_schema" as const,
    schema: strictObjects(jsonSchema),
    parse: (text: string): unknown => {
      try {
        return JSON.parse(text) as unknown
      } catch {
        return null
      }
    },
  }
}

/**
 * The structured output format wants every object closed and with all its
 * properties required, at any depth.
 */
function strictObjects(node: unknown): Record<string, unknown> {
  return walk(node) as Record<string, unknown>
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk)
  if (typeof node !== "object" || node === null) return node
  const copy = Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, walk(child)])
  )
  if (copy["type"] === "object" && typeof copy["properties"] === "object") {
    copy["required"] = Object.keys(copy["properties"] as object)
    copy["additionalProperties"] = false
  }
  return copy
}
