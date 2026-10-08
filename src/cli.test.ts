import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

const repoRoot = resolve(import.meta.dir, "..")

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

describe("AC1 — reflex index", () => {
  test("AC1 — reports not implemented on stderr and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("index", "some-vault")
    expect(stderr).toContain("not implemented")
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

describe("AC3 — reflex eval", () => {
  test("AC3 — without options reports not implemented and exits 1", () => {
    const { stdout, stderr, exitCode } = runCli("eval")
    expect(stderr).toContain("not implemented")
    expect(stdout).toBe("")
    expect(exitCode).toBe(1)
  })

  for (const config of ["A", "B", "C"]) {
    test(`AC3 — with --config ${config} reports not implemented and exits 1`, () => {
      const { stdout, stderr, exitCode } = runCli("eval", "--config", config)
      expect(stderr).toContain("not implemented")
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }
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
      const { stdout, stderr, exitCode } = runCli("eval", "--config", config)
      expect(stderr).toMatch(/config/i)
      expect(stderr).not.toContain("not implemented")
      expect(stdout).toBe("")
      expect(exitCode).toBe(1)
    })
  }
})
