import type { Verdict } from "../core/judge.ts"

export interface PolicyConfig {
  thresholds: {
    /** A note is kept when its `answer` probability reaches it... */
    answer: number
    /** ...or its `step` probability reaches this one; it is also opened. */
    step: number
  }
  budgets: {
    maxHops: number
    maxRewrites: number
    /** Notes opened by `explore` at most. */
    explore: number
    /** Used by the loop to cap the context, not by `decide`. */
    maxNotes: number
  }
}

export const DEFAULT_POLICY: PolicyConfig = {
  thresholds: { answer: 0.5, step: 0.5 },
  budgets: { maxHops: 2, maxRewrites: 1, explore: 3, maxNotes: 5 },
}

/** A note the judge has classified. */
export interface JudgedNote {
  path: string
  verdict: Record<Verdict, number>
  /** Its links were already opened. */
  expanded: boolean
  /** It links to a note not judged yet. */
  hasUnjudgedLinks: boolean
}

export interface LoopState {
  /** Every note judged so far, in order of first judgement. */
  notes: JudgedNote[]
  hops: number
  rewrites: number
}

/** The rules in priority order: the first that applies wins. */
export const RULES = [
  "follow-steps",
  "answer",
  "explore",
  "rewrite",
  "abstain",
] as const

export type Rule = (typeof RULES)[number]

export type Action =
  | { type: "expand"; rule: Rule; paths: string[] }
  | { type: "answer" | "rewrite" | "abstain"; rule: Rule }

type RuleFn = (state: LoopState, config: PolicyConfig) => Action | undefined

const hopsLeft = (state: LoopState, config: PolicyConfig) =>
  state.hops < config.budgets.maxHops

/** A note is kept when it is an answer note or a step note. */
export const isKept = (
  verdict: Record<Verdict, number>,
  config: PolicyConfig
) =>
  verdict.answer >= config.thresholds.answer ||
  verdict.step >= config.thresholds.step

const isOpenable = (note: JudgedNote) => !note.expanded && note.hasUnjudgedLinks

/** The notes by decreasing score; ties stay in order of judgement. */
function ranked(
  notes: JudgedNote[],
  score: (note: JudgedNote) => number
): JudgedNote[] {
  return [...notes].sort((a, b) => score(b) - score(a))
}

const followSteps: RuleFn = (state, config) => {
  if (!hopsLeft(state, config)) return undefined
  const steps = state.notes.filter(
    (note) => isOpenable(note) && note.verdict.step >= config.thresholds.step
  )
  if (steps.length === 0) return undefined
  const paths = ranked(steps, (note) => note.verdict.step).map(
    (note) => note.path
  )
  return { type: "expand", rule: "follow-steps", paths }
}

const answer: RuleFn = (state, config) =>
  state.notes.some((note) => isKept(note.verdict, config))
    ? { type: "answer", rule: "answer" }
    : undefined

const explore: RuleFn = (state, config) => {
  if (!hopsLeft(state, config)) return undefined
  const best = ranked(
    state.notes.filter(isOpenable),
    (note) => note.verdict.answer + note.verdict.step
  ).slice(0, config.budgets.explore)
  if (best.length === 0) return undefined
  return { type: "expand", rule: "explore", paths: best.map((n) => n.path) }
}

const rewrite: RuleFn = (state, config) =>
  state.rewrites < config.budgets.maxRewrites
    ? { type: "rewrite", rule: "rewrite" }
    : undefined

const abstain: RuleFn = () => ({ type: "abstain", rule: "abstain" })

const RULE_FNS: readonly RuleFn[] = [
  followSteps,
  answer,
  explore,
  rewrite,
  abstain,
]

/** The next action of the retrieval loop: the first rule that applies. */
export function decide(state: LoopState, config: PolicyConfig): Action {
  for (const rule of RULE_FNS) {
    const action = rule(state, config)
    if (action !== undefined) return action
  }
  // Unreachable: `abstain` always applies.
  return { type: "abstain", rule: "abstain" }
}
