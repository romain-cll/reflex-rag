#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { askCommand } from "./commands/ask.ts"
import { evalCommand, type EvalConfig } from "./commands/eval.ts"
import { indexCommand } from "./commands/index.ts"

const usage = `Usage: reflex <command> [options]

Commands:
  index <vault>              Index an Obsidian vault
  ask "<question>"           Ask a question about the vault
  eval [--config <A|B|C>]    Run the evals

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

function run(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        help: { type: "boolean", short: "h" },
        config: { type: "string" },
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
      if (config !== undefined && !evalConfigs.includes(config)) {
        return fail(`eval: invalid config "${config}", expected A, B or C`)
      }
      return evalCommand(config as EvalConfig | undefined)
    }
    default:
      return failWithUsage(`unknown command "${command}"`)
  }
}

process.exitCode = run(process.argv.slice(2))
