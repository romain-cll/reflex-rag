import type { Question } from "../../evals/schema.ts"
import type { Answer } from "../answer/answerer.ts"

/**
 * In the order they are tried: a wrong answer gets the first that applies.
 * `answer_error` is never graded: the run sets it when the answerer throws.
 */
export const FAILURES = [
  "retrieval_miss",
  "false_abstention",
  "wrong_version",
  "missed_contradiction",
  "unsupported_claim",
  "wrong_answer",
  "answer_error",
] as const

export type Failure = (typeof FAILURES)[number]

export interface Grade {
  correct: boolean
  /** `null` when the answer is correct. */
  failure: Failure | null
}

const UNDECIDED_PHRASES = [
  "no decision",
  "not decided",
  "undecided",
  "has not been decided",
  "not been settled",
  "not settled",
  "still open",
  "left open",
  "remains open",
  "no final decision",
]

export function grade(
  question: Question,
  output: Answer,
  contextNotes: string[]
): Grade {
  if (isCorrect(question, output)) return { correct: true, failure: null }
  return { correct: false, failure: failureOf(question, output, contextNotes) }
}

function isCorrect({ expected, stale }: Question, output: Answer): boolean {
  switch (expected.kind) {
    case "value":
      return (
        output.status === "answered" &&
        expected.values.some((value) => contains(output.value, value)) &&
        !staleIn(output.value, expected.values, stale)
      )
    case "conflict":
      return (
        output.status === "conflict" &&
        expected.values.every((value) => contains(output.answer, value))
      )
    case "undecided":
      return (
        output.status === "answered" &&
        UNDECIDED_PHRASES.some(
          (phrase) =>
            contains(output.value, phrase) || contains(output.answer, phrase)
        )
      )
    case "abstain":
      return output.status === "abstained"
  }
}

function failureOf(
  question: Question,
  output: Answer,
  contextNotes: string[]
): Failure {
  const sourceRetrieved = question.sources.some((source) =>
    contextNotes.includes(source)
  )
  if (question.sources.length > 0 && !sourceRetrieved) return "retrieval_miss"
  if (output.status === "abstained" && question.expected.kind !== "abstain") {
    return "false_abstention"
  }
  const expectedValues =
    question.expected.kind === "value" ? question.expected.values : []
  if (staleIn(output.value, expectedValues, question.stale)) {
    return "wrong_version"
  }
  if (question.expected.kind === "conflict" && output.status !== "conflict") {
    return "missed_contradiction"
  }
  if (question.expected.kind === "abstain") return "unsupported_claim"
  return "wrong_answer"
}

/** Case-insensitive, whitespace collapsed, thousands separators ignored. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function contains(text: string, value: string): boolean {
  return normalize(text).includes(normalize(value))
}

/**
 * A stale value that only appears inside a matched expected value does not
 * count ("Product Manager" inside "Senior Product Manager").
 */
function staleIn(text: string, expected: string[], stale: string[]): boolean {
  const remainder = expected
    .map(normalize)
    .filter((value) => value !== "")
    .reduce((rest, value) => rest.replaceAll(value, " "), normalize(text))
  return stale.some((value) => remainder.includes(normalize(value)))
}
