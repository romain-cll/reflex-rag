import type { z } from "zod"
import type { ModelCall } from "./types.ts"

export interface LLMRequest {
  system?: string
  prompt: string
  maxTokens: number
}

export interface LLMResponse {
  text: string
  call: ModelCall
}

export interface LLMJsonResponse<T> {
  value: T
  call: ModelCall
}

export interface LLM {
  readonly model: string
  complete(request: LLMRequest): Promise<LLMResponse>
  /** Structured output: `value` is parsed and validated against `schema`. */
  completeJson<T>(
    request: LLMRequest,
    schema: z.ZodType<T>
  ): Promise<LLMJsonResponse<T>>
}

/**
 * An error raised after the API answered: `call` holds the request's billed
 * tokens. Errors of the API itself carry none.
 */
export class LLMCallError extends Error {
  constructor(
    message: string,
    readonly call: ModelCall
  ) {
    super(message)
  }
}
