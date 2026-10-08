import { describe, expect, test } from "bun:test"
import { MISSING, type Assessment, type Missing } from "../core/judge.ts"
import type { Link } from "../core/types.ts"
import {
  DEFAULT_POLICY,
  RULES,
  decide,
  type LoopState,
  type PolicyConfig,
} from "./policy.ts"

function link(id: string, targetPath: string): Link {
  return {
    id,
    sourcePath: "source.md",
    targetPath,
    label: `See [[${targetPath}]].`,
  }
}

/**
 * An assessment where nothing is sufficient and no link is promising. The
 * `missing` choice defaults to `unidentified`, which triggers no rule.
 */
function assessment(
  overrides: {
    sufficient?: number
    choice?: Missing
    links?: Record<string, number>
  } = {}
): Assessment {
  const choice = overrides.choice ?? "unidentified"
  const probabilities = Object.fromEntries(
    MISSING.map((m) => [m, m === choice ? 0.9 : 0.03])
  ) as Record<Missing, number>
  return {
    sufficient: overrides.sufficient ?? 0.1,
    missing: { choice, probabilities },
    links: overrides.links ?? {},
    calls: [],
  }
}

/**
 * A state with some relevant chunks, no budget used, and nothing that would
 * make a rule fire: the policy falls through to `answer-best-effort`.
 */
function state(overrides: Partial<LoopState> = {}): LoopState {
  return {
    assessment: assessment(),
    links: [],
    contextNotes: ["start.md"],
    relevantCount: 2,
    hops: 0,
    rewrites: 0,
    ...overrides,
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

describe("AC1 — sufficient", () => {
  test("AC1 — answers when the context is sufficient", () => {
    const action = decide(
      state({ assessment: assessment({ sufficient: 0.95 }) }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "answer", rule: "sufficient" })
  })

  test("AC1 — answers at exactly the sufficiency threshold (≥ applies)", () => {
    const action = decide(
      state({ assessment: assessment({ sufficient: 0.7 }) }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "answer", rule: "sufficient" })
  })

  test("AC1 — does not answer just under the sufficiency threshold", () => {
    const action = decide(
      state({ assessment: assessment({ sufficient: 0.6999 }) }),
      DEFAULT_POLICY
    )
    expect(action.rule).not.toBe("sufficient")
  })

  test("AC1 — uses the threshold of the configuration, not a constant", () => {
    const strict: PolicyConfig = {
      ...DEFAULT_POLICY,
      thresholds: { ...DEFAULT_POLICY.thresholds, sufficient: 0.9 },
    }
    const lenient: PolicyConfig = {
      ...DEFAULT_POLICY,
      thresholds: { ...DEFAULT_POLICY.thresholds, sufficient: 0.3 },
    }
    const s = state({ assessment: assessment({ sufficient: 0.8 }) })
    expect(decide(s, strict).rule).not.toBe("sufficient")
    expect(decide(s, lenient).rule).toBe("sufficient")
  })

  test("AC1 — a sufficient context with a promising link answers", () => {
    const l = link("l1", "next.md")
    const action = decide(
      state({
        assessment: assessment({ sufficient: 0.9, links: { l1: 0.99 } }),
        links: [l],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "answer", rule: "sufficient" })
  })

  test("AC1 — answers regardless of the missing choice", () => {
    for (const choice of MISSING) {
      const action = decide(
        state({ assessment: assessment({ sufficient: 0.8, choice }) }),
        DEFAULT_POLICY
      )
      expect(action).toMatchObject({ type: "answer", rule: "sufficient" })
    }
  })

  test("AC1 — a sufficient context answers even with no relevant chunk kept and no budget left", () => {
    const action = decide(
      state({
        assessment: assessment({ sufficient: 0.8 }),
        relevantCount: 0,
        hops: DEFAULT_POLICY.budgets.maxHops,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "answer", rule: "sufficient" })
  })
})

describe("AC2 — follow-link", () => {
  test("AC2 — follows a promising link and carries the link and its probability", () => {
    const l = link("l1", "next.md")
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.8 } }),
        links: [l],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "follow",
      rule: "follow-link",
      probability: 0.8,
    })
    expect(action).toHaveProperty("link", l)
  })

  test("AC2 — follows the link with the highest probability", () => {
    const links = [link("l1", "a.md"), link("l2", "b.md"), link("l3", "c.md")]
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.6, l2: 0.9, l3: 0.7 } }),
        links,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "follow",
      rule: "follow-link",
      probability: 0.9,
    })
    expect(action).toHaveProperty("link", links[1])
  })

  test("AC2 — follows at exactly the link threshold (≥ applies)", () => {
    const l = link("l1", "next.md")
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.5 } }),
        links: [l],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "follow",
      rule: "follow-link",
      probability: 0.5,
    })
  })

  test("AC2 — does not follow a link just under the link threshold", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.4999 } }),
        links: [link("l1", "next.md")],
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("follow")
  })

  test("AC2 — uses the link threshold of the configuration", () => {
    const strict: PolicyConfig = {
      ...DEFAULT_POLICY,
      thresholds: { ...DEFAULT_POLICY.thresholds, link: 0.9 },
    }
    const s = state({
      assessment: assessment({ links: { l1: 0.8 } }),
      links: [link("l1", "next.md")],
    })
    expect(decide(s, strict).type).not.toBe("follow")
    expect(decide(s, DEFAULT_POLICY).type).toBe("follow")
  })

  test("AC2 — skips links whose target is already in the context", () => {
    const links = [link("l1", "seen.md"), link("l2", "new.md")]
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.95, l2: 0.6 } }),
        links,
        contextNotes: ["start.md", "seen.md"],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "follow",
      rule: "follow-link",
      probability: 0.6,
    })
    expect(action).toHaveProperty("link", links[1])
  })

  test("AC2 — does not follow when every promising link is already visited", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.95 } }),
        links: [link("l1", "seen.md")],
        contextNotes: ["seen.md"],
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("follow")
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC2 — a visited link does not hide a promising one below the threshold", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.95, l2: 0.4 } }),
        links: [link("l1", "seen.md"), link("l2", "new.md")],
        contextNotes: ["seen.md"],
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("follow")
  })

  test("AC2 — ties go to the smallest link id", () => {
    const links = [
      link("link-c", "c.md"),
      link("link-a", "a.md"),
      link("link-b", "b.md"),
    ]
    const action = decide(
      state({
        assessment: assessment({
          links: { "link-c": 0.7, "link-a": 0.7, "link-b": 0.7 },
        }),
        links,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "follow", probability: 0.7 })
    expect(action).toHaveProperty("link", links[1])
  })

  test("AC2 — a tie is decided among the highest probability only", () => {
    const links = [
      link("link-a", "a.md"),
      link("link-b", "b.md"),
      link("link-c", "c.md"),
    ]
    const action = decide(
      state({
        assessment: assessment({
          links: { "link-a": 0.6, "link-b": 0.8, "link-c": 0.8 },
        }),
        links,
      }),
      DEFAULT_POLICY
    )
    expect(action).toHaveProperty("link", links[1])
  })

  test("AC2 — a tie skips a visited target and goes to the next smallest id", () => {
    const links = [
      link("link-a", "seen.md"),
      link("link-b", "b.md"),
      link("link-c", "c.md"),
    ]
    const action = decide(
      state({
        assessment: assessment({
          links: { "link-a": 0.7, "link-b": 0.7, "link-c": 0.7 },
        }),
        links,
        contextNotes: ["seen.md"],
      }),
      DEFAULT_POLICY
    )
    expect(action).toHaveProperty("link", links[1])
  })

  test("AC2 — follows a link on the last hop available", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.8 } }),
        links: [link("l1", "next.md")],
        hops: DEFAULT_POLICY.budgets.maxHops - 1,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "follow", rule: "follow-link" })
  })

  test("AC2 — does not follow once the hops are used up", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.99 } }),
        links: [link("l1", "next.md")],
        hops: DEFAULT_POLICY.budgets.maxHops,
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("follow")
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC2 — the hop budget comes from the configuration", () => {
    const noHops: PolicyConfig = {
      ...DEFAULT_POLICY,
      budgets: { ...DEFAULT_POLICY.budgets, maxHops: 0 },
    }
    const s = state({
      assessment: assessment({ links: { l1: 0.99 } }),
      links: [link("l1", "next.md")],
    })
    expect(decide(s, noHops).type).not.toBe("follow")
    expect(decide(s, DEFAULT_POLICY).type).toBe("follow")
  })

  test("AC2 — a promising link wins over topic_not_found", () => {
    const action = decide(
      state({
        assessment: assessment({
          choice: "topic_not_found",
          links: { l1: 0.8 },
        }),
        links: [link("l1", "next.md")],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "follow", rule: "follow-link" })
  })

  test("AC2 — a promising link wins over a search when nothing relevant was kept", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.8 } }),
        links: [link("l1", "next.md")],
        relevantCount: 0,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "follow", rule: "follow-link" })
  })

  test("AC2 — a promising link wins over abstaining when no rewrite is left", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.8 } }),
        links: [link("l1", "next.md")],
        relevantCount: 0,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "follow", rule: "follow-link" })
  })
})

describe("AC3 — rewrite-topic-not-found", () => {
  test("AC3 — searches again when the topic was not found", () => {
    const action = decide(
      state({ assessment: assessment({ choice: "topic_not_found" }) }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-topic-not-found",
    })
  })

  test("AC3 — searches again on the last rewrite available", () => {
    const action = decide(
      state({
        assessment: assessment({ choice: "topic_not_found" }),
        rewrites: DEFAULT_POLICY.budgets.maxRewrites - 1,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-topic-not-found",
    })
  })

  test("AC3 — does not search again once the rewrites are used up", () => {
    const action = decide(
      state({
        assessment: assessment({ choice: "topic_not_found" }),
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC3 — the rewrite budget comes from the configuration", () => {
    const twoRewrites: PolicyConfig = {
      ...DEFAULT_POLICY,
      budgets: { ...DEFAULT_POLICY.budgets, maxRewrites: 2 },
    }
    const s = state({
      assessment: assessment({ choice: "topic_not_found" }),
      rewrites: 1,
    })
    expect(decide(s, twoRewrites).rule).toBe("rewrite-topic-not-found")
    expect(decide(s, DEFAULT_POLICY).rule).toBe("answer-best-effort")
  })

  test("AC3 — other missing choices do not trigger a search when chunks are relevant", () => {
    for (const choice of MISSING.filter((m) => m !== "topic_not_found")) {
      const action = decide(
        state({ assessment: assessment({ choice }) }),
        DEFAULT_POLICY
      )
      expect(action.type).toBe("answer")
      expect(action.rule).toBe("answer-best-effort")
    }
  })

  test("AC3 — wins over rewrite-nothing-relevant when both apply", () => {
    const action = decide(
      state({
        assessment: assessment({ choice: "topic_not_found" }),
        relevantCount: 0,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-topic-not-found",
    })
  })

  test("AC3 — wins over abstaining only while a rewrite remains", () => {
    const action = decide(
      state({
        assessment: assessment({ choice: "topic_not_found" }),
        relevantCount: 0,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })
})

describe("AC4 — rewrite-nothing-relevant", () => {
  test("AC4 — searches again when no relevant chunk has been kept", () => {
    const action = decide(state({ relevantCount: 0 }), DEFAULT_POLICY)
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-nothing-relevant",
    })
  })

  test("AC4 — applies whatever the non-topic missing choice", () => {
    for (const choice of MISSING.filter((m) => m !== "topic_not_found")) {
      const action = decide(
        state({ assessment: assessment({ choice }), relevantCount: 0 }),
        DEFAULT_POLICY
      )
      expect(action).toMatchObject({
        type: "rewrite",
        rule: "rewrite-nothing-relevant",
      })
    }
  })

  test("AC4 — searches again on the last rewrite available", () => {
    const action = decide(
      state({
        relevantCount: 0,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites - 1,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-nothing-relevant",
    })
  })

  test("AC4 — does not apply as soon as one relevant chunk was kept", () => {
    const action = decide(state({ relevantCount: 1 }), DEFAULT_POLICY)
    expect(action.type).not.toBe("rewrite")
  })

  test("AC4 — still searches when hops are used up and nothing relevant was kept", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.99 } }),
        links: [link("l1", "next.md")],
        relevantCount: 0,
        hops: DEFAULT_POLICY.budgets.maxHops,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "rewrite",
      rule: "rewrite-nothing-relevant",
    })
  })
})

describe("AC5 — abstain-nothing-relevant", () => {
  test("AC5 — abstains when nothing is relevant and no rewrite remains", () => {
    const action = decide(
      state({
        relevantCount: 0,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC5 — abstains with a zero rewrite budget", () => {
    const noRewrites: PolicyConfig = {
      ...DEFAULT_POLICY,
      budgets: { ...DEFAULT_POLICY.budgets, maxRewrites: 0 },
    }
    const action = decide(state({ relevantCount: 0 }), noRewrites)
    expect(action).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC5 — abstains with hops used up as well", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.99 } }),
        links: [link("l1", "next.md")],
        relevantCount: 0,
        hops: DEFAULT_POLICY.budgets.maxHops,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "abstain",
      rule: "abstain-nothing-relevant",
    })
  })

  test("AC5 — does not abstain when some chunk is relevant", () => {
    const action = decide(
      state({
        relevantCount: 1,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("abstain")
  })
})

describe("AC6 — answer-best-effort", () => {
  test("AC6 — answers with what was found when nothing else applies", () => {
    const action = decide(state(), DEFAULT_POLICY)
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC6 — answers when the only links are below the threshold", () => {
    const action = decide(
      state({
        assessment: assessment({ links: { l1: 0.3 } }),
        links: [link("l1", "next.md")],
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC6 — answers when everything is used up but some chunks are relevant", () => {
    const action = decide(
      state({
        assessment: assessment({
          choice: "topic_not_found",
          links: { l1: 0.99 },
        }),
        links: [link("l1", "next.md")],
        hops: DEFAULT_POLICY.budgets.maxHops,
        rewrites: DEFAULT_POLICY.budgets.maxRewrites,
      }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })

  test("AC6 — answers when there is no visible link at all", () => {
    const action = decide(state({ links: [] }), DEFAULT_POLICY)
    expect(action).toMatchObject({
      type: "answer",
      rule: "answer-best-effort",
    })
  })
})

describe("AC7 — configuration", () => {
  test("AC7 — DEFAULT_POLICY holds the specified thresholds and budgets", () => {
    expect(DEFAULT_POLICY).toEqual({
      thresholds: { relevance: 0.5, sufficient: 0.7, link: 0.5 },
      budgets: { maxHops: 3, maxRewrites: 1, maxChunks: 12 },
    })
  })

  test("AC7 — RULES lists the six rule ids in priority order", () => {
    expect([...RULES]).toEqual([
      "sufficient",
      "follow-link",
      "rewrite-topic-not-found",
      "rewrite-nothing-relevant",
      "abstain-nothing-relevant",
      "answer-best-effort",
    ])
  })

  test("AC7 — every action names a rule from RULES", () => {
    const states = [
      state({ assessment: assessment({ sufficient: 0.9 }) }),
      state({
        assessment: assessment({ links: { l1: 0.9 } }),
        links: [link("l1", "next.md")],
      }),
      state({ assessment: assessment({ choice: "topic_not_found" }) }),
      state({ relevantCount: 0 }),
      state({ relevantCount: 0, rewrites: 1 }),
      state(),
    ]
    const rules = states.map((s) => decide(s, DEFAULT_POLICY).rule)
    for (const rule of rules) expect(RULES).toContain(rule)
    expect(rules).toEqual([...RULES])
  })

  test("AC7 — the relevance threshold and chunk budget do not change decide", () => {
    const other: PolicyConfig = {
      thresholds: { ...DEFAULT_POLICY.thresholds, relevance: 0.99 },
      budgets: { ...DEFAULT_POLICY.budgets, maxChunks: 1 },
    }
    const states = [
      state(),
      state({ relevantCount: 0 }),
      state({ assessment: assessment({ sufficient: 0.8 }) }),
      state({
        assessment: assessment({ links: { l1: 0.8 } }),
        links: [link("l1", "next.md")],
      }),
    ]
    for (const s of states) {
      expect(decide(s, other)).toEqual(decide(s, DEFAULT_POLICY))
    }
  })
})

describe("AC8 — purity", () => {
  const busy = (): LoopState =>
    state({
      assessment: assessment({
        sufficient: 0.4,
        choice: "topic_not_found",
        links: { "link-b": 0.8, "link-a": 0.8, "link-c": 0.2 },
      }),
      links: [
        link("link-b", "b.md"),
        link("link-a", "a.md"),
        link("link-c", "c.md"),
      ],
      contextNotes: ["start.md", "b.md"],
    })

  test("AC8 — does not modify the state or the configuration", () => {
    const s = busy()
    const config = structuredClone(DEFAULT_POLICY)
    const stateBefore = structuredClone(s)
    const configBefore = structuredClone(config)
    decide(s, config)
    expect(s).toEqual(stateBefore)
    expect(config).toEqual(configBefore)
  })

  test("AC8 — works on deeply frozen inputs", () => {
    const s = deepFreeze(busy())
    const config = deepFreeze(structuredClone(DEFAULT_POLICY))
    expect(() => decide(s, config)).not.toThrow()
    expect(decide(s, config)).toMatchObject({
      type: "follow",
      rule: "follow-link",
    })
  })

  test("AC8 — returns the same action for the same inputs", () => {
    const s = busy()
    expect(decide(s, DEFAULT_POLICY)).toEqual(decide(s, DEFAULT_POLICY))
    expect(decide(busy(), DEFAULT_POLICY)).toEqual(
      decide(busy(), DEFAULT_POLICY)
    )
  })

  test("AC8 — does not depend on the order of the visible links", () => {
    const s = busy()
    const reversed: LoopState = { ...s, links: [...s.links].reverse() }
    expect(decide(reversed, DEFAULT_POLICY)).toEqual(decide(s, DEFAULT_POLICY))
  })

  test("AC8 — does not keep state between calls", () => {
    const first = decide(state({ relevantCount: 0 }), DEFAULT_POLICY)
    decide(
      state({ assessment: assessment({ sufficient: 0.9 }) }),
      DEFAULT_POLICY
    )
    const again = decide(state({ relevantCount: 0 }), DEFAULT_POLICY)
    expect(again).toEqual(first)
  })
})
