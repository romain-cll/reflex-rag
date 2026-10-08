import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { WorldSchema } from "./schema.ts"
import { generateWorld } from "./world.ts"

const cliPath = resolve(import.meta.dir, "cli.ts")
const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "reflex-corpus-"))
  tempDirs.push(dir)
  return dir
}

function runCli(args: string[], cwd?: string) {
  const result = Bun.spawnSync(["bun", cliPath, ...args], {
    cwd: cwd ?? tmpdir(),
  })
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  }
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe("AC13 — CLI generate", () => {
  const out = makeTempDir()
  const name = "demo"
  const seed = 7
  const root = join(out, name)
  let exitCode: number | null = null

  beforeAll(() => {
    const result = runCli([
      "generate",
      "--name",
      name,
      "--seed",
      String(seed),
      "--scale",
      "1",
      "--out",
      out,
    ])
    exitCode = result.exitCode
  }, 60_000)

  test("AC13 — generate exits 0", () => {
    expect(exitCode).toBe(0)
  })

  test("AC13 — writes <out>/<name>/world.json holding the world for the seed and scale", () => {
    const file = join(root, "world.json")
    expect(existsSync(file)).toBe(true)
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    const world = WorldSchema.parse(parsed)
    expect(world.meta.seed).toBe(seed)
    expect(world.meta.scale).toBe(1)
    expect(world).toEqual(generateWorld({ seed, scale: 1 }))
  })

  test("AC13 — writes briefs/batch-NN.md files covering every note exactly once", () => {
    const briefsDir = join(root, "briefs")
    expect(existsSync(briefsDir)).toBe(true)
    const files = readdirSync(briefsDir).sort()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toEqual(
      files.map((_, index) => `batch-${String(index + 1).padStart(2, "0")}.md`)
    )
    const world = generateWorld({ seed, scale: 1 })
    const contents = files.map((file) =>
      readFileSync(join(briefsDir, file), "utf8")
    )
    const missing: string[] = []
    for (const note of world.notes) {
      const holders = contents.filter((text) => text.includes(note.path))
      if (holders.length !== 1) {
        missing.push(`${note.path}: in ${holders.length} batches`)
      }
    }
    expect(missing).toEqual([])
  })

  test("AC13 — --out defaults to corpus, relative to the working directory", () => {
    const cwd = makeTempDir()
    const result = runCli(
      ["generate", "--name", "dflt", "--seed", "3", "--scale", "1"],
      cwd
    )
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(cwd, "corpus", "dflt", "world.json"))).toBe(true)
    expect(
      existsSync(join(cwd, "corpus", "dflt", "briefs", "batch-01.md"))
    ).toBe(true)
  }, 60_000)

  test("AC13 — refuses with exit code 1 when <out>/<name>/vault already exists", () => {
    const dir = makeTempDir()
    const vault = join(dir, "kept", "vault")
    mkdirSync(vault, { recursive: true })
    writeFileSync(join(vault, "marker.md"), "keep me")
    const result = runCli([
      "generate",
      "--name",
      "kept",
      "--seed",
      "5",
      "--scale",
      "1",
      "--out",
      dir,
    ])
    expect(result.exitCode).toBe(1)
    expect(result.stderr.trim()).not.toBe("")
    expect(existsSync(join(dir, "kept", "world.json"))).toBe(false)
    expect(readFileSync(join(vault, "marker.md"), "utf8")).toBe("keep me")
  }, 60_000)

  test("AC13 — --force generates even when <out>/<name>/vault already exists", () => {
    const dir = makeTempDir()
    mkdirSync(join(dir, "forced", "vault"), { recursive: true })
    const result = runCli([
      "generate",
      "--name",
      "forced",
      "--seed",
      "5",
      "--scale",
      "1",
      "--out",
      dir,
      "--force",
    ])
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, "forced", "world.json"))).toBe(true)
    expect(existsSync(join(dir, "forced", "briefs", "batch-01.md"))).toBe(true)
  }, 60_000)
})
