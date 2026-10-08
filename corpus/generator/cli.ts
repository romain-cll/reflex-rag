#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { BATCH_SIZE, renderBatches } from "./briefs.ts"
import { WorldSchema, type World } from "./schema.ts"
import { validateVault, type Issue } from "./validate.ts"
import { generateWorld } from "./world.ts"

const usage = `Usage:
  bun corpus/generator/cli.ts generate --name <name> --seed <n> --scale <k> [--out <dir>] [--force]
  bun corpus/generator/cli.ts validate <name> [--out <dir>] [--batch <batch-NN>]`

interface Options {
  name?: string
  seed?: string
  scale?: string
  out?: string
  force?: boolean
  batch?: string
}

function fail(message: string): number {
  console.error(`corpus: ${message}\n\n${usage}`)
  return 1
}

function generate(options: Options): number {
  const seed = Number(options.seed)
  const scale = Number(options.scale)
  if (!options.name) return fail("--name is required")
  if (!Number.isInteger(seed)) return fail("--seed must be an integer")
  if (!Number.isInteger(scale) || scale < 1) {
    return fail("--scale must be a positive integer")
  }

  const root = resolve(options.out ?? "corpus", options.name)
  const vault = join(root, "vault")
  if (existsSync(vault) && !options.force) {
    return fail(
      `${vault} already exists: the notes were written from the current world. Pass --force to regenerate anyway.`
    )
  }

  const world = generateWorld({ seed, scale })
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, "world.json"), `${JSON.stringify(world, null, 2)}\n`)
  const briefs = join(root, "briefs")
  rmSync(briefs, { recursive: true, force: true })
  mkdirSync(briefs)
  const batches = renderBatches(world, BATCH_SIZE)
  for (const batch of batches) {
    writeFileSync(join(briefs, `${batch.name}.md`), batch.markdown)
  }
  console.log(
    `${world.notes.length} notes, ${world.facts.length} facts, ${world.traps.length} traps, ${world.chains.length} chains, ${world.absent.length} absent topics, ${batches.length} briefs in ${root}`
  )
  return 0
}

function readVault(vault: string): Map<string, string> {
  if (!existsSync(vault)) return new Map()
  // Glob skips dot files and folders (`.obsidian`) by default.
  const paths = [...new Bun.Glob("**/*.md").scanSync({ cwd: vault })].sort()
  return new Map(
    paths.map((path) => [path, readFileSync(join(vault, path), "utf8")])
  )
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** Issues grouped under their note path. */
function formatIssues(errors: Issue[], warnings: Issue[]): string[] {
  const byPath = new Map<string, string[]>()
  const add = (label: string, { path, rule, message }: Issue) => {
    const lines = byPath.get(path) ?? []
    lines.push(`  ${label} ${rule}: ${message}`)
    byPath.set(path, lines)
  }
  errors.forEach((issue) => add("error  ", issue))
  warnings.forEach((issue) => add("warning", issue))
  return [...byPath].sort().flatMap(([path, lines]) => [path, ...lines, ""])
}

/** Paths of the notes of a batch, or undefined when there is no such batch. */
function batchPaths(world: World, name: string): Set<string> | undefined {
  const batch = renderBatches(world, BATCH_SIZE).find((b) => b.name === name)
  if (!batch) return undefined
  const ids = new Set(batch.noteIds)
  return new Set(
    world.notes.filter(({ id }) => ids.has(id)).map(({ path }) => path)
  )
}

function validate(name: string | undefined, options: Options): number {
  if (!name) return fail("validate needs the name of a corpus")
  const root = resolve(options.out ?? "corpus", name)
  const worldPath = join(root, "world.json")
  if (!existsSync(worldPath)) return fail(`${worldPath} not found`)

  const world = WorldSchema.parse(JSON.parse(readFileSync(worldPath, "utf8")))
  let { errors, warnings } = validateVault(
    world,
    readVault(join(root, "vault"))
  )
  if (options.batch !== undefined) {
    const paths = batchPaths(world, options.batch)
    if (!paths) return fail(`unknown batch "${options.batch}"`)
    const inBatch = ({ path }: Issue) => paths.has(path)
    errors = errors.filter(inBatch)
    warnings = warnings.filter(inBatch)
  }

  console.log(formatIssues(errors, warnings).join("\n"))
  console.log(
    `${plural(errors.length, "error")}, ${plural(warnings.length, "warning")}`
  )
  return errors.length > 0 ? 1 : 0
}

function run(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        name: { type: "string" },
        seed: { type: "string" },
        scale: { type: "string" },
        out: { type: "string" },
        force: { type: "boolean" },
        batch: { type: "string" },
      },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const [command] = parsed.positionals
  switch (command) {
    case "generate":
      return generate(parsed.values)
    case "validate":
      return validate(parsed.positionals[1], parsed.values)
    default:
      return fail(command ? `unknown command "${command}"` : "missing command")
  }
}

process.exitCode = run(Bun.argv.slice(2))
