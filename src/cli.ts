#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { askCommand } from "./commands/ask.ts"
import { evalCommand, type EvalConfig } from "./commands/eval.ts"
import { indexCommand } from "./commands/index.ts"

const usage = `Usage: reflex <command> [options]

Commands:
  index <vault>              Index an Obsidian vault
  ask "<question>"           Ask a question about the vault
  eval --config <A|B|C>      Run the evals
    [--split test|tuning] [--limit <n>] [--k <n>] [--max-cost <usd>] [--dry-run]

Options:
  -h, --help                 Show this help`

const evalConfigs: readonly string[] = ["A", "B", "C"]

function fail(message: string): number {
  console.error(`reflex: ${message}`)
  return 1
}

function failWithUsage(message: string): number {
  console.error(`reflex: ${message}\n\n${usage}`)
  return 1
}

function run(argv: string[]): number | Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        config: { type: "string" },
        split: { type: "string" },
        limit: { type: "string" },
        k: { type: "string" },
        "max-cost": { type: "string" },
        "dry-run": { type: "boolean" },
      },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    return failWithUsage(error instanceof Error ? error.message : String(error))
  }

  const { values, positionals } = parsed
  const [command, argument] = positionals

  if (values.help || command === undefined) {
    console.log(usage)
    return 0
  }

  switch (command) {
    case "index":
      return argument === undefined
        ? fail("index: missing vault path")
        : indexCommand(argument)
    case "ask":
      return argument === undefined
        ? fail("ask: missing question")
        : askCommand(argument)
    case "eval": {
      const { config } = values
      if (config === undefined) return fail("eval: --config is required")
      if (!evalConfigs.includes(config)) {
        return fail(`eval: invalid config "${config}", expected A, B or C`)
      }
      return evalCommand(config as EvalConfig, {
        split: values.split,
        limit: values.limit,
        k: values.k,
        maxCost: values["max-cost"],
        dryRun: values["dry-run"],
      })
    }
    default:
      return failWithUsage(`unknown command "${command}"`)
  }
}

process.exitCode = await run(process.argv.slice(2))
