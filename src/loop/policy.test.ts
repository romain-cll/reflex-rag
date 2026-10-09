import { describe, expect, test } from "bun:test"
import type { Verdict } from "../core/judge.ts"
import {
  DEFAULT_POLICY,
  RULES,
  decide,
  type JudgedNote,
  type LoopState,
  type PolicyConfig,
} from "./policy.ts"

/**
 * A judged note. By default it is a dead end for every rule: `none` verdict,
 * links not opened yet and some unjudged link (so it is openable).
 */
function note(
  path: string,
  verdict: Partial<Record<Verdict, number>> = {},
  overrides: { expanded?: boolean; hasUnjudgedLinks?: boolean } = {}
): JudgedNote {
  return {
    path,
    verdict: { answer: 0, step: 0, none: 1, ...verdict },
    expanded: overrides.expanded ?? false,
    hasUnjudgedLinks: overrides.hasUnjudgedLinks ?? true,
  }
}

function state(
  notes: JudgedNote[],
  overrides: Partial<Omit<LoopState, "notes">> = {}
): LoopState {
  return { notes, hops: 0, rewrites: 0, ...overrides }
}

function withConfig(
  thresholds: Partial<PolicyConfig["thresholds"]> = {},
  budgets: Partial<PolicyConfig["budgets"]> = {}
): PolicyConfig {
  return {
    thresholds: { ...DEFAULT_POLICY.thresholds, ...thresholds },
    budgets: { ...DEFAULT_POLICY.budgets, ...budgets },
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

const MAX_HOPS = DEFAULT_POLICY.budgets.maxHops
const MAX_REWRITES = DEFAULT_POLICY.budgets.maxRewrites

describe("AC1 — follow-steps", () => {
  test("AC1 — opens a step note and carries its path", () => {
    const action = decide(
      state([note("a.md", { step: 0.8, none: 0.2 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC1 — opens all the step notes, not only the best one", () => {
    const action = decide(
      state([
        note("a.md", { step: 0.6 }),
        note("b.md", { step: 0.9 }),
        note("c.md", { step: 0.7 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "expand", rule: "follow-steps" })
    expect(action).toHaveProperty("paths")
    expect((action as { paths: string[] }).paths).toHaveLength(3)
  })

  test("AC1 — orders the paths by decreasing step probability", () => {
    const action = decide(
      state([
        note("a.md", { step: 0.6 }),
        note("b.md", { step: 0.9 }),
        note("c.md", { step: 0.7 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["b.md", "c.md", "a.md"],
    })
  })

  test("AC1 — ties on step go by order of judgement", () => {
    const action = decide(
      state([
        note("z.md", { step: 0.7 }),
        note("a.md", { step: 0.9 }),
        note("m.md", { step: 0.7 }),
        note("b.md", { step: 0.7 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md", "z.md", "m.md", "b.md"],
    })
  })

  test("AC1 — leaves out the notes below the step threshold", () => {
    const action = decide(
      state([
        note("low.md", { step: 0.3 }),
        note("high.md", { step: 0.8 }),
        note("mid.md", { step: 0.49 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["high.md"],
    })
  })

  test("AC1 — opens a step note at exactly the step threshold (≥ applies)", () => {
    const action = decide(
      state([note("a.md", { step: 0.5, none: 0.5 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC1 — does not open a step note just under the step threshold", () => {
    const action = decide(
      state([note("a.md", { step: 0.4999, none: 0.5001 })]),
      DEFAULT_POLICY
    )
    expect(action.rule).not.toBe("follow-steps")
    expect(action.type).not.toBe("expand")
  })

  test("AC1 — uses the step threshold of the configuration", () => {
    const s = state([note("a.md", { step: 0.6 })])
    expect(decide(s, withConfig({ step: 0.8 })).rule).not.toBe("follow-steps")
    expect(decide(s, withConfig({ step: 0.3 }))).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC1 — opens a step note even when another note is kept", () => {
    const action = decide(
      state([note("kept.md", { answer: 0.9 }), note("step.md", { step: 0.8 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["step.md"],
    })
  })

  test("AC1 — a note both kept and step is opened", () => {
    const action = decide(
      state([note("both.md", { answer: 0.6, step: 0.6 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["both.md"],
    })
  })

  test("AC1 — skips a step note already expanded", () => {
    const action = decide(
      state([
        note("done.md", { step: 0.95 }, { expanded: true }),
        note("open.md", { step: 0.6 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["open.md"],
    })
  })

  test("AC1 — skips a step note with no unjudged link", () => {
    const action = decide(
      state([
        note("closed.md", { step: 0.95 }, { hasUnjudgedLinks: false }),
        note("open.md", { step: 0.6 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["open.md"],
    })
  })

  test("AC1 — does not apply when the only step notes are expanded or have no unjudged link", () => {
    const action = decide(
      state([
        note("done.md", { step: 0.95 }, { expanded: true }),
        note("closed.md", { step: 0.95 }, { hasUnjudgedLinks: false }),
      ]),
      DEFAULT_POLICY
    )
    expect(action.rule).not.toBe("follow-steps")
    expect(action.type).not.toBe("expand")
  })

  test("AC1 — applies on the last hop available", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 })], { hops: MAX_HOPS - 1 }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "expand", rule: "follow-steps" })
  })

  test("AC1 — does not apply once the hops are used up", () => {
    const action = decide(
      state([note("a.md", { step: 0.99 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action.rule).not.toBe("follow-steps")
    expect(action.type).not.toBe("expand")
  })

  test("AC1 — the hop budget comes from the configuration", () => {
    const s = state([note("a.md", { step: 0.99 })], { hops: 1 })
    expect(decide(s, withConfig({}, { maxHops: 1 })).rule).not.toBe(
      "follow-steps"
    )
    expect(decide(s, withConfig({}, { maxHops: 2 })).rule).toBe("follow-steps")
  })

  test("AC1 — a zero hop budget never opens anything", () => {
    const action = decide(
      state([note("a.md", { step: 0.99 })]),
      withConfig({}, { maxHops: 0 })
    )
    expect(action.type).not.toBe("expand")
  })

  test("AC1 — the explore budget does not cap follow-steps", () => {
    const notes = ["a", "b", "c", "d", "e"].map((p) =>
      note(`${p}.md`, { step: 0.9 })
    )
    const action = decide(state(notes), withConfig({}, { explore: 2 }))
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md", "b.md", "c.md", "d.md", "e.md"],
    })
  })
})

describe("AC2 — answer", () => {
  test("AC2 — answers when a note is kept", () => {
    const action = decide(
      state([note("a.md", { answer: 0.9 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — answers at exactly the answer threshold (≥ applies)", () => {
    const action = decide(
      state([note("a.md", { answer: 0.5, none: 0.5 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — does not answer just under the answer threshold", () => {
    const action = decide(
      state([note("a.md", { answer: 0.4999, none: 0.5001 })]),
      DEFAULT_POLICY
    )
    expect(action.rule).not.toBe("answer")
    expect(action.type).not.toBe("answer")
  })

  test("AC2 — uses the answer threshold of the configuration", () => {
    const s = state([note("a.md", { answer: 0.6 })])
    expect(decide(s, withConfig({ answer: 0.8 })).type).not.toBe("answer")
    expect(decide(s, withConfig({ answer: 0.3 }))).toEqual({
      type: "answer",
      rule: "answer",
    })
  })

  test("AC2 — one kept note among others is enough", () => {
    const action = decide(
      state([
        note("a.md", { answer: 0.1 }),
        note("b.md", { answer: 0.7 }),
        note("c.md", { answer: 0.2 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a kept note answers before explore", () => {
    const action = decide(
      state([
        note("kept.md", { answer: 0.8 }, { expanded: true }),
        note("maybe.md", { answer: 0.4, step: 0.1 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a kept note answers even with no openable note and no budget left", () => {
    const action = decide(
      state([note("a.md", { answer: 0.9 }, { hasUnjudgedLinks: false })], {
        hops: MAX_HOPS,
        rewrites: MAX_REWRITES,
      }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a kept note answers when the hops are used up, despite a step note", () => {
    const action = decide(
      state(
        [note("kept.md", { answer: 0.9 }), note("step.md", { step: 0.9 })],
        {
          hops: MAX_HOPS,
        }
      ),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a kept note that is expanded still counts", () => {
    const action = decide(
      state([note("a.md", { answer: 0.9 }, { expanded: true })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })
})

describe("AC3 — explore", () => {
  test("AC3 — opens the openable notes when no note is kept and no note is a step", () => {
    const action = decide(
      state([note("a.md", { answer: 0.3, none: 0.7 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
  })

  test("AC3 — ranks by decreasing answer + step", () => {
    const action = decide(
      state([
        note("a.md", { answer: 0.1, step: 0.2 }),
        note("b.md", { answer: 0.3, step: 0.1 }),
        note("c.md", { answer: 0.2, step: 0.4 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["c.md", "b.md", "a.md"],
    })
  })

  test("AC3 — the sum counts, not answer or step alone", () => {
    const action = decide(
      state([
        note("answer-only.md", { answer: 0.45 }),
        note("mixed.md", { answer: 0.3, step: 0.4 }),
        note("step-only.md", { step: 0.4 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["mixed.md", "answer-only.md", "step-only.md"],
    })
  })

  test("AC3 — ties on answer + step go by order of judgement", () => {
    const action = decide(
      state([
        note("z.md", { answer: 0.25, step: 0.25 }),
        note("a.md", { answer: 0.4, step: 0.05 }),
        note("m.md", { answer: 0.1, step: 0.4 }),
        note("top.md", { answer: 0.3, step: 0.3 }),
      ]),
      withConfig({}, { explore: 4 })
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["top.md", "z.md", "m.md", "a.md"],
    })
  })

  test("AC3 — opens at most the explore budget, keeping the best", () => {
    const notes = [
      note("n1.md", { answer: 0.05 }),
      note("n2.md", { answer: 0.4 }),
      note("n3.md", { answer: 0.1 }),
      note("n4.md", { answer: 0.3 }),
      note("n5.md", { answer: 0.2 }),
    ]
    const action = decide(state(notes), DEFAULT_POLICY)
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["n2.md", "n4.md", "n5.md"],
    })
  })

  test("AC3 — the explore budget comes from the configuration", () => {
    const notes = [
      note("a.md", { answer: 0.4 }),
      note("b.md", { answer: 0.3 }),
      note("c.md", { answer: 0.2 }),
    ]
    expect(decide(state(notes), withConfig({}, { explore: 1 }))).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
    expect(decide(state(notes), withConfig({}, { explore: 2 }))).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md", "b.md"],
    })
  })

  test("AC3 — the explore budget cuts ties by order of judgement", () => {
    const notes = [
      note("a.md", { answer: 0.2 }),
      note("b.md", { answer: 0.2 }),
      note("c.md", { answer: 0.2 }),
      note("d.md", { answer: 0.2 }),
    ]
    const action = decide(state(notes), withConfig({}, { explore: 2 }))
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md", "b.md"],
    })
  })

  test("AC3 — opens fewer notes than the budget when fewer are openable", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 }), note("b.md", { answer: 0.1 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md", "b.md"],
    })
  })

  test("AC3 — opens a note whose verdict is all none (it is ranked, not filtered)", () => {
    const action = decide(state([note("a.md")]), DEFAULT_POLICY)
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
  })

  test("AC3 — skips expanded notes", () => {
    const action = decide(
      state([
        note("done.md", { answer: 0.45 }, { expanded: true }),
        note("open.md", { answer: 0.1 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["open.md"],
    })
  })

  test("AC3 — skips notes with no unjudged link", () => {
    const action = decide(
      state([
        note("closed.md", { answer: 0.45 }, { hasUnjudgedLinks: false }),
        note("open.md", { answer: 0.1 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["open.md"],
    })
  })

  test("AC3 — skipped notes do not use up the explore budget", () => {
    const action = decide(
      state(
        [
          note("done1.md", { answer: 0.45 }, { expanded: true }),
          note("closed.md", { answer: 0.44 }, { hasUnjudgedLinks: false }),
          note("a.md", { answer: 0.2 }),
          note("b.md", { answer: 0.1 }),
        ],
        {}
      ),
      withConfig({}, { explore: 2 })
    )
    expect(action).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md", "b.md"],
    })
  })

  test("AC3 — applies on the last hop available", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 })], { hops: MAX_HOPS - 1 }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "expand", rule: "explore" })
  })

  test("AC3 — does not apply once the hops are used up", () => {
    const action = decide(
      state([note("a.md", { answer: 0.3 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("expand")
    expect(action.rule).not.toBe("explore")
  })

  test("AC3 — does not apply when no note is openable", () => {
    const action = decide(
      state([
        note("done.md", { answer: 0.3 }, { expanded: true }),
        note("closed.md", { answer: 0.3 }, { hasUnjudgedLinks: false }),
      ]),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("expand")
    expect(action.rule).not.toBe("explore")
  })

  test("AC3 — does not apply when there is no note at all", () => {
    const action = decide(state([]), DEFAULT_POLICY)
    expect(action.type).not.toBe("expand")
  })

  test("AC3 — explore wins over rewrite while hops remain and a note is openable", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 })]),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "expand", rule: "explore" })
  })

  test("AC3 — a zero explore budget opens nothing and falls through to rewrite", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 })]),
      withConfig({}, { explore: 0 })
    )
    expect(action).toEqual({ type: "rewrite", rule: "rewrite" })
  })
})

describe("AC4 — rewrite", () => {
  test("AC4 — searches again when there is no note at all", () => {
    expect(decide(state([]), DEFAULT_POLICY)).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
  })

  test("AC4 — searches again when no note is kept and none is openable", () => {
    const action = decide(
      state([
        note("a.md", { answer: 0.2 }, { expanded: true }),
        note("b.md", { answer: 0.2 }, { hasUnjudgedLinks: false }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "rewrite", rule: "rewrite" })
  })

  test("AC4 — searches again when the hops are used up and no note is kept", () => {
    const action = decide(
      state([note("a.md", { answer: 0.3, step: 0.9 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "rewrite", rule: "rewrite" })
  })

  test("AC4 — searches again on the last rewrite available", () => {
    const action = decide(
      state([], { rewrites: MAX_REWRITES - 1 }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "rewrite", rule: "rewrite" })
  })

  test("AC4 — does not search again once the rewrites are used up", () => {
    const action = decide(state([], { rewrites: MAX_REWRITES }), DEFAULT_POLICY)
    expect(action.type).not.toBe("rewrite")
  })

  test("AC4 — the rewrite budget comes from the configuration", () => {
    const s = state([], { rewrites: 1 })
    expect(decide(s, withConfig({}, { maxRewrites: 2 }))).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(decide(s, withConfig({}, { maxRewrites: 1 })).type).not.toBe(
      "rewrite"
    )
  })

  test("AC4 — does not apply when a note is kept", () => {
    const action = decide(
      state([note("a.md", { answer: 0.9 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("rewrite")
  })
})

describe("AC5 — abstain", () => {
  test("AC5 — abstains when nothing is kept, nothing is openable and no rewrite is left", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 }, { expanded: true })], {
        rewrites: MAX_REWRITES,
      }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — abstains when there is no note and no rewrite is left", () => {
    const action = decide(state([], { rewrites: MAX_REWRITES }), DEFAULT_POLICY)
    expect(action).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — abstains when the hops are used up and no rewrite is left", () => {
    const action = decide(
      state([note("a.md", { answer: 0.4, step: 0.9 })], {
        hops: MAX_HOPS,
        rewrites: MAX_REWRITES,
      }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — abstains with a zero rewrite budget", () => {
    const action = decide(state([]), withConfig({}, { maxRewrites: 0 }))
    expect(action).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — abstains with every budget at zero", () => {
    const action = decide(
      state([note("a.md", { answer: 0.4, step: 0.9 })]),
      withConfig({}, { maxHops: 0, maxRewrites: 0, explore: 0 })
    )
    expect(action).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC5 — does not abstain when a note is kept, even with every budget used up", () => {
    const action = decide(
      state([note("a.md", { answer: 0.9 })], {
        hops: MAX_HOPS,
        rewrites: MAX_REWRITES,
      }),
      DEFAULT_POLICY
    )
    expect(action.type).not.toBe("abstain")
  })

  test("AC5 — does not abstain while a note can be opened", () => {
    const action = decide(
      state([note("a.md", { answer: 0.2 })], { rewrites: MAX_REWRITES }),
      DEFAULT_POLICY
    )
    expect(action.type).toBe("expand")
  })
})

describe("AC6 — configuration", () => {
  test("AC6 — DEFAULT_POLICY holds the specified thresholds and budgets", () => {
    expect(DEFAULT_POLICY).toEqual({
      thresholds: { answer: 0.5, step: 0.5 },
      budgets: { maxHops: 2, maxRewrites: 1, explore: 3, maxNotes: 5 },
    })
  })

  test("AC6 — RULES lists the five rule ids in priority order", () => {
    expect([...RULES]).toEqual([
      "follow-steps",
      "answer",
      "explore",
      "rewrite",
      "abstain",
    ])
  })

  test("AC6 — every action names a rule from RULES, and each rule is reachable", () => {
    const states: [LoopState, PolicyConfig][] = [
      [state([note("a.md", { step: 0.9 })]), DEFAULT_POLICY],
      [state([note("a.md", { answer: 0.9 })]), DEFAULT_POLICY],
      [state([note("a.md", { answer: 0.2 })]), DEFAULT_POLICY],
      [state([]), DEFAULT_POLICY],
      [state([], { rewrites: MAX_REWRITES }), DEFAULT_POLICY],
    ]
    const rules = states.map(([s, c]) => decide(s, c).rule)
    for (const rule of rules) expect(RULES).toContain(rule)
    expect(rules).toEqual([...RULES])
  })

  test("AC6 — the context budget does not change decide", () => {
    const states = [
      state([note("a.md", { step: 0.9 })]),
      state([note("a.md", { answer: 0.9 })]),
      state([note("a.md", { answer: 0.2 })]),
      state([]),
      state([], { rewrites: MAX_REWRITES }),
    ]
    for (const s of states) {
      expect(decide(s, withConfig({}, { maxNotes: 1 }))).toEqual(
        decide(s, DEFAULT_POLICY)
      )
      expect(decide(s, withConfig({}, { maxNotes: 50 }))).toEqual(
        decide(s, DEFAULT_POLICY)
      )
    }
  })
})

describe("AC7 — purity", () => {
  const busy = (): LoopState =>
    state(
      [
        note("kept.md", { answer: 0.6, step: 0.2 }, { expanded: true }),
        note("b.md", { step: 0.8 }),
        note("a.md", { step: 0.8 }),
        note("c.md", { step: 0.6 }),
        note("d.md", { answer: 0.1 }, { hasUnjudgedLinks: false }),
      ],
      { hops: 1, rewrites: 0 }
    )

  test("AC7 — does not modify the state or the configuration", () => {
    const s = busy()
    const config = structuredClone(DEFAULT_POLICY)
    const stateBefore = structuredClone(s)
    const configBefore = structuredClone(config)
    decide(s, config)
    expect(s).toEqual(stateBefore)
    expect(config).toEqual(configBefore)
  })

  test("AC7 — works on deeply frozen inputs", () => {
    const s = deepFreeze(busy())
    const config = deepFreeze(structuredClone(DEFAULT_POLICY))
    expect(() => decide(s, config)).not.toThrow()
    expect(decide(s, config)).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["b.md", "a.md", "c.md"],
    })
  })

  test("AC7 — works on deeply frozen inputs when exploring", () => {
    const s = deepFreeze(
      state([note("x.md", { answer: 0.2 }), note("y.md", { answer: 0.3 })])
    )
    const config = deepFreeze(structuredClone(DEFAULT_POLICY))
    expect(decide(s, config)).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["y.md", "x.md"],
    })
  })

  test("AC7 — does not reorder state.notes", () => {
    const s = state([
      note("z.md", { answer: 0.1 }),
      note("a.md", { answer: 0.4 }),
      note("m.md", { answer: 0.2 }),
    ])
    decide(s, DEFAULT_POLICY)
    expect(s.notes.map((n) => n.path)).toEqual(["z.md", "a.md", "m.md"])
  })

  test("AC7 — returns the same action for the same inputs", () => {
    const s = busy()
    expect(decide(s, DEFAULT_POLICY)).toEqual(decide(s, DEFAULT_POLICY))
    expect(decide(busy(), DEFAULT_POLICY)).toEqual(
      decide(busy(), DEFAULT_POLICY)
    )
  })

  test("AC7 — does not keep state between calls", () => {
    const first = decide(state([]), DEFAULT_POLICY)
    decide(state([note("a.md", { answer: 0.9 })]), DEFAULT_POLICY)
    decide(state([note("a.md", { step: 0.9 })]), DEFAULT_POLICY)
    const again = decide(state([]), DEFAULT_POLICY)
    expect(again).toEqual(first)
  })

  test("AC7 — the returned paths are not shared with the state", () => {
    const s = state([note("a.md", { step: 0.9 })])
    const first = decide(s, DEFAULT_POLICY) as { paths: string[] }
    first.paths.push("tampered.md")
    const second = decide(s, DEFAULT_POLICY) as { paths: string[] }
    expect(second.paths).toEqual(["a.md"])
  })
})
