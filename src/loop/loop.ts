import type { ContextChunk } from "../answer/answerer.ts"
import {
  billedCalls,
  type Judge,
  type NoteForJudge,
  type Verdict,
} from "../core/judge.ts"
import type { ModelCall } from "../core/types.ts"
import type { Index } from "../index/read.ts"
import type { Retrieval } from "../retrieval/hybrid.ts"
import { decide, isKept, type Action, type PolicyConfig } from "./policy.ts"
import type { Rewriter } from "./rewriter.ts"

const DEFAULT_CANDIDATES = 50
/** Notes given to the rewriter. */
const REWRITER_NOTES = 5

type Verdicts = Record<Verdict, number>

export interface LoopDeps {
  /** The shape of `HybridRetriever.retrieve`. */
  retrieve(query: string, k: number): Promise<Retrieval>
  index: Pick<Index, "chunksOf" | "getNote" | "outgoingLinks">
  judge: Judge
  rewriter: Rewriter
  policy: PolicyConfig
  /** Chunks retrieved per search. Default 50. */
  candidates?: number
}

/** One turn of the loop: what it judged, what it kept, what was decided. */
export interface LoopStep {
  kind: "search" | "expand" | "rewrite"
  /** The query of a search or a rewrite. */
  query?: string
  /** The notes whose links were opened. */
  expanded?: string[]
  /** Verdicts of the notes judged this turn, by path. */
  judged: Record<string, Verdicts>
  /** The note each note reached by a link came from. */
  parents: Record<string, string>
  /** The notes of `judged` the policy keeps. */
  kept: string[]
  /** The notes the judge judged again with its fallback this turn. */
  fallback: string[]
  /** The notes the judge vetoed this turn. */
  vetoed: string[]
  /** The probability the judgement of this turn gave that the notes state the complete answer, when it gave one. */
  sufficient?: number
  action: Action
}

export interface LoopResult {
  /** Empty when the loop abstains. */
  context: ContextChunk[]
  /** The action of the last step. */
  outcome: Action
  steps: LoopStep[]
  /** Every model call, in order. */
  calls: ModelCall[]
  hops: number
  rewrites: number
  /** Verdicts of every judged note, by path. */
  judged: Record<string, Verdicts>
  /** The kept notes and their ancestors, in context order, before the cut. */
  kept: string[]
  /** Link targets of judged notes that were never judged. */
  frontier: string[]
  /** The notes judged again with the judge's fallback, in order. */
  fallback: string[]
  /** Wall-clock time over all turns, by stage. */
  stages: Stages
}

export interface Stages {
  searchMs: number
  judgeMs: number
  fallbackMs: number
  rewriteMs: number
}

/** A failed run: the original message, with the cost and the trace so far. */
export class LoopError extends Error {
  constructor(
    message: string,
    readonly calls: ModelCall[],
    readonly steps: LoopStep[],
    options?: ErrorOptions
  ) {
    super(message, options)
  }
}

type Turn = Omit<LoopStep, "action">

interface JudgedEntry {
  note: NoteForJudge
  verdicts: Verdicts
  expanded: boolean
  /** The note it was reached from, if reached by a link. */
  parent: string | null
}

/** The text of a note: its sections in order, each under a `## ` heading line. */
export function noteText(index: Pick<Index, "chunksOf">, path: string): string {
  return index
    .chunksOf(path)
    .map((chunk) =>
      chunk.heading === "" ? chunk.text : `## ${chunk.heading}\n${chunk.text}`
    )
    .join("\n\n")
}

/** Retrieves, judges and decides until the policy answers or abstains. */
export async function runLoop(
  question: string,
  deps: LoopDeps
): Promise<LoopResult> {
  return new Loop(question, deps).run()
}

class Loop {
  /** Every note judged so far, in order of first judgement. */
  private readonly judged = new Map<string, JudgedEntry>()
  private readonly steps: LoopStep[] = []
  private readonly calls: ModelCall[] = []
  private readonly stages: Stages = {
    searchMs: 0,
    judgeMs: 0,
    fallbackMs: 0,
    rewriteMs: 0,
  }
  private hops = 0
  private rewrites = 0
  /** From the last judgement that reported one. */
  private sufficient: number | undefined

  constructor(
    private readonly question: string,
    private readonly deps: LoopDeps
  ) {}

  run(): Promise<LoopResult> {
    return this.loop()
  }

  /** Runs a judge or rewriter call; its failure becomes a `LoopError`. */
  private async model<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      throw new LoopError(
        error instanceof Error ? error.message : String(error),
        [...this.calls, ...billedCalls(error)],
        this.steps,
        { cause: error }
      )
    }
  }

  private async loop(): Promise<LoopResult> {
    let turn = await this.search(this.question, "search")
    for (;;) {
      const action = this.decide()
      this.steps.push({ ...turn, action })
      if (action.type === "expand") turn = await this.expand(action.paths)
      else if (action.type === "rewrite") turn = await this.rewrite()
      else return this.result(action)
    }
  }

  /** Retrieves for `query` and judges the notes not judged yet. */
  private async search(
    query: string,
    kind: "search" | "rewrite"
  ): Promise<Turn> {
    const startedAt = performance.now()
    const retrieval = await this.deps.retrieve(query, this.candidates)
    this.stages.searchMs += performance.now() - startedAt
    this.calls.push(...retrieval.calls)
    const paths = [
      ...new Set(retrieval.chunks.map(({ chunk }) => chunk.notePath)),
    ].filter((path) => !this.judged.has(path))
    return { kind, query, ...(await this.judgeNotes(paths, new Map())) }
  }

  /** Opens the links of the notes and judges the targets never judged. */
  private async expand(paths: string[]): Promise<Turn> {
    const parents = new Map<string, string>()
    for (const path of paths) {
      const entry = this.judged.get(path)!
      entry.expanded = true
      for (const target of entry.note.links) {
        if (!this.judged.has(target) && !parents.has(target)) {
          parents.set(target, path)
        }
      }
    }
    this.hops++
    return {
      kind: "expand",
      expanded: paths,
      ...(await this.judgeNotes([...parents.keys()], parents)),
    }
  }

  private async rewrite(): Promise<Turn> {
    const best = ranked(
      [...this.judged.values()],
      ({ verdicts }) => verdicts.answer + verdicts.step
    ).slice(0, REWRITER_NOTES)
    const startedAt = performance.now()
    const { query, calls } = await this.model(() =>
      this.deps.rewriter.rewrite(
        this.question,
        best.map(({ note }) => ({ path: note.path, text: note.text }))
      )
    )
    this.stages.rewriteMs += performance.now() - startedAt
    this.calls.push(...calls)
    this.rewrites++
    return this.search(query, "rewrite")
  }

  /** Judges the notes in one call, with the notes kept so far as context. */
  private async judgeNotes(
    paths: string[],
    parents: Map<string, string>
  ): Promise<
    Pick<
      Turn,
      "judged" | "parents" | "kept" | "fallback" | "vetoed" | "sufficient"
    >
  > {
    const notes = paths.map((path) => this.noteForJudge(path))
    const context = [...this.judged.values()]
      .filter(({ verdicts }) => isKept(verdicts, this.deps.policy))
      .map(({ note }) => note)
    const startedAt = performance.now()
    const judgement = await this.model(() =>
      this.deps.judge.judge(this.question, notes, context)
    )
    const stages = judgement.stages ?? {
      judgeMs: performance.now() - startedAt,
      fallbackMs: 0,
    }
    this.stages.judgeMs += stages.judgeMs
    this.stages.fallbackMs += stages.fallbackMs
    this.calls.push(...judgement.calls)
    if (judgement.sufficient !== undefined)
      this.sufficient = judgement.sufficient
    const judged: Record<string, Verdicts> = {}
    for (const note of notes) {
      const verdicts = judgement.notes[note.path] ?? {
        answer: 0,
        step: 0,
        none: 1,
      }
      judged[note.path] = verdicts
      this.judged.set(note.path, {
        note,
        verdicts,
        expanded: false,
        parent: parents.get(note.path) ?? null,
      })
    }
    return {
      judged,
      parents: Object.fromEntries(parents),
      kept: Object.keys(judged).filter((path) =>
        isKept(judged[path]!, this.deps.policy)
      ),
      fallback: judgement.fallback ?? [],
      vetoed: judgement.vetoed ?? [],
      ...(judgement.sufficient === undefined
        ? {}
        : { sufficient: judgement.sufficient }),
    }
  }

  private noteForJudge(path: string): NoteForJudge {
    const links = this.deps.index.outgoingLinks(path)
    return {
      path,
      date: this.deps.index.getNote(path)?.date ?? null,
      text: noteText(this.deps.index, path),
      links: [...new Set(links.map((link) => link.targetPath))],
    }
  }

  /** The next action; past the turns the budgets allow, it ends the loop. */
  private decide(): Action {
    const { maxHops, maxRewrites } = this.deps.policy.budgets
    const action = decide(
      {
        notes: [...this.judged.values()].map((entry) => ({
          path: entry.note.path,
          verdict: entry.verdicts,
          expanded: entry.expanded,
          hasUnjudgedLinks: entry.note.links.some(
            (target) => !this.judged.has(target)
          ),
        })),
        hops: this.hops,
        rewrites: this.rewrites,
        ...(this.sufficient === undefined
          ? {}
          : { sufficient: this.sufficient }),
      },
      this.deps.policy
    )
    const turnsLeft = 1 + maxHops + maxRewrites - (this.steps.length + 1)
    if (
      turnsLeft > 0 ||
      action.type === "answer" ||
      action.type === "abstain"
    ) {
      return action
    }
    const type = this.keptPaths().length > 0 ? "answer" : "abstain"
    return { type, rule: type }
  }

  private result(outcome: Action): LoopResult {
    const kept = this.keptWithAncestors()
    const context =
      outcome.type === "abstain"
        ? []
        : kept
            .slice(0, this.deps.policy.budgets.maxNotes)
            .map((path) => this.contextChunk(path))
    return {
      context,
      outcome,
      steps: this.steps,
      calls: this.calls,
      hops: this.hops,
      rewrites: this.rewrites,
      judged: Object.fromEntries(
        [...this.judged].map(([path, { verdicts }]) => [path, verdicts])
      ),
      kept,
      frontier: this.frontier(),
      fallback: this.steps.flatMap((step) => step.fallback),
      stages: this.stages,
    }
  }

  /**
   * The context order, among the kept notes: each answer note (`answer` at
   * the answer threshold or at its `step`), most probable first, followed by
   * its ancestors and the step notes that link to it; then the other kept
   * notes, by decreasing step. With `contextSteps: "linked"`, the other kept
   * notes are added only when there is no answer note.
   */
  private keptWithAncestors(): string[] {
    const { policy } = this.deps
    const entries = [...this.judged.values()].filter(({ verdicts }) =>
      isKept(verdicts, policy)
    )
    const answers = ranked(
      entries.filter(
        ({ verdicts }) =>
          verdicts.answer >= policy.thresholds.answer ||
          verdicts.answer >= verdicts.step
      ),
      ({ verdicts }) => verdicts.answer
    )
    const steps = ranked(
      entries.filter(({ verdicts }) => verdicts.step >= policy.thresholds.step),
      ({ verdicts }) => verdicts.step
    )
    const paths = new Set<string>()
    for (const { note } of answers) {
      let path: string | null = note.path
      while (path !== null && !paths.has(path)) {
        paths.add(path)
        path = this.judged.get(path)!.parent
      }
      for (const step of steps) {
        if (step.note.links.includes(note.path)) paths.add(step.note.path)
      }
    }
    if (policy.strategy?.contextSteps === "linked" && answers.length > 0) {
      return [...paths]
    }
    for (const { note } of ranked(entries, ({ verdicts }) => verdicts.step)) {
      paths.add(note.path)
    }
    return [...paths]
  }

  private keptPaths(): string[] {
    return [...this.judged]
      .filter(([, { verdicts }]) => isKept(verdicts, this.deps.policy))
      .map(([path]) => path)
  }

  /** The targets of the links of judged notes that were never judged. */
  private frontier(): string[] {
    return [
      ...new Set(
        [...this.judged.values()]
          .flatMap(({ note }) => note.links)
          .filter((target) => !this.judged.has(target))
      ),
    ]
  }

  private contextChunk(path: string): ContextChunk {
    const { note } = this.judged.get(path)!
    return {
      notePath: path,
      noteDate: note.date,
      heading: "",
      text: note.text,
    }
  }

  private get candidates(): number {
    return this.deps.candidates ?? DEFAULT_CANDIDATES
  }
}

/** The items by decreasing score; ties stay in their order. */
function ranked<T>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a))
}
