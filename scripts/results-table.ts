#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"
import { CATEGORIES, SPLITS } from "../evals/schema.ts"
import { FAILURE_INFO, FAILURES } from "../src/eval/grade.ts"

const usage = `Usage:
  bun scripts/results-table.ts [--out <file>] [<runDir>...]

Writes the page that compares the runs (default docs/results/RESULTS.md), from
their settings line and their summary.json. Without run directories, it takes
the most recent run of each config and split found under runs/.`

const DEFAULT_OUT = "docs/results/RESULTS.md"
const RUNS_DIR = "runs"

const SettingsSchema = z.looseObject({
  config: z.string(),
  split: z.enum(SPLITS),
  gitCommit: z.string(),
  // Absent for the configs without a fallback, and `null` for C without one.
  loop: z
    .looseObject({
      fallbackLow: z.number().nullable().optional(),
      fallbackWhen: z.string().optional(),
    })
    .optional(),
})

const MetricsSchema = z.looseObject({
  n: z.number(),
  accuracy: z.number().nullable(),
  meanRecall: z.number().nullable(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
  meanCostUsd: z.number().nullable(),
  meanInputTokens: z.number().nullable(),
  failures: z.record(z.string(), z.number()),
  meanHops: z.number().nullable(),
  meanRewrites: z.number().nullable(),
  meanJudgeCalls: z.number().nullable(),
  contextCompleteRate: z.number().nullable(),
  meanPrecision: z.number().nullable(),
  meanNotesInContext: z.number().nullable(),
  failuresByFamily: z.object({ retrieval: z.number(), answer: z.number() }),
  abstentions: z.object({ loop: z.number(), answerer: z.number() }),
  // Absent from the summaries written before the retrieval measures (and
  // before config C, for the fallback and stage ones).
  meanRetrievalCostUsd: z.number().nullable().optional(),
  retrievalP50Ms: z.number().nullable().optional(),
  retrievalP95Ms: z.number().nullable().optional(),
  fallbackNoteRate: z.number().nullable().optional(),
  fallbackQuestionRate: z.number().nullable().optional(),
  stageMedianMs: z.record(z.string(), z.number().nullable()).optional(),
  stageMeanMs: z.record(z.string(), z.number().nullable()).optional(),
  costByRole: z.record(z.string(), z.number()).optional(),
})

type Metrics = z.infer<typeof MetricsSchema>

const SummarySchema = z.looseObject({
  overall: MetricsSchema,
  byCategory: z.record(z.string(), MetricsSchema),
})

interface Run {
  /** The folder as shown under the tables. */
  dir: string
  /** The date of the run folder name, `YYYY-MM-DD`. */
  date: string
  /** The time of the run folder name, `HH:MM`; empty if the name has none. */
  time: string
  config: string
  split: string
  commit: string
  /** The grey zone of the fallback as shown, empty for a run without one. */
  fallback: string
  overall: Metrics
  byCategory: Record<string, Metrics | undefined>
}

function fail(message: string): number {
  console.error(`results-table: ${message}\n\n${usage}`)
  return 1
}

/** The settings line of the trace: its first line, the only one read. */
function readSettings(dir: string): unknown {
  const trace = readFileSync(join(dir, "trace.jsonl"), "utf8")
  return JSON.parse(trace.split("\n")[0]!)
}

/** `0.85`, `none` without fallback, plus the scope when it is not `uncertain`. */
function fallbackOf(loop: z.infer<typeof SettingsSchema>["loop"]): string {
  if (loop?.fallbackLow === undefined) return ""
  const low = loop.fallbackLow === null ? "none" : String(loop.fallbackLow)
  return loop.fallbackWhen === undefined || loop.fallbackWhen === "uncertain"
    ? low
    : `${low} ${loop.fallbackWhen}`
}

function readRun(dir: string): Run {
  const name = basename(dir)
  const date = /^\d{4}-\d{2}-\d{2}/.exec(name)?.[0]
  if (!date)
    throw new Error(`${name}: the folder name does not start with a date`)
  const [, hours, minutes] = /^[\d-]+T(\d{2})-(\d{2})/.exec(name) ?? []
  try {
    const settings = SettingsSchema.parse(readSettings(dir))
    const summary = SummarySchema.parse(
      JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))
    )
    return {
      dir: relative(process.cwd(), dir),
      date,
      time: hours === undefined ? "" : `${hours}:${minutes}`,
      config: settings.config,
      split: settings.split,
      commit: settings.gitCommit,
      fallback: fallbackOf(settings.loop),
      overall: summary.overall,
      byCategory: summary.byCategory,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${name}: ${reason}`, { cause: error })
  }
}

function parseSettings(name: string, dir: string) {
  try {
    return SettingsSchema.parse(readSettings(dir))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${name}: ${reason}`, { cause: error })
  }
}

/** The most recent run of each config and split under `runsDir`. */
function latestRunDirs(runsDir: string): string[] {
  if (!existsSync(runsDir)) return []
  const latest = new Map<string, string>()
  for (const name of readdirSync(runsDir).sort()) {
    const dir = join(runsDir, name)
    if (!existsSync(join(dir, "trace.jsonl"))) continue
    const { config, split } = parseSettings(name, dir)
    // The names start with their timestamp, so the last one read is the latest.
    latest.set(`${config} ${split}`, dir)
  }
  return [...latest.values()]
}

function percent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`
}

/** Also `-` for a measure absent from the summaries written before it. */
function fixed(value: number | null | undefined, digits: number): string {
  return value == null ? "-" : value.toFixed(digits)
}

/** Loop measures are empty for a run without a loop. */
function loopFixed(value: number | null | undefined, digits: number): string {
  return value == null ? "" : value.toFixed(digits)
}

/** Fallback rates are empty for a run without a fallback. */
function loopPercent(value: number | null | undefined): string {
  return value == null ? "" : `${(value * 100).toFixed(1)}%`
}

function correctOverN({ accuracy, n }: Metrics): string {
  return accuracy === null ? "-" : `${Math.round(accuracy * n)}/${n}`
}

type Column = [header: string, cell: (run: Run) => string]

/**
 * The headline columns, the end-to-end ones, then the others
 * (docs/features/results-table.md, AC2 and Revision 2, AC7).
 */
const MAIN_COLUMNS: Column[] = [
  ["config", (r) => r.config],
  ["split", (r) => r.split],
  ["date", (r) => r.date],
  ["commit", (r) => r.commit],
  ["fallback", (r) => r.fallback],
  ["questions", (r) => String(r.overall.n)],
  ["context complete", (r) => percent(r.overall.contextCompleteRate)],
  ["context precision", (r) => percent(r.overall.meanPrecision)],
  [
    "retrieval cost/question (USD)",
    (r) => fixed(r.overall.meanRetrievalCostUsd, 5),
  ],
  ["retrieval latency p50 (ms)", (r) => fixed(r.overall.retrievalP50Ms, 0)],
  ["retrieval latency p95 (ms)", (r) => fixed(r.overall.retrievalP95Ms, 0)],
  [
    "accuracy",
    (r) =>
      r.overall.accuracy === null
        ? "-"
        : `${correctOverN(r.overall)} (${percent(r.overall.accuracy)})`,
  ],
  ["end-to-end cost/question (USD)", (r) => fixed(r.overall.meanCostUsd, 5)],
  ["end-to-end latency p50 (ms)", (r) => fixed(r.overall.latencyP50Ms, 0)],
  ["end-to-end latency p95 (ms)", (r) => fixed(r.overall.latencyP95Ms, 0)],
  ["fallback note rate", (r) => loopPercent(r.overall.fallbackNoteRate)],
  [
    "fallback question rate",
    (r) => loopPercent(r.overall.fallbackQuestionRate),
  ],
  ["recall", (r) => percent(r.overall.meanRecall)],
  ["notes in context", (r) => fixed(r.overall.meanNotesInContext, 1)],
  ["answerer input tokens", (r) => fixed(r.overall.meanInputTokens, 0)],
  [
    "total cost (USD)",
    (r) =>
      fixed(
        r.overall.meanCostUsd === null
          ? null
          : r.overall.meanCostUsd * r.overall.n,
        4
      ),
  ],
  ["retrieval failures", (r) => String(r.overall.failuresByFamily.retrieval)],
  ["answer failures", (r) => String(r.overall.failuresByFamily.answer)],
  [
    "abstentions (correct/n)",
    (r) => {
      const noAnswer = r.byCategory.no_answer
      return noAnswer ? correctOverN(noAnswer) : "-"
    },
  ],
  [
    "abstentions by the loop",
    (r) => String(r.byCategory.no_answer?.abstentions.loop ?? "-"),
  ],
  [
    "abstentions by the answerer",
    (r) => String(r.byCategory.no_answer?.abstentions.answerer ?? "-"),
  ],
  ["hops", (r) => loopFixed(r.overall.meanHops, 2)],
  ["rewrites", (r) => loopFixed(r.overall.meanRewrites, 2)],
  ["judge calls", (r) => loopFixed(r.overall.meanJudgeCalls, 2)],
]

const line = (cells: string[]) => `| ${cells.join(" | ")} |`

function table(header: string[], rows: string[][]): string {
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n"
  )
}

/** What the retrieval columns of the main table count. */
const RETRIEVAL_NOTE =
  "The retrieval measures count the search, the judge, its fallback and the rewrites, without the answerer, which is the same for every config."

/** The folders the table above was built from. */
function provenance(runs: Run[]): string {
  return `Built from: ${runs.map((run) => `\`${run.dir}\``).join(", ")}`
}

/**
 * Config and split, plus the fallback of a run that has one, plus the commit
 * when another run shares them, plus the time when another run also shares the
 * commit.
 */
function labelOf(runs: Run[]): (run: Run) => string {
  return (run) => {
    const sharing = runs.filter(
      (other) =>
        other !== run &&
        other.config === run.config &&
        other.split === run.split &&
        other.fallback === run.fallback
    )
    const label = `${run.config} ${run.split}${
      run.fallback === "" ? "" : ` fallback ${run.fallback}`
    }`
    if (sharing.length === 0) return label
    const withCommit = `${label} ${run.commit}`
    return sharing.some((other) => other.commit === run.commit)
      ? `${withCommit} ${run.time}`.trim()
      : withCommit
  }
}

const STAGES = ["searchMs", "judgeMs", "fallbackMs", "rewriteMs", "answerMs"]
const ROLES = ["embed", "judge", "fallback", "rewrite", "answer"]

const STAGE_COLUMNS: Column[] = [
  ["config", (r) => r.config],
  ["split", (r) => r.split],
  ["commit", (r) => r.commit],
  ["fallback", (r) => r.fallback],
  ...(
    [
      ["median", "stageMedianMs"],
      ["mean", "stageMeanMs"],
    ] as const
  ).flatMap(([name, field]) =>
    STAGES.map((stage): Column => [
      `${stage.replace("Ms", "")} ${name} (ms)`,
      (r) => loopFixed(r.overall[field]?.[stage], 0),
    ])
  ),
  ...ROLES.map((role): Column => [
    `${role} cost (USD)`,
    (r) => loopFixed(r.overall.costByRole?.[role], 5),
  ]),
]

function stageTable(runs: Run[]): string {
  return table(
    STAGE_COLUMNS.map(([header]) => header),
    runs.map((run) => STAGE_COLUMNS.map(([, cell]) => cell(run)))
  )
}

function mainTable(runs: Run[]): string {
  return table(
    MAIN_COLUMNS.map(([header]) => header),
    runs.map((run) => MAIN_COLUMNS.map(([, cell]) => cell(run)))
  )
}

/** The measures of a group of runs: their values, set aside when absent or null. */
function valuesOf(
  runs: Run[],
  pick: (metrics: Metrics) => number | null | undefined
): number[] {
  return runs.flatMap((run) => pick(run.overall) ?? [])
}

/** `<mean> [<min>–<max>]`, without the range when the values are all equal. */
function withRange(
  mean: string,
  values: number[],
  format: (value: number) => string
): string {
  const min = format(Math.min(...values))
  const max = format(Math.max(...values))
  return min === max ? mean : `${mean} [${min}–${max}]`
}

/** The mean over the runs of a measure, with its range; `-` if no run has it. */
function spread(
  pick: (metrics: Metrics) => number | null | undefined,
  format: (value: number) => string
): GroupColumn[1] {
  return (runs) => {
    const values = valuesOf(runs, pick)
    if (values.length === 0) return "-"
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    return withRange(format(mean), values, format)
  }
}

/** The mean number correct over n, with the range of the counts. */
function spreadCorrect(runs: Run[]): string {
  const counts = valuesOf(runs, ({ accuracy, n }) =>
    accuracy === null ? null : Math.round(accuracy * n)
  )
  if (counts.length === 0) return "-"
  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length
  return withRange(`${mean.toFixed(1)}/${runs[0]!.overall.n}`, counts, String)
}

type GroupColumn = [header: string, cell: (runs: Run[]) => string]

/** The columns of the repeated runs table (docs/features/results-table.md, AC12). */
const REPEATED_COLUMNS: GroupColumn[] = [
  ["config", (rs) => rs[0]!.config],
  ["split", (rs) => rs[0]!.split],
  ["commit", (rs) => rs[0]!.commit],
  ["fallback", (rs) => rs[0]!.fallback],
  ["runs", (rs) => String(rs.length)],
  ["context complete", spread((m) => m.contextCompleteRate, percent)],
  ["context precision", spread((m) => m.meanPrecision, percent)],
  [
    "retrieval cost/question (USD)",
    spread(
      (m) => m.meanRetrievalCostUsd,
      (v) => fixed(v, 5)
    ),
  ],
  [
    "retrieval latency p50 (ms)",
    spread(
      (m) => m.retrievalP50Ms,
      (v) => fixed(v, 0)
    ),
  ],
  [
    "retrieval latency p95 (ms)",
    spread(
      (m) => m.retrievalP95Ms,
      (v) => fixed(v, 0)
    ),
  ],
  ["accuracy", spreadCorrect],
  ...ROLES.map((role): GroupColumn => [
    `${role} cost (USD)`,
    spread(
      (m) => m.costByRole?.[role],
      (v) => fixed(v, 5)
    ),
  ]),
  [
    "end-to-end cost/question (USD)",
    spread(
      (m) => m.meanCostUsd,
      (v) => fixed(v, 5)
    ),
  ],
  [
    "end-to-end latency p50 (ms)",
    spread(
      (m) => m.latencyP50Ms,
      (v) => fixed(v, 0)
    ),
  ],
]

/** The runs sharing config, split, commit and fallback, ordered by the first three and the fallback. */
function groupRuns(runs: Run[]): Run[][] {
  const groups = new Map<string, Run[]>()
  for (const run of runs) {
    const key = JSON.stringify([
      run.config,
      run.split,
      run.commit,
      run.fallback,
    ])
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  return [...groups.values()].sort(
    ([a], [b]) =>
      a!.config.localeCompare(b!.config) ||
      a!.split.localeCompare(b!.split) ||
      a!.fallback.localeCompare(b!.fallback) ||
      a!.commit.localeCompare(b!.commit)
  )
}

function repeatedTable(groups: Run[][]): string {
  return table(
    REPEATED_COLUMNS.map(([header]) => header),
    groups.map((group) => REPEATED_COLUMNS.map(([, cell]) => cell(group)))
  )
}

/** One line per group: its settings, then the folders it was built from. */
function groupProvenance(groups: Run[][]): string {
  return groups
    .map((group) => {
      const [{ config, split, commit, fallback }] = group as [Run, ...Run[]]
      const dirs = group.map((run) => `\`${run.dir}\``).join(", ")
      return `- ${config} ${split} ${commit}${fallback === "" ? "" : ` fallback ${fallback}`}: ${dirs}`
    })
    .join("\n")
}

function categoryTable(runs: Run[]): string {
  const label = labelOf(runs)
  const measures: Array<[string, (metrics: Metrics) => string]> = [
    ["context complete", (m) => percent(m.contextCompleteRate)],
    ["context precision", (m) => percent(m.meanPrecision)],
    ["accuracy", correctOverN],
  ]
  return table(
    [
      "category",
      ...runs.flatMap((run) =>
        measures.map(([name]) => `${label(run)} ${name}`)
      ),
    ],
    CATEGORIES.map((category) => [
      category,
      ...runs.flatMap((run) =>
        measures.map(([, cell]) => {
          const metrics = run.byCategory[category]
          return metrics ? cell(metrics) : "-"
        })
      ),
    ])
  )
}

function failureTable(runs: Run[]): string {
  const label = labelOf(runs)
  return table(
    ["family", "failure", "lever", ...runs.map(label)],
    FAILURES.map((failure) => [
      FAILURE_INFO[failure].family,
      failure,
      FAILURE_INFO[failure].lever,
      ...runs.map((run) => String(run.overall.failures[failure] ?? 0)),
    ])
  )
}

function renderPage(runs: Run[]): string {
  const groups = groupRuns(runs)
  return [
    "# Results",
    "",
    "This page is generated by `bun scripts/results-table.ts` from the traced runs. Do not edit it by hand: run the script again.",
    "",
    "## Repeated runs",
    "",
    repeatedTable(groups),
    "",
    groupProvenance(groups),
    "",
    "## Runs",
    "",
    mainTable(runs),
    "",
    RETRIEVAL_NOTE,
    "",
    provenance(runs),
    "",
    "## By stage",
    "",
    stageTable(runs),
    "",
    provenance(runs),
    "",
    "## Per category",
    "",
    categoryTable(runs),
    "",
    provenance(runs),
    "",
    "## Failures",
    "",
    failureTable(runs),
    "",
    provenance(runs),
    "",
  ].join("\n")
}

function run(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: { out: { type: "string" } },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  let runs: Run[]
  try {
    const dirs =
      parsed.positionals.length > 0
        ? parsed.positionals.map((dir) => resolve(dir))
        : latestRunDirs(resolve(RUNS_DIR))
    if (dirs.length === 0) return fail("no run found")
    runs = dirs.map(readRun)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  runs.sort(
    (a, b) => a.config.localeCompare(b.config) || a.split.localeCompare(b.split)
  )

  const out = resolve(parsed.values.out ?? DEFAULT_OUT)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, renderPage(runs))
  console.log(`Wrote ${relative(process.cwd(), out)}`)
  return 0
}

process.exitCode = run(Bun.argv.slice(2))
