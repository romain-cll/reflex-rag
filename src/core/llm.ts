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

export interface LLM {
  readonly model: string
  complete(request: LLMRequest): Promise<LLMResponse>
}
