import type { ModelCall } from "../core/types.ts"

export interface Price {
  /** USD per million input tokens. */
  input: number
  /** USD per million output tokens. */
  output: number
}

/**
 * USD per million tokens. Source: the project brief (`reflex-rag-plan.md`) and
 * the eval-run spec, as of 2026-10-08. Haiku's price holds for prompts under
 * 100K tokens. Used for the traces and the cost cap only.
 */
export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "mistral-embed": { input: 0.1, output: 0 },
  // TypeSafe's models page, as of 2026-10-09: output is free.
  "jev-1.13.0": { input: 0.042, output: 0 },
  // Served locally; only used to check that the code runs.
  "clef-flash": { input: 0, output: 0 },
}

const MILLION = 1_000_000

export function callCostUsd(call: ModelCall): number {
  const price = PRICES[call.model]
  if (!price) throw new Error(`no price for model ${call.model}`)
  return (
    (call.inputTokens * price.input + call.outputTokens * price.output) /
    MILLION
  )
}
