# CLI skeleton

Phase 0. The `reflex` command exists with its three subcommands, each answering "not implemented" until the later phases fill them in.

## Acceptance criteria

- **AC1**: `reflex index <vault>` writes `not implemented` to stderr and exits with code 1.
- **AC2**: `reflex ask "<question>"` writes `not implemented` to stderr and exits with code 1.
- **AC3**: `reflex eval` and `reflex eval --config <A|B|C>` write `not implemented` to stderr and exit with code 1.
- **AC4**: `reflex` with no arguments, and `reflex --help`, write a usage text listing `index`, `ask` and `eval` to stdout and exit with code 0.
- **AC5**: an unknown command (`reflex foo`) or an unknown option (`reflex ask "q" --foo`) writes an error and the usage text to stderr and exits with code 1.
- **AC6**: `reflex index` without a vault path, and `reflex ask` without a question, write an error to stderr and exit with code 1.
- **AC7**: `reflex eval --config D` (any value other than `A`, `B` or `C`) writes an error to stderr and exits with code 1.

## Technical plan

Files:

- `src/cli.ts`: entry point (`#!/usr/bin/env bun`, already declared as `bin` in `package.json`). Parses `process.argv` with `parseArgs` from `node:util` (`strict: true`, `allowPositionals: true`, options `help` / `-h` and `config`). Dispatches on the first positional, validates the arguments of each command, sets `process.exitCode`.
- `src/commands/index.ts`, `src/commands/ask.ts`, `src/commands/eval.ts`: one exported function per command, taking its validated arguments. For now each writes `reflex <command>: not implemented` to stderr and returns exit code 1.

No new dependency.

## Test strategy

Integration tests in `src/cli.test.ts` with `bun:test`: run the CLI as a subprocess (`Bun.spawnSync(["bun", "src/cli.ts", ...args])`) and assert on stdout, stderr and the exit code. One test or more per acceptance criterion, named after it (`AC1 — …`).
