import type { ModelCall } from "./types.ts"

/** A closed question: the model gives a probability for each option. */
export type SystemOneQuestion =
  | {
      type: "choice"
      instructions: string
      /** What each option means, by option name. */
      criteria: Record<string, string>
    }
  | {
      type: "noul"
      instructions: string
      criteria?: { true: string; false: string }
    }

export type SystemOneAnswer =
  | {
      type: "choice"
      choice: string
      probabilities: Record<string, number>
      confidence: number
    }
  | { type: "noul"; noul: number }

export interface SystemOneRequest {
  /** What every question is asked about, shared by all of them. */
  state: unknown
  /** The questions by id. */
  questions: Record<string, SystemOneQuestion>
}

export interface SystemOne {
  readonly model: string
  /** One answer for each question of the request, by id. */
  decide(
    request: SystemOneRequest
  ): Promise<{ answers: Record<string, SystemOneAnswer>; call: ModelCall }>
}
