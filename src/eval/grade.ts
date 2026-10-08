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
        expected.values.every(
          (value) =>
            contains(output.answer, value) || contains(output.value, value)
        )
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

/**
 * The share of the source groups of a question with a note among the context
 * notes; `null` when the question has no source.
 */
export function recallOf(
  { sourceGroups }: Question,
  contextNotes: string[]
): number | null {
  if (sourceGroups.length === 0) return null
  const covered = sourceGroups.filter((group) =>
    group.some((source) => contextNotes.includes(source))
  )
  return covered.length / sourceGroups.length
}

function failureOf(
  question: Question,
  output: Answer,
  contextNotes: string[]
): Failure {
  const recall = recallOf(question, contextNotes)
  if (recall !== null && recall < 1) return "retrieval_miss"
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

/** Whitespace collapsed and thousands separators ignored; the case is kept. */
function normalize(text: string): string {
  return text
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Words that may start a sentence right before a capitalized value ("The
 * Denver office"), unlike "Senior" before "Account Executive".
 */
const FUNCTION_WORDS = new Set(["a", "an", "the", "in", "at", "on", "by", "to"])

/**
 * Where the value appears in a normalized text, ignoring case: only at word
 * and number boundaries (`$90` is not in `$900`, `$90,000` or `13.5`). A
 * capitalized value is not found at the end of a longer capitalized title
 * either ("Account Executive" in "Senior Account Executive").
 */
function findAll(
  text: string,
  value: string
): Array<[start: number, end: number]> {
  const needle = normalize(value)
  if (needle === "") return []
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?<!\\p{N}[.,])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])(?![.,]\\p{N})`,
    "giu"
  )
  return [...text.matchAll(pattern)]
    .filter((match) => !extendsTitle(text, match.index, match[0]))
    .map((match) => [match.index, match.index + match[0].length])
}

function extendsTitle(text: string, start: number, matched: string): boolean {
  const before = /(\p{Lu}\p{L}*) $/u.exec(text.slice(0, start))?.[1]
  return (
    before !== undefined &&
    !FUNCTION_WORDS.has(before.toLowerCase()) &&
    /^\p{Lu}/u.test(matched)
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function contains(text: string, value: string): boolean {
  return findAll(normalize(text), value).length > 0
}

/** The text with every appearance of the value replaced by a space. */
function without(text: string, value: string): string {
  let rest = ""
  let from = 0
  for (const [start, end] of findAll(text, value)) {
    rest += text.slice(from, start) + " "
    from = end
  }
  return normalize(rest + text.slice(from))
}

/**
 * A stale value that only appears inside a matched expected value does not
 * count ("Product Manager" inside "Senior Product Manager").
 */
function staleIn(text: string, expected: string[], stale: string[]): boolean {
  const remainder = expected.reduce(without, normalize(text))
  return stale.some((value) => findAll(remainder, value).length > 0)
}
