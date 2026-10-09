import type { Verdict } from "../core/judge.ts"

/**
 * The closed question every judge answers for each note, word for word:
 * the instructions and what each verdict means.
 */
export const JUDGE_QUESTION: {
  instructions: string
  criteria: Record<Verdict, string>
} = {
  instructions:
    "A question is asked about a company's internal note vault, and answering it may need several notes read one after the other. What does this note give for answering the question?",
  criteria: {
    answer: "The note states the answer to the question, or a part of it.",
    step: "The note does not state the answer, but it leads to it: it names the person, supplier, customer, meeting or decision the question depends on, or it links to a note that likely holds the answer.",
    none: "The note does not help answer the question.",
  },
}
