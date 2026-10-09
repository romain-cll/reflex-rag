import type { Question } from "../../evals/schema.ts"
import type { Answer } from "../answer/answerer.ts"

/**
 * In the order they are tried: the retrieval family first, then the answer
 * family (docs/features/eval-run.md, AC11). `loop_error` and `answer_error` are
 * never graded: the run sets them when the loop or the answerer throws.
 */
export const FAILURES = [
  "loop_error",
  "context_budget",
  "judge_rejected",
  "not_followed",
  "retrieval_miss",
  "answer_error",
  "false_abstention",
  "wrong_version",
  "missed_contradiction",
  "unsupported_claim",
  "wrong_answer",
] as const

export type Failure = (typeof FAILURES)[number]

/** The layer a failure belongs to and the lever that would fix it. */
export const FAILURE_INFO: Record<
  Failure,
  { family: "retrieval" | "answer"; lever: string }
> = {
  loop_error: {
    family: "retrieval",
    lever: "the loop's error handling",
  },
  context_budget: { family: "retrieval", lever: "the context budget" },
  judge_rejected: {
    family: "retrieval",
    lever: "the answer threshold and the judge's question",
  },
  not_followed: {
    family: "retrieval",
    lever: "the step threshold and the explore and hop budgets",
  },
  retrieval_miss: {
    family: "retrieval",
    lever: "the index, the candidates and the rewrites",
  },
  answer_error: { family: "answer", lever: "the answerer's call" },
  false_abstention: {
    family: "answer",
    lever: "the answerer's abstention rule",
  },
  wrong_version: {
    family: "answer",
    lever: "supersession in the answerer's prompt",
  },
  missed_contradiction: {
    family: "answer",
    lever: "contradictions in the answerer's prompt",
  },
  unsupported_claim: {
    family: "answer",
    lever: "the answerer's abstention rule",
  },
  wrong_answer: { family: "answer", lever: "the answerer's prompt" },
}

export interface Grade {
  correct: boolean
  /** `null` when the answer is correct. */
  failure: Failure | null
}

/** The note paths the retrieval loop judged, kept and left in its frontier. */
export interface LoopNotes {
  judged: string[]
  kept: string[]
  frontier: string[]
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
  contextNotes: string[],
  loop?: LoopNotes
): Grade {
  if (isCorrect(question, output)) return { correct: true, failure: null }
  return {
    correct: false,
    failure:
      retrievalFailureOf(question, contextNotes, loop) ??
      answerFailureOf(question, output),
  }
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

/** What the context of a question holds, from its source groups. */
export interface ContextMeasures {
  /** Share of the source groups with a note in the context; `null` without source. */
  recall: number | null
  /** Every source group has a note in the context; `null` without source. */
  contextComplete: boolean | null
  /** Share of the distinct context notes in a source group; `null` for an empty context. */
  precision: number | null
  /** Number of distinct context notes. */
  notesInContext: number
}

export function contextMeasuresOf(
  { sourceGroups }: Question,
  contextNotes: string[]
): ContextMeasures {
  const notes = new Set(contextNotes)
  const covered = sourceGroups.filter((group) =>
    group.some((source) => notes.has(source))
  )
  const sources = new Set(sourceGroups.flat())
  const fromSources = [...notes].filter((note) => sources.has(note))
  return {
    recall:
      sourceGroups.length === 0 ? null : covered.length / sourceGroups.length,
    contextComplete:
      sourceGroups.length === 0 ? null : covered.length === sourceGroups.length,
    precision: notes.size === 0 ? null : fromSources.length / notes.size,
    notesInContext: notes.size,
  }
}

/**
 * The notes of the source groups with no note in the context; empty when the
 * context is complete or the question has no source.
 */
function missingNotes({ sourceGroups }: Question, contextNotes: string[]) {
  return sourceGroups
    .filter((group) => !group.some((source) => contextNotes.includes(source)))
    .flat()
}

/**
 * Why a note of a missing source group is not in the context: the first of
 * `context_budget`, `judge_rejected` and `not_followed` that applies to any of
 * them, else `retrieval_miss`. `null` when the context is complete.
 */
function retrievalFailureOf(
  question: Question,
  contextNotes: string[],
  loop: LoopNotes | undefined
): Failure | null {
  const missing = missingNotes(question, contextNotes)
  if (missing.length === 0) return null
  const lists: Array<[Failure, string[] | undefined]> = [
    ["context_budget", loop?.kept],
    ["judge_rejected", loop?.judged],
    ["not_followed", loop?.frontier],
  ]
  const found = lists.find(([, notes]) =>
    missing.some((note) => notes?.includes(note))
  )
  return found ? found[0] : "retrieval_miss"
}

function answerFailureOf(question: Question, output: Answer): Failure {
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
