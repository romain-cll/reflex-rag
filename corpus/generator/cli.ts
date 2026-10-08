#!/usr/bin/env bun
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { BATCH_SIZE, renderBatches } from "./briefs.ts"
import { generateWorld } from "./world.ts"

const usage = `Usage:
  bun corpus/generator/cli.ts generate --name <name> --seed <n> --scale <k> [--out <dir>] [--force]`

interface Options {
  name?: string
  seed?: string
  scale?: string
  out?: string
  force?: boolean
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
    default:
      return fail(command ? `unknown command "${command}"` : "missing command")
  }
}

process.exitCode = run(Bun.argv.slice(2))
