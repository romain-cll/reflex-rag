import { describe, expect, test } from "bun:test"
import type { Verdict } from "../core/judge.ts"
import {
  DEFAULT_POLICY,
  RULES,
  decide,
  type Action,
  type JudgedNote,
  type LoopState,
  type PolicyConfig,
} from "./policy.ts"
// A namespace import: `keepScore` and `POLICIES.C.thresholds.keep` are not
// implemented yet, which fails their own tests, not the whole file.
import * as policyModule from "./policy.ts"

/** `keepScore` read through the namespace, typed by the spec (not exported yet). */
const keepScore = (
  policyModule as unknown as {
    keepScore: (
      verdict: Record<Verdict, number>,
      config: PolicyConfig
    ) => number
  }
).keepScore

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

/**
 * A configuration whose thresholds are `thresholds` over the default ones,
 * whatever their names (`sufficient` is not in `PolicyConfig` yet).
 */
function withAnyThresholds(
  thresholds: Record<string, number>,
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
    // Nothing is kept and the note is openable, so `explore` opens it instead.
    expect(action).toEqual({ type: "expand", rule: "explore", paths: ["a.md"] })
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

  test("AC1 — does not apply when the only step notes are expanded or have no unjudged link (they are kept: the policy answers)", () => {
    const action = decide(
      state([
        note("done.md", { step: 0.95 }, { expanded: true }),
        note("closed.md", { step: 0.95 }, { hasUnjudgedLinks: false }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC1 — applies on the last hop available", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 })], { hops: MAX_HOPS - 1 }),
      DEFAULT_POLICY
    )
    expect(action).toMatchObject({ type: "expand", rule: "follow-steps" })
  })

  test("AC1 — does not apply once the hops are used up (the step note is kept: the policy answers)", () => {
    const action = decide(
      state([note("a.md", { step: 0.99 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC1 — the hop budget comes from the configuration", () => {
    const s = state([note("a.md", { step: 0.99 })], { hops: 1 })
    expect(decide(s, withConfig({}, { maxHops: 1 })).rule).not.toBe(
      "follow-steps"
    )
    expect(decide(s, withConfig({}, { maxHops: 2 })).rule).toBe("follow-steps")
  })

  test("AC1 — a zero hop budget never opens anything (the step note is kept: the policy answers)", () => {
    const action = decide(
      state([note("a.md", { step: 0.99 })]),
      withConfig({}, { maxHops: 0 })
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
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

describe("AC2 — answer, step notes are kept (Revision 3)", () => {
  test("AC2 — a step note that cannot be opened (no unjudged link) is kept: answers", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 }, { hasUnjudgedLinks: false })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a step note already expanded is kept: answers", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 }, { expanded: true })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a step note with the hops exhausted is kept: answers", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 })], { hops: MAX_HOPS }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a step note answers even with no rewrite left and nothing else to open", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 }, { hasUnjudgedLinks: false })], {
        hops: MAX_HOPS,
        rewrites: MAX_REWRITES,
      }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — answers at exactly the step threshold (≥ applies) when the note cannot be opened", () => {
    const action = decide(
      state([note("a.md", { step: 0.5, none: 0.5 }, { expanded: true })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — an openable step note with hops left is still opened first (follow-steps)", () => {
    const action = decide(state([note("a.md", { step: 0.8 })]), DEFAULT_POLICY)
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["a.md"],
    })
  })

  test("AC2 — uses the step threshold of the configuration to keep a step note", () => {
    const s = state([note("a.md", { step: 0.6 }, { hasUnjudgedLinks: false })])
    expect(decide(s, withConfig({ step: 0.3 }))).toEqual({
      type: "answer",
      rule: "answer",
    })
    expect(decide(s, withConfig({ step: 0.8 })).type).not.toBe("answer")
  })

  test("AC2 — a kept step note answers before explore, even with an openable note left", () => {
    const action = decide(
      state(
        [
          note("step.md", { step: 0.9 }, { hasUnjudgedLinks: false }),
          note("maybe.md", { answer: 0.4, step: 0.1 }),
        ],
        { hops: 1 }
      ),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a kept step note answers before rewrite", () => {
    const action = decide(
      state([note("step.md", { step: 0.9 }, { expanded: true })], {
        hops: MAX_HOPS,
      }),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("AC2 — a step note just under the step threshold with an answer just under is not kept: explores", () => {
    const action = decide(
      state([note("a.md", { answer: 0.4999, step: 0.4999, none: 0.0002 })]),
      DEFAULT_POLICY
    )
    expect(action).toEqual({ type: "expand", rule: "explore", paths: ["a.md"] })
  })

  test("AC2 — neither threshold reached and nothing openable: rewrites, then abstains", () => {
    const notes = [
      note("a.md", { answer: 0.4999, step: 0.4999 }, { expanded: true }),
    ]
    expect(decide(state(notes), DEFAULT_POLICY)).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(
      decide(state(notes, { rewrites: MAX_REWRITES }), DEFAULT_POLICY)
    ).toEqual({
      type: "abstain",
      rule: "abstain",
    })
  })

  test("AC2 — neither threshold reached with the hops exhausted: rewrites, then abstains", () => {
    const notes = [note("a.md", { answer: 0.4999, step: 0.4999 })]
    expect(decide(state(notes, { hops: MAX_HOPS }), DEFAULT_POLICY)).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(
      decide(
        state(notes, { hops: MAX_HOPS, rewrites: MAX_REWRITES }),
        DEFAULT_POLICY
      )
    ).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("AC2 — explore, rewrite and abstain apply only when neither an answer note nor a step note is kept", () => {
    const keptByAnswer = note("k.md", { answer: 0.5 }, { expanded: true })
    const keptByStep = note("k.md", { step: 0.5 }, { expanded: true })
    const dead = note("d.md", { answer: 0.3, step: 0.3 }, { expanded: true })
    const budgets = [
      state([dead]),
      state([dead], { hops: MAX_HOPS }),
      state([dead], { hops: MAX_HOPS, rewrites: MAX_REWRITES }),
    ]
    for (const withoutKept of budgets) {
      const base = decide(withoutKept, DEFAULT_POLICY)
      expect(["rewrite", "abstain"]).toContain(base.rule)
      for (const kept of [keptByAnswer, keptByStep]) {
        const action = decide(
          { ...withoutKept, notes: [...withoutKept.notes, kept] },
          DEFAULT_POLICY
        )
        expect(action).toEqual({ type: "answer", rule: "answer" })
      }
    }
    const openable = state([note("o.md", { answer: 0.3, step: 0.3 })])
    expect(decide(openable, DEFAULT_POLICY).rule).toBe("explore")
    expect(
      decide(
        { ...openable, notes: [...openable.notes, keptByStep] },
        DEFAULT_POLICY
      )
    ).toEqual({ type: "answer", rule: "answer" })
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
      state([note("a.md", { answer: 0.3, step: 0.49 })], { hops: MAX_HOPS }),
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
      state([note("a.md", { answer: 0.4, step: 0.49 })], {
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
      state([note("a.md", { answer: 0.4, step: 0.49 })]),
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

  test("AC6, decision-policy AC11 — RULES lists the six rule ids in priority order", () => {
    expect([...RULES]).toEqual([
      "follow-steps",
      "follow-kept",
      "answer",
      "explore",
      "rewrite",
      "abstain",
    ])
  })

  test("AC6 — every action names a rule from RULES, and each rule is reachable", () => {
    const lowSufficiency = { sufficient: 0.1 }
    const states: [LoopState, PolicyConfig][] = [
      [state([note("a.md", { step: 0.9 })]), DEFAULT_POLICY],
      [
        { ...state([note("a.md", { answer: 0.9 })]), ...lowSufficiency },
        withAnyThresholds({ sufficient: 0.5 }),
      ],
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

describe("decision-policy AC8 — keep threshold (Revision 4)", () => {
  /** C's thresholds: neither 0.7 is reached by a split verdict, but the sum may reach 0.9. */
  const KEEP = { answer: 0.7, step: 0.7, keep: 0.9 }
  const withKeep = (budgets: Partial<PolicyConfig["budgets"]> = {}) =>
    withConfig(KEEP, budgets)
  const verdict = (answer: number, step: number) => ({
    answer,
    step,
    none: 1 - answer - step,
  })

  test("decision-policy AC8 — isKept keeps a note whose answer + step reaches keep, though neither reaches its threshold (0.53 + 0.44)", () => {
    expect(policyModule.isKept(verdict(0.53, 0.44), withKeep())).toBe(true)
  })

  test("decision-policy AC8 — isKept does not keep a note whose answer + step is under keep (0.5 + 0.39)", () => {
    expect(policyModule.isKept(verdict(0.5, 0.39), withKeep())).toBe(false)
  })

  test("decision-policy AC8 — isKept keeps at exactly keep (≥ applies) and not just under it", () => {
    const config = withConfig({ answer: 0.7, step: 0.7, keep: 0.875 })
    expect(policyModule.isKept(verdict(0.5, 0.375), config)).toBe(true)
    expect(policyModule.isKept(verdict(0.5, 0.3749), config)).toBe(false)
  })

  test("decision-policy AC8 — with keep set, answer + step replaces the answer-or-step definition: 0.75 + 0 is not kept at keep 0.9", () => {
    expect(policyModule.isKept(verdict(0.75, 0), withKeep())).toBe(false)
    expect(policyModule.isKept(verdict(0, 0.75), withKeep())).toBe(false)
    expect(policyModule.isKept(verdict(0.95, 0), withKeep())).toBe(true)
  })

  test("decision-policy AC8 — without keep the definition of Revision 3 applies", () => {
    const config = withConfig({ answer: 0.7, step: 0.7 })
    expect(policyModule.isKept(verdict(0.7, 0), config)).toBe(true)
    expect(policyModule.isKept(verdict(0, 0.7), config)).toBe(true)
    expect(policyModule.isKept(verdict(0.53, 0.44), config)).toBe(false)
  })

  test("decision-policy AC8 — a split note answers: kept by the sum, not a step note, nothing to open", () => {
    const action = decide(
      state([note("a.md", { answer: 0.53, step: 0.44 })]),
      withKeep()
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("decision-policy AC8 — the same split note does not answer without keep: it is explored", () => {
    const action = decide(
      state([note("a.md", { answer: 0.53, step: 0.44 })]),
      withConfig({ answer: 0.7, step: 0.7 })
    )
    expect(action).toEqual({ type: "expand", rule: "explore", paths: ["a.md"] })
  })

  test("decision-policy AC8 — a sum under keep is not kept: explores, then rewrites, then abstains", () => {
    const notes = [note("a.md", { answer: 0.5, step: 0.39 })]
    expect(decide(state(notes), withKeep())).toEqual({
      type: "expand",
      rule: "explore",
      paths: ["a.md"],
    })
    const closed = [
      note("a.md", { answer: 0.5, step: 0.39 }, { expanded: true }),
    ]
    expect(decide(state(closed), withKeep())).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(
      decide(state(closed, { rewrites: MAX_REWRITES }), withKeep())
    ).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("decision-policy AC8 — explore, rewrite and abstain apply only when nothing is kept by the sum", () => {
    const kept = note("k.md", { answer: 0.53, step: 0.44 }, { expanded: true })
    const dead = note("d.md", { answer: 0.3, step: 0.3 }, { expanded: true })
    for (const overrides of [
      {},
      { hops: MAX_HOPS },
      { hops: MAX_HOPS, rewrites: MAX_REWRITES },
    ]) {
      expect(decide(state([dead, kept], overrides), withKeep()).rule).toBe(
        "answer"
      )
    }
    const openable = note("o.md", { answer: 0.3, step: 0.3 })
    expect(decide(state([openable]), withKeep()).rule).toBe("explore")
    expect(decide(state([openable, kept]), withKeep()).rule).toBe("answer")
  })

  test("decision-policy AC8 — a kept note answers when no budget is left", () => {
    const action = decide(
      state([note("a.md", { answer: 0.53, step: 0.44 })], {
        hops: MAX_HOPS,
        rewrites: MAX_REWRITES,
      }),
      withKeep()
    )
    expect(action).toEqual({ type: "answer", rule: "answer" })
  })

  test("decision-policy AC8 — follow-steps still uses step ≥ thresholds.step, not the sum", () => {
    // A step note (step 0.8 ≥ the step threshold) is opened by follow-steps.
    const stepNote = decide(
      state([note("s.md", { answer: 0.1, step: 0.8 })]),
      withKeep()
    )
    expect(stepNote).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["s.md"],
    })
    // A kept split note whose step is under the step threshold: not opened.
    const split = decide(
      state([note("a.md", { answer: 0.5, step: 0.45 })]),
      withKeep()
    )
    expect(split).toEqual({ type: "answer", rule: "answer" })
  })

  test("decision-policy AC8 — a step note under keep, no longer openable, is not kept: rewrites", () => {
    const action = decide(
      // 0.05 + 0.8 < 0.9 (0.1 + 0.8 is exactly 0.9 in floating point, which is kept).
      state([note("s.md", { answer: 0.05, step: 0.8 }, { expanded: true })]),
      withKeep()
    )
    expect(action).toEqual({ type: "rewrite", rule: "rewrite" })
  })

  test("decision-policy AC8 — the order of follow-steps stays by decreasing step", () => {
    const action = decide(
      state([
        note("a.md", { answer: 0.1, step: 0.75 }),
        note("b.md", { answer: 0.05, step: 0.85 }),
        note("c.md", { answer: 0.5, step: 0.45 }),
      ]),
      withKeep()
    )
    expect(action).toEqual({
      type: "expand",
      rule: "follow-steps",
      paths: ["b.md", "a.md"],
    })
  })

  test("decision-policy AC8 — keepScore is answer + step when keep is set", () => {
    expect(keepScore(verdict(0.53, 0.44), withKeep())).toBeCloseTo(0.97, 10)
    expect(keepScore(verdict(0.5, 0.25), withKeep())).toBe(0.75)
  })

  test("decision-policy AC8 — keepScore is max(answer, step) when keep is unset", () => {
    const config = withConfig({ answer: 0.7, step: 0.7 })
    expect(keepScore(verdict(0.5, 0.25), config)).toBe(0.5)
    expect(keepScore(verdict(0.25, 0.5), config)).toBe(0.5)
    expect(keepScore(verdict(0.53, 0.44), DEFAULT_POLICY)).toBe(0.53)
  })

  test("decision-policy AC8 — POLICIES.C sets keep 0.9, B and DEFAULT_POLICY leave it unset", () => {
    // `strategy` is not in `PolicyConfig` yet: a variable avoids the literal check.
    const expectedC = {
      thresholds: { answer: 0.7, step: 0.7, keep: 0.9, sufficient: 0.5 },
      budgets: DEFAULT_POLICY.budgets,
      strategy: {
        openSteps: "above-best-answer",
        contextSteps: "linked",
      } as const,
    }
    expect(policyModule.POLICIES.C).toEqual(expectedC)
    expect(policyModule.POLICIES.C.thresholds.keep).toBe(0.9)
    expect("keep" in policyModule.POLICIES.B.thresholds).toBe(false)
    expect("keep" in DEFAULT_POLICY.thresholds).toBe(false)
  })

  test("decision-policy AC8 — decide with keep does not modify frozen inputs", () => {
    const s = deepFreeze(state([note("a.md", { answer: 0.53, step: 0.44 })]))
    const config = deepFreeze(structuredClone(withKeep()))
    expect(decide(s, config)).toEqual({ type: "answer", rule: "answer" })
  })
})

describe("decision-policy AC9 — strategy (Revision 5)", () => {
  type Strategy = {
    openSteps?: "always" | "above-best-answer"
    contextSteps?: "all" | "linked"
  }
  /** `strategy` is not in `PolicyConfig` yet: attached through a cast. */
  const withStrategy = (
    strategy: Strategy,
    thresholds: Partial<PolicyConfig["thresholds"]> = {
      answer: 0.7,
      step: 0.7,
    },
    budgets: Partial<PolicyConfig["budgets"]> = {}
  ): PolicyConfig => ({ ...withConfig(thresholds, budgets), strategy })
  const ABOVE: Strategy = { openSteps: "above-best-answer" }
  const above = (
    thresholds?: Partial<PolicyConfig["thresholds"]>,
    budgets?: Partial<PolicyConfig["budgets"]>
  ) => withStrategy(ABOVE, thresholds, budgets)

  const ANSWERED: Action = { type: "answer", rule: "answer" }
  const opens = (
    paths: string[],
    rule: "follow-steps" | "explore" = "follow-steps"
  ): Action => ({ type: "expand", rule, paths })

  test("decision-policy AC9 — an answer 0.86 and another openable note with step 0.93: opens it", () => {
    const action = decide(
      state([
        note("answer.md", { answer: 0.86, none: 0.14 }),
        note("step.md", { step: 0.93, none: 0.07 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["step.md"]))
  })

  test("decision-policy AC9 — an answer 0.86 and another openable note with step 0.80: nothing is opened, answers", () => {
    const action = decide(
      state([
        note("answer.md", { answer: 0.86, none: 0.14 }),
        note("step.md", { step: 0.8, none: 0.2 }),
      ]),
      above()
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC9 — the same state opens the step note without strategy, with openSteps always, and with contextSteps alone", () => {
    const s = state([
      note("answer.md", { answer: 0.86, none: 0.14 }),
      note("step.md", { step: 0.8, none: 0.2 }),
    ])
    const expected = opens(["step.md"])
    expect(decide(s, withConfig({ answer: 0.7, step: 0.7 }))).toEqual(expected)
    expect(
      decide(
        s,
        withStrategy({ openSteps: "always" }, { answer: 0.7, step: 0.7 })
      )
    ).toEqual(expected)
    expect(
      decide(
        s,
        withStrategy({ contextSteps: "linked" }, { answer: 0.7, step: 0.7 })
      )
    ).toEqual(expected)
    expect(decide(s, withStrategy({}, { answer: 0.7, step: 0.7 }))).toEqual(
      expected
    )
  })

  test("decision-policy AC9 — with no answer above the thresholds, step notes are opened as before", () => {
    const action = decide(
      state([
        note("weak.md", { answer: 0.3, none: 0.7 }),
        note("step.md", { step: 0.75, none: 0.25 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["step.md"]))
  })

  test("decision-policy AC9 — with no answer at all, step notes are opened as before", () => {
    const action = decide(
      state([note("a.md", { step: 0.8 }), note("b.md", { step: 0.9 })]),
      above()
    )
    expect(action).toEqual(opens(["b.md", "a.md"]))
  })

  test("decision-policy AC9 — a note whose step beats its own answer is opened (0.4 / 0.75)", () => {
    const action = decide(
      state([note("a.md", { answer: 0.4, step: 0.75, none: 0 })]),
      above()
    )
    expect(action).toEqual(opens(["a.md"]))
  })

  test("decision-policy AC9 — a note whose step does not beat its own answer is not opened (0.8 / 0.8)", () => {
    const action = decide(
      state([note("a.md", { answer: 0.8, step: 0.8, none: 0 })]),
      above()
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC9 — equality does not open: step equal to the best answer", () => {
    const action = decide(
      state([
        note("answer.md", { answer: 0.75, none: 0.25 }),
        note("step.md", { step: 0.75, none: 0.25 }),
      ]),
      above()
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC9 — just above the best answer opens", () => {
    const action = decide(
      state([
        note("answer.md", { answer: 0.75, none: 0.25 }),
        note("step.md", { step: 0.7501, none: 0.2499 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["step.md"]))
  })

  test("decision-policy AC9 — the step threshold still applies: ≥ opens, just under does not", () => {
    // Best answer 0.4 is under the answer threshold; the step threshold is 0.7.
    const base = [note("answer.md", { answer: 0.4, none: 0.6 })]
    expect(
      decide(state([...base, note("s.md", { step: 0.7, none: 0.3 })]), above())
    ).toEqual(opens(["s.md"]))
    expect(
      decide(
        state([...base, note("s.md", { step: 0.6999, none: 0.3001 })]),
        above()
      ).rule
    ).not.toBe("follow-steps")
  })

  test("decision-policy AC9 — the best answer counts even under the answer threshold", () => {
    // Answer threshold 0.9: 0.8 is not kept, but a step 0.6 does not exceed it.
    const action = decide(
      state([
        note("answer.md", { answer: 0.8, none: 0.2 }),
        note("step.md", { step: 0.6, none: 0.4 }),
      ]),
      above({ answer: 0.9, step: 0.5 })
    )
    expect(action.rule).not.toBe("follow-steps")
    // Without the strategy the same step note is opened.
    expect(
      decide(
        state([
          note("answer.md", { answer: 0.8, none: 0.2 }),
          note("step.md", { step: 0.6, none: 0.4 }),
        ]),
        withConfig({ answer: 0.9, step: 0.5 })
      )
    ).toEqual(opens(["step.md"]))
  })

  test("decision-policy AC9 — the best answer is taken among all notes, expanded or not openable included", () => {
    const step = note("step.md", { step: 0.8, none: 0.2 })
    expect(
      decide(
        state([
          note("done.md", { answer: 0.9, none: 0.1 }, { expanded: true }),
          step,
        ]),
        above()
      )
    ).toEqual(ANSWERED)
    expect(
      decide(
        state([
          note(
            "closed.md",
            { answer: 0.9, none: 0.1 },
            { hasUnjudgedLinks: false }
          ),
          step,
        ]),
        above()
      )
    ).toEqual(ANSWERED)
  })

  test("decision-policy AC9 — opens only the step notes above the best answer, ordered by decreasing step", () => {
    const action = decide(
      state([
        note("c.md", { step: 0.8, none: 0.2 }),
        note("best.md", { answer: 0.75, none: 0.25 }),
        note("below.md", { step: 0.72, none: 0.28 }),
        note("b.md", { step: 0.9, none: 0.1 }),
        note("e.md", { step: 0.76, none: 0.24 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["b.md", "c.md", "e.md"]))
  })

  test("decision-policy AC9 — ties on step go by order of judgement", () => {
    const action = decide(
      state([
        note("z.md", { step: 0.9, none: 0.1 }),
        note("best.md", { answer: 0.75, none: 0.25 }),
        note("m.md", { step: 0.9, none: 0.1 }),
        note("a.md", { step: 0.8, none: 0.2 }),
        note("b.md", { step: 0.9, none: 0.1 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["z.md", "m.md", "b.md", "a.md"]))
  })

  test("decision-policy AC9 — skips expanded notes and notes with no unjudged link", () => {
    const action = decide(
      state([
        note("best.md", { answer: 0.75, none: 0.25 }),
        note("done.md", { step: 0.95, none: 0.05 }, { expanded: true }),
        note(
          "closed.md",
          { step: 0.95, none: 0.05 },
          { hasUnjudgedLinks: false }
        ),
        note("open.md", { step: 0.9, none: 0.1 }),
      ]),
      above()
    )
    expect(action).toEqual(opens(["open.md"]))
  })

  test("decision-policy AC9 — the hop budget still bounds follow-steps", () => {
    const s = state(
      [
        note("answer.md", { answer: 0.75, none: 0.25 }),
        note("step.md", { step: 0.95, none: 0.05 }),
      ],
      { hops: MAX_HOPS }
    )
    expect(decide(s, above())).toEqual(ANSWERED)
    expect(decide({ ...s, hops: MAX_HOPS - 1 }, above())).toEqual(
      opens(["step.md"])
    )
  })

  test("decision-policy AC9 — when no step note qualifies, the next rules apply: explore with keep set", () => {
    // Keep 0.9: neither 0.8 (answer) nor 0.72 (step) is kept; 0.72 does not beat 0.8.
    const config = above({ answer: 0.7, step: 0.7, keep: 0.9 })
    const action = decide(
      state([
        note("answer.md", { answer: 0.8, none: 0.2 }),
        note("step.md", { step: 0.72, none: 0.28 }),
      ]),
      config
    )
    expect(action).toEqual(opens(["answer.md", "step.md"], "explore"))
  })

  test("decision-policy AC9 — when no step note qualifies, the next rules apply: rewrite then abstain", () => {
    const config = above({ answer: 0.7, step: 0.7, keep: 0.9 })
    const notes = [
      note("answer.md", { answer: 0.8, none: 0.2 }, { expanded: true }),
      note("step.md", { step: 0.72, none: 0.28 }, { expanded: true }),
    ]
    expect(decide(state(notes), config)).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(decide(state(notes, { rewrites: MAX_REWRITES }), config)).toEqual({
      type: "abstain",
      rule: "abstain",
    })
  })

  test("decision-policy AC9 — answer, explore, rewrite and abstain are unchanged by the strategy when no step note is openable", () => {
    const states = [
      state([note("a.md", { answer: 0.9 })]),
      state([note("a.md", { answer: 0.2 })]),
      state([note("a.md", { answer: 0.2 }, { expanded: true })]),
      state([], { rewrites: MAX_REWRITES }),
      state([]),
    ]
    for (const s of states) {
      expect(decide(s, above({}))).toEqual(decide(s, withConfig()))
    }
  })

  test("decision-policy AC9 — decide does not modify frozen inputs and is deterministic", () => {
    const s = deepFreeze(
      state([
        note("best.md", { answer: 0.75, none: 0.25 }),
        note("b.md", { step: 0.9, none: 0.1 }),
        note("a.md", { step: 0.8, none: 0.2 }),
      ])
    )
    const config = deepFreeze(structuredClone(above()))
    const configBefore = structuredClone(config)
    const first = decide(s, config)
    expect(first).toEqual(opens(["b.md", "a.md"]))
    expect(decide(s, config)).toEqual(first)
    expect(config).toEqual(configBefore)
    expect(s.notes.map((n) => n.path)).toEqual(["best.md", "b.md", "a.md"])
  })

  test("decision-policy AC9 — POLICIES.B and POLICIES.C carry the strategy, DEFAULT_POLICY has none", () => {
    const strategy = {
      openSteps: "above-best-answer",
      contextSteps: "linked",
    } as const
    const expectedB = {
      ...DEFAULT_POLICY,
      thresholds: { ...DEFAULT_POLICY.thresholds, sufficient: 0.5 },
      strategy,
    }
    const expectedC = {
      thresholds: { answer: 0.7, step: 0.7, keep: 0.9, sufficient: 0.5 },
      budgets: DEFAULT_POLICY.budgets,
      strategy,
    }
    expect(policyModule.POLICIES.B).toEqual(expectedB)
    expect(policyModule.POLICIES.C).toEqual(expectedC)
    expect("strategy" in DEFAULT_POLICY).toBe(false)
    expect(policyModule.POLICIES.B.thresholds).toEqual({
      ...DEFAULT_POLICY.thresholds,
      sufficient: 0.5,
    })
    expect(policyModule.POLICIES.B.budgets).toEqual(DEFAULT_POLICY.budgets)
  })

  test("decision-policy AC9 — POLICIES.B and POLICIES.C do not open a step note below the best answer", () => {
    for (const config of [policyModule.POLICIES.B, policyModule.POLICIES.C]) {
      // 0.92 is kept under both B (answer ≥ 0.5) and C (answer + step ≥ 0.9).
      const kept = note("answer.md", { answer: 0.92, none: 0.08 })
      expect(
        decide(state([kept, note("step.md", { step: 0.8, none: 0.2 })]), config)
      ).toEqual(ANSWERED)
      expect(
        decide(
          state([kept, note("step.md", { step: 0.96, none: 0.04 })]),
          config
        )
      ).toEqual(opens(["step.md"]))
    }
  })

  test("decision-policy AC9 — DEFAULT_POLICY keeps opening a step note next to an answer", () => {
    const action = decide(
      state([
        note("answer.md", { answer: 0.86, none: 0.14 }),
        note("step.md", { step: 0.8, none: 0.2 }),
      ]),
      DEFAULT_POLICY
    )
    expect(action).toEqual(opens(["step.md"]))
  })
})

describe("decision-policy AC10–AC12 — follow-kept (Revision 6)", () => {
  /** The state, with the sufficiency the last judgement reported. */
  function stateSufficient(
    notes: JudgedNote[],
    sufficient: number,
    overrides: Partial<Omit<LoopState, "notes">> = {}
  ): LoopState {
    const reported = { sufficient }
    return { ...state(notes, overrides), ...reported }
  }

  /** B-like thresholds (kept at 0.5) that ask for sufficiency at 0.5. */
  function asking(
    budgets: Partial<PolicyConfig["budgets"]> = {},
    threshold = 0.5
  ): PolicyConfig {
    return withAnyThresholds({ sufficient: threshold }, budgets)
  }

  /** C's thresholds, with the keep threshold and sufficiency at 0.5. */
  function askingWithKeep(): PolicyConfig {
    return withAnyThresholds({
      answer: 0.7,
      step: 0.7,
      keep: 0.9,
      sufficient: 0.5,
    })
  }

  const opens = (
    paths: string[],
    rule: "follow-steps" | "follow-kept" | "explore" = "follow-kept"
  ): Action => ({ type: "expand", rule, paths })

  const ANSWERED: Action = { type: "answer", rule: "answer" }

  test("decision-policy AC11 — a kept openable note and a sufficiency under the threshold: opens the kept note", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.8, none: 0.2 })], 0.2),
      asking()
    )
    expect(action).toEqual(opens(["a.md"]))
  })

  test("decision-policy AC11 — a kept note that is a step note is opened too (kept in the sense of isKept)", () => {
    // The step 0.6 does not beat the best answer 0.9: follow-steps leaves it
    // to follow-kept.
    const config: PolicyConfig = {
      ...asking(),
      strategy: { openSteps: "above-best-answer" },
    }
    const action = decide(
      stateSufficient(
        [
          note("answer.md", { answer: 0.9, none: 0.1 }, { expanded: true }),
          note("step.md", { step: 0.6, none: 0.4 }),
        ],
        0.2
      ),
      config
    )
    expect(action).toEqual(opens(["step.md"]))
  })

  test("decision-policy AC11 — no sufficiency in the state: the rule does not apply, answers", () => {
    const action = decide(
      state([note("a.md", { answer: 0.8, none: 0.2 })]),
      asking()
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC11 — no sufficient threshold in the configuration: the rule does not apply, whatever the state says", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.8, none: 0.2 })], 0.1),
      DEFAULT_POLICY
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC11 — a sufficiency equal to the threshold does not apply, just under it does", () => {
    const notes = [note("a.md", { answer: 0.8, none: 0.2 })]
    expect(decide(stateSufficient(notes, 0.5), asking())).toEqual(ANSWERED)
    expect(decide(stateSufficient(notes, 0.4999), asking())).toEqual(
      opens(["a.md"])
    )
  })

  test("decision-policy AC11 — a sufficiency above the threshold answers", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.8, none: 0.2 })], 0.9),
      asking()
    )
    expect(action).toEqual(ANSWERED)
  })

  test("decision-policy AC11 — a sufficiency of 0 is a value: the rule applies", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.8, none: 0.2 })], 0),
      asking()
    )
    expect(action).toEqual(opens(["a.md"]))
  })

  test("decision-policy AC11 — the threshold given is the one used: 0.2 is under 0.5 and not under 0.1", () => {
    const notes = [note("a.md", { answer: 0.8, none: 0.2 })]
    expect(decide(stateSufficient(notes, 0.2), asking({}, 0.5))).toEqual(
      opens(["a.md"])
    )
    expect(decide(stateSufficient(notes, 0.2), asking({}, 0.1))).toEqual(
      ANSWERED
    )
  })

  test("decision-policy AC11 — no hop left: answers", () => {
    const notes = [note("a.md", { answer: 0.8, none: 0.2 })]
    expect(
      decide(stateSufficient(notes, 0.2, { hops: MAX_HOPS }), asking())
    ).toEqual(ANSWERED)
    expect(
      decide(stateSufficient(notes, 0.2, { hops: MAX_HOPS - 1 }), asking())
    ).toEqual(opens(["a.md"]))
  })

  test("decision-policy AC11 — a kept note already expanded, or without unjudged links, is not openable: answers", () => {
    expect(
      decide(
        stateSufficient(
          [note("a.md", { answer: 0.8, none: 0.2 }, { expanded: true })],
          0.2
        ),
        asking()
      )
    ).toEqual(ANSWERED)
    expect(
      decide(
        stateSufficient(
          [
            note(
              "a.md",
              { answer: 0.8, none: 0.2 },
              { hasUnjudgedLinks: false }
            ),
          ],
          0.2
        ),
        asking()
      )
    ).toEqual(ANSWERED)
  })

  test("decision-policy AC11 — only the openable kept notes are carried", () => {
    const action = decide(
      stateSufficient(
        [
          note("expanded.md", { answer: 0.9, none: 0.1 }, { expanded: true }),
          note("dead-end.md", { answer: 0.85 }, { hasUnjudgedLinks: false }),
          note("weak.md", { answer: 0.3, step: 0.1, none: 0.6 }),
          note("open.md", { answer: 0.7, none: 0.3 }),
        ],
        0.2
      ),
      asking()
    )
    expect(action).toEqual(opens(["open.md"]))
  })

  test("decision-policy AC11 — a note that is not kept is not opened by follow-kept: with nothing kept, explore applies", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.3, none: 0.7 })], 0.1),
      asking()
    )
    expect(action).toEqual(opens(["a.md"], "explore"))
  })

  test("decision-policy AC11 — with nothing kept and nothing openable, rewrite then abstain are unchanged", () => {
    const notes = [note("a.md", { answer: 0.3, none: 0.7 }, { expanded: true })]
    expect(decide(stateSufficient(notes, 0.1), asking())).toEqual({
      type: "rewrite",
      rule: "rewrite",
    })
    expect(
      decide(stateSufficient(notes, 0.1, { rewrites: MAX_REWRITES }), asking())
    ).toEqual({ type: "abstain", rule: "abstain" })
  })

  test("decision-policy AC11 — the paths go by decreasing answer + step, not by answer alone", () => {
    const action = decide(
      stateSufficient(
        [
          note("a.md", { answer: 0.6, step: 0.1, none: 0.3 }),
          note("b.md", { answer: 0.8, none: 0.2 }),
          note("c.md", { answer: 0.5, step: 0.45, none: 0.05 }),
        ],
        0.2
      ),
      asking()
    )
    // Sums: a 0.7, b 0.8, c 0.95; the answers alone would put b first.
    expect(action).toEqual(opens(["c.md", "b.md", "a.md"]))
  })

  test("decision-policy AC11 — ties go by order of judgement", () => {
    const action = decide(
      stateSufficient(
        [
          note("z.md", { answer: 0.6, step: 0.1, none: 0.3 }),
          note("a.md", { answer: 0.9, none: 0.1 }),
          note("m.md", { answer: 0.6, step: 0.1, none: 0.3 }),
          note("b.md", { answer: 0.6, step: 0.1, none: 0.3 }),
        ],
        0.2
      ),
      asking()
    )
    expect(action).toEqual(opens(["a.md", "z.md", "m.md", "b.md"]))
  })

  test("decision-policy AC11 — at most the explore budget, the best first", () => {
    const notes = [
      note("a.md", { answer: 0.6, none: 0.4 }),
      note("b.md", { answer: 0.9, none: 0.1 }),
      note("c.md", { answer: 0.7, none: 0.3 }),
      note("d.md", { answer: 0.8, none: 0.2 }),
    ]
    expect(decide(stateSufficient(notes, 0.2), asking({ explore: 2 }))).toEqual(
      opens(["b.md", "d.md"])
    )
    expect(decide(stateSufficient(notes, 0.2), asking({ explore: 1 }))).toEqual(
      opens(["b.md"])
    )
    expect(decide(stateSufficient(notes, 0.2), asking({ explore: 9 }))).toEqual(
      opens(["b.md", "d.md", "c.md", "a.md"])
    )
  })

  test("decision-policy AC11 — follow-steps wins over follow-kept", () => {
    const action = decide(
      stateSufficient(
        [
          note("answer.md", { answer: 0.9, none: 0.1 }),
          note("step.md", { step: 0.8, none: 0.2 }),
        ],
        0.2
      ),
      asking()
    )
    expect(action).toEqual(opens(["step.md"], "follow-steps"))
  })

  test("decision-policy AC11 — follow-kept wins over answer", () => {
    const notes = [note("a.md", { answer: 0.95, none: 0.05 })]
    expect(decide(stateSufficient(notes, 0.2), asking())).toMatchObject({
      type: "expand",
      rule: "follow-kept",
    })
    expect(decide(state(notes), asking())).toMatchObject({
      type: "answer",
      rule: "answer",
    })
  })

  test("decision-policy AC11 — when follow-steps opens nothing (the step is under the best answer), follow-kept opens the kept notes, step notes included", () => {
    // The case of the q-013 family: the step is under the best answer.
    const config: PolicyConfig = {
      ...withAnyThresholds({ answer: 0.7, step: 0.7, sufficient: 0.5 }),
      strategy: { openSteps: "above-best-answer" },
    }
    const action = decide(
      stateSufficient(
        [
          note("answer.md", { answer: 0.86, none: 0.14 }),
          note("step.md", { step: 0.8, none: 0.2 }),
        ],
        0.2
      ),
      config
    )
    expect(action).toEqual(opens(["answer.md", "step.md"]))
  })

  test("decision-policy AC11 — kept in the sense of the keep threshold: answer 0.62 + step 0.33 is opened, 0.5 + 0.3 is not", () => {
    const config = askingWithKeep()
    const action = decide(
      stateSufficient(
        [
          note("weak.md", { answer: 0.5, step: 0.3, none: 0.2 }),
          note("split.md", { answer: 0.62, step: 0.33, none: 0.05 }),
        ],
        0.2
      ),
      config
    )
    expect(action).toEqual(opens(["split.md"]))
  })

  test("decision-policy AC11 — with the keep threshold and no note kept by it, follow-kept does not apply: explore does", () => {
    const action = decide(
      stateSufficient(
        [note("weak.md", { answer: 0.5, step: 0.3, none: 0.2 })],
        0.2
      ),
      askingWithKeep()
    )
    expect(action).toEqual(opens(["weak.md"], "explore"))
  })

  test("decision-policy AC11 — with the keep threshold, a note with answer 0.8 alone is not kept, so it is not opened by follow-kept", () => {
    const action = decide(
      stateSufficient([note("a.md", { answer: 0.8, none: 0.2 })], 0.2),
      askingWithKeep()
    )
    expect(action).toEqual(opens(["a.md"], "explore"))
  })

  test("decision-policy AC12 — POLICIES.C opens the intermediate note judged answer 0.62 / step 0.33 while the sufficiency is 0.2", () => {
    const action = decide(
      stateSufficient(
        [
          note("handoff.md", { answer: 0.62, step: 0.33, none: 0.05 }),
          note("elsewhere.md", { step: 0.4, none: 0.6 }),
        ],
        0.2
      ),
      policyModule.POLICIES.C
    )
    expect(action).toEqual(opens(["handoff.md"]))
  })

  test("decision-policy AC12 — POLICIES.B and POLICIES.C open a kept note at a sufficiency of 0.49 and answer at 0.5", () => {
    for (const config of [policyModule.POLICIES.B, policyModule.POLICIES.C]) {
      const notes = [note("a.md", { answer: 0.95, none: 0.05 })]
      expect(decide(stateSufficient(notes, 0.49), config)).toEqual(
        opens(["a.md"])
      )
      expect(decide(stateSufficient(notes, 0.5), config)).toEqual(ANSWERED)
    }
  })

  test("decision-policy AC12 — POLICIES.B and POLICIES.C set the sufficient threshold to 0.5, DEFAULT_POLICY leaves it unset", () => {
    const thresholds = (config: PolicyConfig): object => config.thresholds
    expect(thresholds(policyModule.POLICIES.B)).toHaveProperty(
      "sufficient",
      0.5
    )
    expect(thresholds(policyModule.POLICIES.C)).toHaveProperty(
      "sufficient",
      0.5
    )
    expect("sufficient" in DEFAULT_POLICY.thresholds).toBe(false)
  })

  test("decision-policy AC12 — the sufficient threshold changes nothing else in the configuration of B and C", () => {
    const withoutSufficient = (config: PolicyConfig) =>
      Object.fromEntries(
        Object.entries(config.thresholds).filter(
          ([key]) => key !== "sufficient"
        )
      )
    expect(withoutSufficient(policyModule.POLICIES.B)).toEqual({
      answer: 0.5,
      step: 0.5,
    })
    expect(withoutSufficient(policyModule.POLICIES.C)).toEqual({
      answer: 0.7,
      step: 0.7,
      keep: 0.9,
    })
    expect(DEFAULT_POLICY.thresholds).toEqual({ answer: 0.5, step: 0.5 })
  })

  test("decision-policy AC10 — a state without sufficiency decides as before, with any configuration", () => {
    const states = [
      state([note("a.md", { step: 0.9 })]),
      state([note("a.md", { answer: 0.9 })]),
      state([note("a.md", { answer: 0.2 })]),
      state([]),
      state([], { rewrites: MAX_REWRITES }),
    ]
    for (const s of states) {
      expect(decide(s, asking())).toEqual(decide(s, DEFAULT_POLICY))
    }
  })

  test("decision-policy AC11 — decide does not modify frozen inputs and is deterministic", () => {
    const s = deepFreeze(
      stateSufficient(
        [
          note("a.md", { answer: 0.6, step: 0.1, none: 0.3 }),
          note("b.md", { answer: 0.9, none: 0.1 }),
        ],
        0.2
      )
    )
    const config = deepFreeze(structuredClone(asking()))
    const configBefore = structuredClone(config)
    const first = decide(s, config)
    expect(first).toEqual(opens(["b.md", "a.md"]))
    expect(decide(s, config)).toEqual(first)
    expect(config).toEqual(configBefore)
    expect(s.notes.map((n) => n.path)).toEqual(["a.md", "b.md"])
    expect(s).toHaveProperty("sufficient", 0.2)
  })
})
