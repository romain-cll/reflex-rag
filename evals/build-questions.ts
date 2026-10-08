#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { WorldSchema } from "../corpus/generator/schema.ts"
import { buildQuestions } from "./questions.ts"
import { CATEGORIES, SPLITS } from "./schema.ts"

const usage = `Usage:
  bun evals/build-questions.ts <name> [--corpus <dir>] [--out <dir>]`

function fail(message: string): number {
  console.error(`questions: ${message}\n\n${usage}`)
  return 1
}

function run(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: { corpus: { type: "string" }, out: { type: "string" } },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const [name] = parsed.positionals
  if (!name) return fail("the name of a corpus is required")
  const worldPath = resolve(
    parsed.values.corpus ?? "corpus",
    name,
    "world.json"
  )
  let text
  try {
    text = readFileSync(worldPath, "utf8")
  } catch {
    return fail(`${worldPath} not found`)
  }

  let set
  try {
    set = buildQuestions(WorldSchema.parse(JSON.parse(text)))
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const dir = resolve(parsed.values.out ?? "evals", name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "questions.json"),
    `${JSON.stringify(set, null, 2)}\n`
  )

  for (const split of SPLITS) {
    const counts = CATEGORIES.map((category) => {
      const count = set.questions.filter(
        (q) => q.split === split && q.category === category
      ).length
      return `${category} ${count}`
    })
    console.log(`${split}: ${counts.join(", ")}`)
  }
  console.log(`${set.questions.length} questions in ${dir}`)
  return 0
}

process.exitCode = run(Bun.argv.slice(2))
