#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"
import { CATEGORIES, SPLITS } from "../evals/schema.ts"

const usage = `Usage:
  bun scripts/compare-runs.ts <runDir>...

Prints one markdown table putting the runs side by side, from their settings
line and their summary.json.`

const SettingsSchema = z.looseObject({
  config: z.string(),
  split: z.enum(SPLITS),
})

const MetricsSchema = z.looseObject({
  n: z.number(),
  accuracy: z.number().nullable(),
  meanRecall: z.number().nullable(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
  meanCostUsd: z.number().nullable(),
  /** Absent from the summaries written before config B. */
  meanHops: z.number().nullish(),
})

type Metrics = z.infer<typeof MetricsSchema>

const SummarySchema = z.looseObject({
  overall: MetricsSchema,
  byCategory: z.record(z.string(), MetricsSchema),
})

interface Run {
  /** The label of the run's columns, e.g. "A test". */
  label: string
  rows: Map<string, Metrics>
  /** Whether the run has a loop, hence hops to show. */
  hasLoop: boolean
}

function fail(message: string): number {
  console.error(`compare-runs: ${message}\n\n${usage}`)
  return 1
}

/** The settings line of the trace: its first line. */
function readSettings(dir: string): unknown {
  const trace = readFileSync(join(dir, "trace.jsonl"), "utf8")
  return JSON.parse(trace.split("\n")[0]!)
}

function readRun(dir: string): Run {
  const settings = SettingsSchema.parse(readSettings(dir))
  const summary = SummarySchema.parse(
    JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))
  )
  return {
    label: `${settings.config} ${settings.split}`,
    rows: new Map([
      ...Object.entries(summary.byCategory),
      ["overall", summary.overall],
    ]),
    hasLoop: summary.overall.meanHops != null,
  }
}

const COLUMNS: Array<{
  name: string
  /** `loop` columns are shown for loop runs only. */
  loop?: boolean
  format: (metrics: Metrics) => string
}> = [
  { name: "correct/n", format: correctOverN },
  { name: "recall", format: (m) => percent(m.meanRecall) },
  { name: "p50", format: (m) => fixed(m.latencyP50Ms, 0) },
  { name: "p95", format: (m) => fixed(m.latencyP95Ms, 0) },
  { name: "cost", format: (m) => fixed(m.meanCostUsd, 5) },
  { name: "hops", loop: true, format: (m) => fixed(m.meanHops, 2) },
]

function correctOverN({ accuracy, n }: Metrics): string {
  return accuracy === null ? "-" : `${Math.round(accuracy * n)}/${n}`
}

function percent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`
}

function fixed(value: number | null | undefined, digits: number): string {
  return value == null ? "-" : value.toFixed(digits)
}

function renderTable(runs: Run[]): string {
  const columns = runs.flatMap((run) =>
    COLUMNS.filter((column) => run.hasLoop || !column.loop).map((column) => ({
      header: `${run.label} ${column.name}`,
      cell: (label: string) => {
        const metrics = run.rows.get(label)
        return metrics ? column.format(metrics) : "-"
      },
    }))
  )
  const labels = [
    ...CATEGORIES.filter((category) =>
      runs.some((run) => run.rows.has(category))
    ),
    "overall",
  ]
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`
  return [
    line(["category", ...columns.map(({ header }) => header)]),
    line(["---", ...columns.map(() => "---:")]),
    ...labels.map((label) =>
      line([label, ...columns.map(({ cell }) => cell(label))])
    ),
  ].join("\n")
}

function run(dirs: string[]): number {
  if (dirs.length === 0) return fail("at least one run folder is required")
  let runs: Run[]
  try {
    runs = dirs.map((dir) => readRun(resolve(dir)))
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  console.log(renderTable(runs))
  return 0
}

process.exitCode = run(Bun.argv.slice(2))
