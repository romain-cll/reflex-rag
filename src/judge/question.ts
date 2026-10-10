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
    step: "The note does not state the answer, but it identifies something the answer depends on, or it links to a note likely to hold the answer.",
    none: "The note does not help answer the question.",
  },
}

/**
 * The question of the veto, asked of each note `alias` with all the notes of
 * the state in view, word for word.
 */
export const JUDGE_CROSS_QUESTION: {
  instructions: (alias: string) => string
  criteria: (alias: string) => Record<Verdict, string>
} = {
  instructions: (alias) =>
    `Read all the notes in the state. Taking into account what the other notes say, what does note ${alias} give for answering the question?`,
  criteria: (alias) => ({
    answer: `Note ${alias} states the answer, and no other note shows that this information is outdated or superseded.`,
    step: `Note ${alias} does not state the answer, but it identifies something the answer depends on, or links to a note likely to hold it.`,
    none: `Note ${alias} does not help: it is off topic, about another entity than the one the question asks about, or outdated according to other notes.`,
  }),
}

/** The question of the veto that picks one note among the notes of the state. */
export const JUDGE_BEST_QUESTION =
  "According to all the notes, which note states the answer to the question as it stands?"

/** The question of sufficiency, asked of all the notes of a call, word for word. */
export const JUDGE_SUFFICIENT_QUESTION =
  "Taken together, do all the notes given, context notes included, state the complete answer to the question, with nothing left to look up in another note?"
