#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"
import { QuestionSetSchema, SPLITS, type Question } from "../evals/schema.ts"
import { contextMeasuresOf, grade } from "../src/eval/grade.ts"
import {
  jsonLine,
  loopNotesOf,
  renderReport,
  summarize,
  type RunRecord,
} from "../src/eval/run.ts"

const usage = `Usage:
  bun scripts/regrade-run.ts <runDir> [--questions <path>]

Regrades a run with the current grader, without any model call. The questions
default to evals/dev/questions.json.`

const SettingsSchema = z.looseObject({
  config: z.string(),
  split: z.enum(SPLITS),
  k: z.number(),
  /** Absent from the traces written before `--candidates` was recorded. */
  candidates: z.number().optional(),
  gitCommit: z.string(),
})

const RecordSchema = z.looseObject({ id: z.string() })

function fail(message: string): number {
  console.error(`regrade-run: ${message}\n\n${usage}`)
  return 1
}

/** The lines of a JSON Lines file, parsed. */
function readJsonLines(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): unknown => JSON.parse(line))
}

function regrade(record: RunRecord, question: Question): RunRecord {
  const regraded = {
    ...record,
    ...contextMeasuresOf(question, record.contextNotes),
  }
  // A loop or an answer that failed has no output to grade: it keeps its failure.
  if (record.output === null) return regraded
  return {
    ...regraded,
    grade: grade(
      question,
      record.output,
      record.contextNotes,
      loopNotesOf(record.loop)
    ),
  }
}

function gitCommit(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
  return result.exitCode === 0 ? result.stdout.toString().trim() : "unknown"
}

function run(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: { questions: { type: "string" } },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  const [runDir] = parsed.positionals
  if (!runDir) return fail("the run folder is required")
  const dir = resolve(runDir)
  const tracePath = join(dir, "trace.jsonl")
  const questionsPath = resolve(
    parsed.values.questions ?? "evals/dev/questions.json"
  )

  let questions: Map<string, Question>
  let settings: z.infer<typeof SettingsSchema>
  let records: RunRecord[]
  try {
    const set = QuestionSetSchema.parse(
      JSON.parse(readFileSync(questionsPath, "utf8"))
    )
    questions = new Map(
      set.questions.map((question) => [question.id, question])
    )
    const [first, ...rest] = readJsonLines(tracePath)
    settings = SettingsSchema.parse(first)
    records = rest.map((line) => {
      const { id } = RecordSchema.parse(line)
      const question = questions.get(id)
      if (!question) throw new Error(`${id} is not in ${questionsPath}`)
      return regrade(line as RunRecord, question)
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const summary = summarize(records)
  const regraded = { gitCommit: gitCommit(), date: new Date().toISOString() }
  writeFileSync(
    tracePath,
    [{ ...settings, regraded }, ...records].map(jsonLine).join("")
  )
  writeFileSync(
    join(dir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  )
  writeFileSync(
    join(dir, "report.md"),
    renderReport(settings, records, summary)
  )
  console.log(`Regraded ${records.length} records in ${runDir}`)
  return 0
}

process.exitCode = run(Bun.argv.slice(2))
