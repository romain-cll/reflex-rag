import type { ContextChunk } from "../answer/answerer.ts"
import type { Judge, NoteForJudge, Verdict } from "../core/judge.ts"
import { LLMCallError } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import type { Index } from "../index/read.ts"
import type { Retrieval } from "../retrieval/hybrid.ts"
import { decide, type Action, type PolicyConfig } from "./policy.ts"
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
  /** The notes of `judged` at or above the answer threshold. */
  kept: string[]
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
  private hops = 0
  private rewrites = 0

  constructor(
    private readonly question: string,
    private readonly deps: LoopDeps
  ) {}

  async run(): Promise<LoopResult> {
    try {
      return await this.loop()
    } catch (error) {
      const billed = error instanceof LLMCallError ? [error.call] : []
      throw new LoopError(
        error instanceof Error ? error.message : String(error),
        [...this.calls, ...billed],
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
    const retrieval = await this.deps.retrieve(query, this.candidates)
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
    const { query, calls } = await this.deps.rewriter.rewrite(
      this.question,
      best.map(({ note }) => ({ path: note.path, text: note.text }))
    )
    this.calls.push(...calls)
    this.rewrites++
    return this.search(query, "rewrite")
  }

  /** Judges the notes in one call; none to judge, no call. */
  private async judgeNotes(
    paths: string[],
    parents: Map<string, string>
  ): Promise<Pick<Turn, "judged" | "parents" | "kept">> {
    const notes = paths.map((path) => this.noteForJudge(path))
    const judgement = await this.deps.judge.judge(this.question, notes)
    this.calls.push(...judgement.calls)
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
      kept: Object.keys(judged).filter((path) => this.isKept(judged[path]!)),
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
    const type = this.keptEntries().length > 0 ? "answer" : "abstain"
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
    }
  }

  /** The kept notes, each followed by its ancestors not listed yet. */
  private keptWithAncestors(): string[] {
    const paths = new Set<string>()
    for (const { note } of this.keptEntries()) {
      let path: string | null = note.path
      while (path !== null && !paths.has(path)) {
        paths.add(path)
        path = this.judged.get(path)!.parent
      }
    }
    return [...paths]
  }

  /** The kept notes, most probable answer first, ties by order of judgement. */
  private keptEntries(): JudgedEntry[] {
    return ranked(
      [...this.judged.values()].filter(({ verdicts }) => this.isKept(verdicts)),
      ({ verdicts }) => verdicts.answer
    )
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

  private isKept(verdicts: Verdicts): boolean {
    return verdicts.answer >= this.deps.policy.thresholds.answer
  }

  private get candidates(): number {
    return this.deps.candidates ?? DEFAULT_CANDIDATES
  }
}

/** The items by decreasing score; ties stay in their order. */
function ranked<T>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a))
}
