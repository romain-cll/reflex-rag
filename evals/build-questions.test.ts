import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { generateWorld } from "../corpus/generator/world.ts"
import { buildQuestions } from "./questions.ts"
import { QuestionSetSchema } from "./schema.ts"

const cliPath = resolve(import.meta.dir, "build-questions.ts")
const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-questions-"))
  tempDirs.push(dir)
  return dir
}

function runCli(args: string[], cwd: string) {
  const result = Bun.spawnSync(["bun", cliPath, ...args], { cwd })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

const world = generateWorld({ seed: 42, scale: 1 })
const expectedSet: unknown = JSON.parse(JSON.stringify(buildQuestions(world)))

function writeWorld(corpusDir: string, name: string): void {
  mkdirSync(join(corpusDir, name), { recursive: true })
  writeFileSync(
    join(corpusDir, name, "world.json"),
    JSON.stringify(world, null, 2)
  )
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe("AC9 — CLI with --corpus and --out", () => {
  const root = makeTempDir()
  const corpus = join(root, "corpus-elsewhere")
  const out = join(root, "out-elsewhere")
  const file = join(out, "demo", "questions.json")
  let result: ReturnType<typeof runCli> | undefined

  beforeAll(() => {
    writeWorld(corpus, "demo")
    result = runCli(["demo", "--corpus", corpus, "--out", out], makeTempDir())
  }, 120_000)

  test("AC9 — exits 0", () => {
    expect(result?.exitCode).toBe(0)
  })

  test("AC9 — writes <out>/<name>/questions.json, valid against QuestionSetSchema", () => {
    expect(existsSync(file)).toBe(true)
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    expect(QuestionSetSchema.safeParse(parsed).success).toBe(true)
  })

  test("AC9 — the file holds the questions built from <corpus>/<name>/world.json", () => {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    expect(parsed).toEqual(expectedSet)
  })

  test("AC9 — prints the counts per split and category", () => {
    const stdout = result?.stdout ?? ""
    for (const split of ["tuning", "test"]) expect(stdout).toContain(split)
    for (const category of [
      "simple",
      "multi_hop",
      "temporal",
      "contradiction",
      "no_answer",
    ]) {
      expect(stdout).toContain(category)
    }
    for (const count of ["12", "15", "9"]) {
      expect(stdout).toMatch(new RegExp(`\\b${count}\\b`))
    }
  })

  test("AC9 — leaves the corpus untouched", () => {
    expect(readFileSync(join(corpus, "demo", "world.json"), "utf8")).toBe(
      JSON.stringify(world, null, 2)
    )
  })

  test("AC9 — a second run writes the same file", () => {
    const before = readFileSync(file, "utf8")
    const again = runCli(
      ["demo", "--corpus", corpus, "--out", out],
      makeTempDir()
    )
    expect(again.exitCode).toBe(0)
    expect(readFileSync(file, "utf8")).toBe(before)
  }, 120_000)
})

describe("AC9 — CLI defaults", () => {
  const cwd = makeTempDir()
  let exitCode: number | null = null

  beforeAll(() => {
    writeWorld(join(cwd, "corpus"), "demo")
    exitCode = runCli(["demo"], cwd).exitCode
  }, 120_000)

  test("AC9 — reads corpus/<name>/world.json and writes evals/<name>/questions.json under the working directory", () => {
    expect(exitCode).toBe(0)
    const file = join(cwd, "evals", "demo", "questions.json")
    expect(existsSync(file)).toBe(true)
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    expect(parsed).toEqual(expectedSet)
  })
})
