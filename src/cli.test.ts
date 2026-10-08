import { afterAll, describe, expect, test } from "bun:test"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"

const repoRoot = resolve(import.meta.dir, "..")
const cliPath = resolve(import.meta.dir, "cli.ts")
const fixtureVault = resolve(import.meta.dir, "index", "fixtures", "vault")

function runCli(...args: string[]) {
  const result = Bun.spawnSync(["bun", "src/cli.ts", ...args], {
    cwd: repoRoot,
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

function expectListsCommands(text: string) {
  expect(text).toContain("index")
  expect(text).toContain("ask")
  expect(text).toContain("eval")
}

const tempDirs: string[] = []

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

/**
 * Runs the CLI from an empty temporary folder, so that Bun does not load the
 * repository's `.env`. `apiKey` is always set explicitly: `undefined` removes
 * the variable from the environment.
 */
function runIndex(vault: string, apiKey: string | undefined) {
  const cwd = mkdtempSync(join(tmpdir(), "reflex-cli-test-"))
  tempDirs.push(cwd)
  const env: Record<string, string | undefined> = { ...process.env }
  if (apiKey === undefined) delete env.MISTRAL_API_KEY
  else env.MISTRAL_API_KEY = apiKey
  const result = Bun.spawnSync(["bun", cliPath, "index", vault], { cwd, env })
  return {
    cwd,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

describe("AC10 — reflex index errors", () => {
  test("AC10 — a vault that does not exist names the path on stderr and exits 1", () => {
    const vault = join(tmpdir(), "reflex-no-such-vault", "missing")
    const { stdout, stderr, exitCode } = runIndex(vault, "dummy-key")
    expect(stderr).toContain(vault)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC10 — a vault that is a file names the path on stderr and exits 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "reflex-cli-file-"))
    tempDirs.push(dir)
    const file = join(dir, "note.md")
    writeFileSync(file, "# Not a folder\n")
    const { stdout, stderr, exitCode } = runIndex(file, "dummy-key")
    expect(stderr).toContain(file)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC10 — an empty MISTRAL_API_KEY names the variable on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runIndex(fixtureVault, "")
    expect(stderr).toContain("MISTRAL_API_KEY")
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC10 — a missing MISTRAL_API_KEY names the variable on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runIndex(fixtureVault, undefined)
    expect(stderr).toContain("MISTRAL_API_KEY")
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

/**
 * Runs `reflex index <vaultArg>` with `cwd` as working directory and a dummy
 * API key. The proxy points to a closed local port, so that a request which
 * slipped through would fail at once instead of reaching the network.
 */
function runIndexFrom(cwd: string, vaultArg: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    MISTRAL_API_KEY: "dummy-key",
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
  }
  const result = Bun.spawnSync(["bun", cliPath, "index", vaultArg], {
    cwd,
    env,
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe("AC11 — index outside the vault", () => {
  test("AC11 — run from inside the vault, exits 1 naming the vault and writes no .reflex folder", () => {
    // The note is empty: it produces no chunk, so even an implementation that
    // goes on to build the index makes no embedding request.
    const vault = makeTempDir("reflex-cli-inside-")
    writeFileSync(join(vault, "empty.md"), "")
    const { stdout, stderr, exitCode } = runIndexFrom(vault, ".")
    // macOS reports the temporary folder both as /var and as /private/var.
    expect(stderr).toContain(basename(vault))
    expect(stdout).toBe("")
    expect(existsSync(join(vault, ".reflex"))).toBe(false)
    expect(exitCode).toBe(1)
  })
})

describe("AC12 — readable failures", () => {
  test("AC12 — a note with invalid frontmatter prints one reflex index line without stack trace and exits 1", () => {
    const vault = makeTempDir("reflex-cli-broken-")
    writeFileSync(
      join(vault, "broken.md"),
      "---\ntitle: [unclosed\n---\nBody\n"
    )
    const cwd = makeTempDir("reflex-cli-cwd-")
    const { stdout, stderr, exitCode } = runIndexFrom(cwd, vault)
    const lines = stderr.split("\n").filter((line) => line.trim() !== "")
    expect(lines).toHaveLength(1)
    expect(lines[0]).toStartWith("reflex index:")
    expect(stderr).not.toMatch(/^\s+at /m)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

describe("AC2 — reflex ask", () => {
  test("AC2 — reports not implemented on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("ask", "what is a reflex?")
    expect(stderr).toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

describe("AC4 — usage", () => {
  test("AC4 — no arguments prints usage listing the commands on stdout and exits 0", () => {
    const { stdout, stderr, exitCode } = runCli()
    expectListsCommands(stdout)
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })

  test("AC4 — --help prints usage listing the commands on stdout and exits 0", () => {
    const { stdout, stderr, exitCode } = runCli("--help")
    expectListsCommands(stdout)
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })

  test("AC4 — -h prints usage listing the commands on stdout and exits 0", () => {
    const { stdout, stderr, exitCode } = runCli("-h")
    expectListsCommands(stdout)
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
  })
})

describe("AC5 — unknown command or option", () => {
  test("AC5 — unknown command prints an error and usage on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("foo")
    expect(stderr.trim()).not.toBe("")
    expectListsCommands(stderr)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC5 — unknown option prints an error and usage on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("ask", "q", "--foo")
    expect(stderr.trim()).not.toBe("")
    expectListsCommands(stderr)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

describe("AC6 — missing arguments", () => {
  test("AC6 — index without a vault path prints an error on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("index")
    expect(stderr).toMatch(/vault/i)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC6 — ask without a question prints an error on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("ask")
    expect(stderr).toMatch(/question/i)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

describe("AC7 — invalid eval config", () => {
  for (const config of ["D", "a", ""]) {
    test(`AC7 — eval --config "${config}" prints an error on stderr and exits 1`, () => {
      const cwd = makeTempDir("reflex-cli-eval-invalid-")
      const { stdout, stderr, exitCode } = runEvalFrom(cwd, "--config", config)
      expect(stderr).toMatch(/config/i)
      expect(stderr).not.toContain("not implemented")
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }
})

const repoQuestions = resolve(repoRoot, "evals", "dev", "questions.json")

/**
 * Runs `reflex eval <args>` from `cwd` with dummy API keys. The proxy points to
 * a closed local port, so that a request which slipped through would fail at
 * once instead of reaching the network.
 */
function runEvalFrom(cwd: string, ...args: string[]) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ANTHROPIC_API_KEY: "dummy-key",
    MISTRAL_API_KEY: "dummy-key",
    HTTPS_PROXY: "http://127.0.0.1:9",
    HTTP_PROXY: "http://127.0.0.1:9",
  }
  const result = Bun.spawnSync(["bun", cliPath, "eval", ...args], {
    cwd,
    env,
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim() !== "")
}

describe("AC7 — reflex eval arguments and files", () => {
  test("AC7 — reflex eval without --config exits 1 naming --config", () => {
    const cwd = makeTempDir("reflex-cli-eval-noconfig-")
    const { stdout, stderr, exitCode } = runEvalFrom(cwd)
    expect(stderr).toContain("--config")
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC7 — --config C reports not implemented and exits 1, before any file is read", () => {
    const cwd = makeTempDir("reflex-cli-eval-config-")
    const { stdout, stderr, exitCode } = runEvalFrom(cwd, "--config", "C")
    expect(stderr).toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC7 — --split, --limit, --k, --max-cost and --dry-run are accepted options", () => {
    const cwd = makeTempDir("reflex-cli-eval-options-")
    const { stdout, stderr, exitCode } = runEvalFrom(
      cwd,
      "--config",
      "C",
      "--split",
      "tuning",
      "--limit",
      "3",
      "--k",
      "5",
      "--max-cost",
      "0.5",
      "--dry-run"
    )
    expect(stderr).toContain("not implemented")
    expect(stderr).not.toMatch(/unknown option/i)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  for (const split of ["dev", "Test", ""]) {
    test(`AC7 — --split "${split}" prints an error naming the split on stderr and exits 1`, () => {
      const cwd = makeTempDir("reflex-cli-eval-split-")
      const { stdout, stderr, exitCode } = runEvalFrom(
        cwd,
        "--config",
        "A",
        "--split",
        split
      )
      expect(stderr).toMatch(/split/i)
      expect(stderr).not.toMatch(/unknown option/i)
      expect(stderr).not.toContain("not implemented")
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }

  test("AC7 — a missing evals/dev/questions.json gives a one-line error naming the file and exits 1", () => {
    const cwd = makeTempDir("reflex-cli-eval-noquestions-")
    mkdirSync(join(cwd, ".reflex"))
    writeFileSync(join(cwd, ".reflex", "index.db"), "")
    const { stdout, stderr, exitCode } = runEvalFrom(cwd, "--config", "A")
    expect(nonEmptyLines(stderr)).toHaveLength(1)
    expect(stderr).toContain("questions.json")
    expect(stderr).not.toContain("not implemented")
    expect(stderr).not.toMatch(/^\s+at /m)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  test("AC7 — a missing .reflex/index.db gives a one-line error naming the file and exits 1", () => {
    const cwd = makeTempDir("reflex-cli-eval-noindex-")
    mkdirSync(join(cwd, "evals", "dev"), { recursive: true })
    copyFileSync(repoQuestions, join(cwd, "evals", "dev", "questions.json"))
    const { stdout, stderr, exitCode } = runEvalFrom(cwd, "--config", "A")
    expect(nonEmptyLines(stderr)).toHaveLength(1)
    expect(stderr).toContain("index.db")
    expect(stderr).not.toContain("not implemented")
    expect(stderr).not.toMatch(/^\s+at /m)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})

describe("AC7 — config B options", () => {
  test("AC7 — --config B is no longer reported as not implemented: from an empty folder it fails on a missing file, in one line", () => {
    const cwd = makeTempDir("reflex-cli-eval-b-")
    const { stdout, stderr, exitCode } = runEvalFrom(cwd, "--config", "B")
    expect(nonEmptyLines(stderr)).toHaveLength(1)
    expect(stderr).toMatch(/questions\.json|index\.db/)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  for (const rewrite of ["llm", "code"]) {
    test(`AC7 — --config B --rewrite ${rewrite} is accepted: it goes on to the file checks`, () => {
      const cwd = makeTempDir("reflex-cli-eval-rewrite-ok-")
      const { stdout, stderr, exitCode } = runEvalFrom(
        cwd,
        "--config",
        "B",
        "--rewrite",
        rewrite
      )
      expect(stderr).toMatch(/questions\.json|index\.db/)
      expect(stderr).not.toMatch(/unknown option/i)
      expect(stderr).not.toContain("not implemented")
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }

  for (const rewrite of ["foo", "none", ""]) {
    test(`AC7 — --rewrite "${rewrite}" prints an error naming --rewrite on stderr and exits 1`, () => {
      const cwd = makeTempDir("reflex-cli-eval-rewrite-bad-")
      const { stdout, stderr, exitCode } = runEvalFrom(
        cwd,
        "--config",
        "B",
        "--rewrite",
        rewrite
      )
      expect(stderr).toContain("--rewrite")
      expect(stderr).toMatch(/llm/)
      expect(stderr).toMatch(/code/)
      expect(stderr).not.toMatch(/unknown option/i)
      expect(stderr).not.toContain("not implemented")
      expect(stderr).not.toMatch(/questions\.json|index\.db/)
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }

  for (const rewrite of ["llm", "code"]) {
    test(`AC7 — --rewrite ${rewrite} with --config A is rejected, naming --rewrite and the config`, () => {
      const cwd = makeTempDir("reflex-cli-eval-rewrite-a-")
      const { stdout, stderr, exitCode } = runEvalFrom(
        cwd,
        "--config",
        "A",
        "--rewrite",
        rewrite
      )
      expect(nonEmptyLines(stderr)).toHaveLength(1)
      expect(stderr).toContain("--rewrite")
      expect(stderr).toMatch(/config/i)
      expect(stderr).not.toMatch(/unknown option/i)
      expect(stderr).not.toContain("not implemented")
      expect(stderr).not.toMatch(/questions\.json|index\.db/)
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }

  test("AC7 — --candidates with a positive integer is accepted: it goes on to the file checks", () => {
    const cwd = makeTempDir("reflex-cli-eval-candidates-ok-")
    const { stdout, stderr, exitCode } = runEvalFrom(
      cwd,
      "--config",
      "B",
      "--candidates",
      "20"
    )
    expect(stderr).toMatch(/questions\.json|index\.db/)
    expect(stderr).not.toMatch(/unknown option/i)
    expect(stderr).not.toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  for (const candidates of ["0", "-3", "1.5", "abc", ""]) {
    test(`AC7 — --candidates "${candidates}" prints an error naming --candidates on stderr and exits 1`, () => {
      const cwd = makeTempDir("reflex-cli-eval-candidates-bad-")
      const { stdout, stderr, exitCode } = runEvalFrom(
        cwd,
        "--config",
        "B",
        // The `=` form lets a value start with a dash.
        `--candidates=${candidates}`
      )
      expect(stderr).toContain("--candidates")
      expect(stderr).toMatch(/positive integer/)
      expect(stderr).not.toMatch(/unknown option/i)
      expect(stderr).not.toContain("not implemented")
      expect(stderr).not.toMatch(/questions\.json|index\.db/)
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }

  test("AC7 — config C still reports not implemented, with the config B options", () => {
    const cwd = makeTempDir("reflex-cli-eval-c-")
    const { stdout, stderr, exitCode } = runEvalFrom(
      cwd,
      "--config",
      "C",
      "--rewrite",
      "code",
      "--candidates",
      "20"
    )
    expect(stderr).toContain("not implemented")
    expect(stderr).not.toMatch(/unknown option/i)
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })
})
