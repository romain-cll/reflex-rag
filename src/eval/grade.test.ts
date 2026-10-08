import { describe, expect, test } from "bun:test"
import type { Question } from "../../evals/schema.ts"
import { grade } from "./grade.ts"

interface Output {
  status: "answered" | "conflict" | "abstained"
  answer: string
  citations: string[]
}

const ANYA = "People/Anya Castillo.md"
const HANDOFF =
  "Meetings/2025-06-17 Westgate Realty Partners account handoff.md"

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-001",
    split: "test",
    category: "simple",
    question: "Which office does the account owner work from?",
    expected: { kind: "value", values: ["Denver"] },
    stale: [],
    sources: [ANYA],
    entity: "customer-0001",
    refs: ["fact-0001"],
    ...overrides,
  }
}

function output(
  status: Output["status"],
  answer: string,
  citations: string[] = []
): Output {
  return { status, answer, citations }
}

function valueQuestion(
  values: string[],
  overrides: Partial<Question> = {}
): Question {
  return makeQuestion({ expected: { kind: "value", values }, ...overrides })
}

function conflictQuestion(overrides: Partial<Question> = {}): Question {
  return makeQuestion({
    category: "contradiction",
    question: "What is the annual contract value?",
    expected: { kind: "conflict", values: ["$143,000", "$177,000"] },
    sources: [ANYA, HANDOFF],
    ...overrides,
  })
}

function undecidedQuestion(overrides: Partial<Question> = {}): Question {
  return makeQuestion({
    question: "Did the team decide on a new CRM?",
    expected: { kind: "undecided" },
    ...overrides,
  })
}

function abstainQuestion(overrides: Partial<Question> = {}): Question {
  return makeQuestion({
    category: "no_answer",
    question: "Which cyber insurance policy is required?",
    expected: { kind: "abstain" },
    sources: [],
    ...overrides,
  })
}

describe("AC1 — grading of value questions", () => {
  test("AC1 — value: correct when answered and the answer contains the expected value", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("answered", "The account owner works from Denver."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: the comparison ignores case", () => {
    const result = grade(
      valueQuestion(["Wexford Molding"]),
      output("answered", "They selected WEXFORD molding."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: the comparison collapses whitespace", () => {
    const result = grade(
      valueQuestion(["Wexford Molding"]),
      output("answered", "They selected Wexford \n  Molding."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: a value written without thousands separators matches the expected one with separators", () => {
    const result = grade(
      valueQuestion(["$48,200"]),
      output("answered", "The contract is worth $48200 a year."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: a value written with thousands separators matches the expected one without separators", () => {
    const result = grade(
      valueQuestion(["48200 units"]),
      output("answered", "They ordered 48,200 units."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: any one of several expected values is enough", () => {
    const result = grade(
      valueQuestion(["Denver", "Mile High City"]),
      output("answered", "She works in the Mile High City."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — value: an answer without the expected value is wrong", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("answered", "The account owner works from Austin."),
      [ANYA]
    )
    expect(result.correct).toBe(false)
    expect(result.failure).not.toBeNull()
  })

  test("AC1 — value: an abstention is wrong even when the text holds the value", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("abstained", "Denver is mentioned but I cannot confirm it."),
      [ANYA]
    )
    expect(result.correct).toBe(false)
  })

  test("AC1 — value: a conflict status is wrong even when the text holds the value", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("conflict", "Sources disagree: Denver or Austin."),
      [ANYA]
    )
    expect(result.correct).toBe(false)
  })

  test("AC1 — value: an answer holding the expected value and a stale one is correct", () => {
    const result = grade(
      valueQuestion(["Denver"], { stale: ["Portland"] }),
      output("answered", "Denver now, it used to be Portland."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })
})

describe("AC1 — grading of conflict questions", () => {
  test("AC1 — conflict: correct when status is conflict and the answer contains both values", () => {
    const result = grade(
      conflictQuestion(),
      output(
        "conflict",
        "The review says $143,000, the billing says $177,000."
      ),
      [ANYA, HANDOFF]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — conflict: the values are compared without thousands separators and case", () => {
    const result = grade(
      conflictQuestion(),
      output("conflict", "$143000 in one note and $177000 in the other."),
      [ANYA, HANDOFF]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — conflict: an answer with only one of the values is wrong", () => {
    const result = grade(
      conflictQuestion(),
      output("conflict", "The contract value is $143,000."),
      [ANYA, HANDOFF]
    )
    expect(result.correct).toBe(false)
    expect(result.failure).not.toBeNull()
  })

  test("AC1 — conflict: both values with the status answered is wrong", () => {
    const result = grade(
      conflictQuestion(),
      output("answered", "It is $143,000, or maybe $177,000."),
      [ANYA, HANDOFF]
    )
    expect(result.correct).toBe(false)
  })
})

describe("AC1 — grading of undecided questions", () => {
  const phrases = [
    "no decision",
    "not decided",
    "undecided",
    "has not been decided",
    "still open",
    "no final decision",
  ]
  for (const phrase of phrases) {
    test(`AC1 — undecided: correct when the answer says "${phrase}"`, () => {
      const result = grade(
        undecidedQuestion(),
        output("answered", `As of the notes, there is ${phrase} on this.`),
        [ANYA]
      )
      expect(result).toEqual({ correct: true, failure: null })
    })
  }

  test("AC1 — undecided: the phrases are matched ignoring case", () => {
    const result = grade(
      undecidedQuestion(),
      output("answered", "The question is Still Open."),
      [ANYA]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — undecided: an answer stating a decision is wrong", () => {
    const result = grade(
      undecidedQuestion(),
      output("answered", "The team chose Salesforce."),
      [ANYA]
    )
    expect(result.correct).toBe(false)
    expect(result.failure).not.toBeNull()
  })

  test("AC1 — undecided: an abstention saying no decision is wrong", () => {
    const result = grade(
      undecidedQuestion(),
      output("abstained", "There is no decision in the excerpts."),
      [ANYA]
    )
    expect(result.correct).toBe(false)
  })
})

describe("AC1 — grading of abstain questions", () => {
  test("AC1 — abstain: correct when status is abstained", () => {
    const result = grade(
      abstainQuestion(),
      output("abstained", "The excerpts do not say."),
      []
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC1 — abstain: wrong when status is answered", () => {
    const result = grade(
      abstainQuestion(),
      output("answered", "A policy from Acme."),
      []
    )
    expect(result.correct).toBe(false)
  })

  test("AC1 — abstain: wrong when status is conflict", () => {
    const result = grade(
      abstainQuestion(),
      output("conflict", "Policy A or policy B."),
      []
    )
    expect(result.correct).toBe(false)
  })
})

describe("AC2 — failure taxonomy", () => {
  test("AC2 — a correct answer has no failure, even when no source is among the context notes", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("answered", "Denver."),
      ["Other/Unrelated.md"]
    )
    expect(result).toEqual({ correct: true, failure: null })
  })

  test("AC2 — retrieval_miss: the question has sources and none is among the context notes", () => {
    const result = grade(
      valueQuestion(["Denver"], { sources: [ANYA, HANDOFF] }),
      output("answered", "Austin."),
      ["Other/Unrelated.md"]
    )
    expect(result).toEqual({ correct: false, failure: "retrieval_miss" })
  })

  test("AC2 — retrieval_miss: an empty context counts as no source found", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("answered", "Austin."),
      []
    )
    expect(result).toEqual({ correct: false, failure: "retrieval_miss" })
  })

  test("AC2 — retrieval_miss: one source among the context notes is not a miss", () => {
    const result = grade(
      valueQuestion(["Denver"], { sources: [ANYA, HANDOFF] }),
      output("answered", "Austin."),
      [HANDOFF]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_answer" })
  })

  test("AC2 — retrieval_miss comes before false_abstention", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("abstained", "I do not know."),
      ["Other/Unrelated.md"]
    )
    expect(result.failure).toBe("retrieval_miss")
  })

  test("AC2 — retrieval_miss comes before wrong_version", () => {
    const result = grade(
      valueQuestion(["Denver"], { stale: ["Portland"] }),
      output("answered", "Portland."),
      ["Other/Unrelated.md"]
    )
    expect(result.failure).toBe("retrieval_miss")
  })

  test("AC2 — retrieval_miss comes before missed_contradiction", () => {
    const result = grade(conflictQuestion(), output("answered", "$143,000."), [
      "Other/Unrelated.md",
    ])
    expect(result.failure).toBe("retrieval_miss")
  })

  test("AC2 — false_abstention: abstained on a value question whose sources were retrieved", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("abstained", "The excerpts do not say."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "false_abstention" })
  })

  test("AC2 — false_abstention: abstained on a conflict question", () => {
    const result = grade(
      conflictQuestion(),
      output("abstained", "The excerpts do not say."),
      [ANYA, HANDOFF]
    )
    expect(result).toEqual({ correct: false, failure: "false_abstention" })
  })

  test("AC2 — false_abstention: abstained on an undecided question", () => {
    const result = grade(
      undecidedQuestion(),
      output("abstained", "The excerpts do not say."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "false_abstention" })
  })

  test("AC2 — false_abstention comes before wrong_version", () => {
    const result = grade(
      valueQuestion(["Denver"], { stale: ["Portland"] }),
      output("abstained", "Only Portland is mentioned, I cannot tell."),
      [ANYA]
    )
    expect(result.failure).toBe("false_abstention")
  })

  test("AC2 — wrong_version: the answer contains a stale value", () => {
    const result = grade(
      valueQuestion(["Denver"], { stale: ["Portland"] }),
      output("answered", "The account owner works from Portland."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_version" })
  })

  test("AC2 — wrong_version: the stale value is compared ignoring case and whitespace", () => {
    const result = grade(
      valueQuestion(["Wexford Molding"], { stale: ["Ironwood Plastics"] }),
      output("answered", "They went with IRONWOOD \n Plastics."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_version" })
  })

  test("AC2 — wrong_version comes before missed_contradiction", () => {
    const result = grade(
      conflictQuestion({ stale: ["$99,000"] }),
      output("answered", "The value is $99,000."),
      [ANYA, HANDOFF]
    )
    expect(result.failure).toBe("wrong_version")
  })

  test("AC2 — missed_contradiction: a conflict question answered as a plain answer", () => {
    const result = grade(
      conflictQuestion(),
      output("answered", "The contract value is $143,000."),
      [ANYA, HANDOFF]
    )
    expect(result).toEqual({ correct: false, failure: "missed_contradiction" })
  })

  test("AC2 — missed_contradiction: both values given with the status answered", () => {
    const result = grade(
      conflictQuestion(),
      output("answered", "It is $143,000, or maybe $177,000."),
      [ANYA, HANDOFF]
    )
    expect(result).toEqual({ correct: false, failure: "missed_contradiction" })
  })

  test("AC2 — unsupported_claim: an abstain question answered", () => {
    const result = grade(
      abstainQuestion(),
      output("answered", "A policy from Acme."),
      []
    )
    expect(result).toEqual({ correct: false, failure: "unsupported_claim" })
  })

  test("AC2 — unsupported_claim: an abstain question has no sources, so it is never a retrieval_miss", () => {
    const result = grade(
      abstainQuestion(),
      output("answered", "A policy from Acme."),
      ["Other/Unrelated.md"]
    )
    expect(result.failure).toBe("unsupported_claim")
  })

  test("AC2 — wrong_answer: any other wrong answer", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("answered", "The account owner works from Austin."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_answer" })
  })

  test("AC2 — wrong_answer: an undecided question answered with a decision", () => {
    const result = grade(
      undecidedQuestion(),
      output("answered", "The team chose Salesforce."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_answer" })
  })

  test("AC2 — wrong_answer: a value question answered with a conflict status", () => {
    const result = grade(
      valueQuestion(["Denver"]),
      output("conflict", "Austin or Boston."),
      [ANYA]
    )
    expect(result).toEqual({ correct: false, failure: "wrong_answer" })
  })
})
