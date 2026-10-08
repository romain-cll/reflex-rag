import type { Assessment } from "../core/judge.ts"
import type { Link } from "../core/types.ts"

export interface PolicyConfig {
  thresholds: {
    /** Used by the loop to keep a chunk, not by `decide`. */
    relevance: number
    sufficient: number
    link: number
  }
  budgets: {
    maxHops: number
    maxRewrites: number
    /** Used by the loop to cap the context, not by `decide`. */
    maxChunks: number
  }
}

export const DEFAULT_POLICY: PolicyConfig = {
  thresholds: { relevance: 0.5, sufficient: 0.7, link: 0.5 },
  budgets: { maxHops: 3, maxRewrites: 1, maxChunks: 12 },
}

export interface LoopState {
  /** The judge's latest assessment. */
  assessment: Assessment
  /** The links visible from the current context. */
  links: Link[]
  /** Paths of the notes already in the context. */
  contextNotes: string[]
  /** Number of relevant chunks kept so far. */
  relevantCount: number
  hops: number
  rewrites: number
}

/** The rules in priority order: the first that applies wins. */
export const RULES = [
  "sufficient",
  "follow-link",
  "rewrite-topic-not-found",
  "rewrite-nothing-relevant",
  "abstain-nothing-relevant",
  "answer-best-effort",
] as const

export type Rule = (typeof RULES)[number]

export type Action =
  | { type: "answer" | "rewrite" | "abstain"; rule: Rule }
  | { type: "follow"; rule: Rule; link: Link; probability: number }

type RuleFn = (state: LoopState, config: PolicyConfig) => Action | undefined

const hopsLeft = (state: LoopState, config: PolicyConfig) =>
  state.hops < config.budgets.maxHops

const rewritesLeft = (state: LoopState, config: PolicyConfig) =>
  state.rewrites < config.budgets.maxRewrites

const nothingRelevant = (state: LoopState) => state.relevantCount === 0

/** The unvisited link with the highest probability; ties go to the smallest id. */
function bestLink(
  state: LoopState
): { link: Link; probability: number } | undefined {
  let best: { link: Link; probability: number } | undefined
  for (const link of state.links) {
    const probability = state.assessment.links[link.id]
    if (probability === undefined) continue
    if (state.contextNotes.includes(link.targetPath)) continue
    if (
      best === undefined ||
      probability > best.probability ||
      (probability === best.probability && link.id < best.link.id)
    ) {
      best = { link, probability }
    }
  }
  return best
}

const sufficient: RuleFn = (state, config) =>
  state.assessment.sufficient >= config.thresholds.sufficient
    ? { type: "answer", rule: "sufficient" }
    : undefined

const followLink: RuleFn = (state, config) => {
  if (!hopsLeft(state, config)) return undefined
  const best = bestLink(state)
  if (best === undefined || best.probability < config.thresholds.link) {
    return undefined
  }
  return { type: "follow", rule: "follow-link", ...best }
}

const rewriteTopicNotFound: RuleFn = (state, config) =>
  state.assessment.missing.choice === "topic_not_found" &&
  rewritesLeft(state, config)
    ? { type: "rewrite", rule: "rewrite-topic-not-found" }
    : undefined

const rewriteNothingRelevant: RuleFn = (state, config) =>
  nothingRelevant(state) && rewritesLeft(state, config)
    ? { type: "rewrite", rule: "rewrite-nothing-relevant" }
    : undefined

const abstainNothingRelevant: RuleFn = (state, config) =>
  nothingRelevant(state) && !rewritesLeft(state, config)
    ? { type: "abstain", rule: "abstain-nothing-relevant" }
    : undefined

const answerBestEffort: RuleFn = () => ({
  type: "answer",
  rule: "answer-best-effort",
})

const RULE_FNS: readonly RuleFn[] = [
  sufficient,
  followLink,
  rewriteTopicNotFound,
  rewriteNothingRelevant,
  abstainNothingRelevant,
  answerBestEffort,
]

/** The next action of the retrieval loop: the first rule that applies. */
export function decide(state: LoopState, config: PolicyConfig): Action {
  for (const rule of RULE_FNS) {
    const action = rule(state, config)
    if (action !== undefined) return action
  }
  // Unreachable: `answerBestEffort` always applies.
  return { type: "answer", rule: "answer-best-effort" }
}
