import { realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { buildIndex } from "../index/build.ts"
import { MistralEmbedder } from "../models/mistral-embedder.ts"
import { parseVault } from "../vault/parse.ts"

const DB_PATH = ".reflex/index.db"

export async function indexCommand(vault: string): Promise<number> {
  try {
    return await runIndex(vault)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`reflex index: ${message.split("\n")[0]}`)
    return 1
  }
}

async function runIndex(vault: string): Promise<number> {
  const vaultPath = resolve(vault)
  if (!(await isDirectory(vaultPath))) {
    console.error(`reflex index: not a directory: ${vault}`)
    return 1
  }
  // Compare real paths: macOS reports temporary folders as /var and /private/var.
  const realVault = await realpath(vaultPath)
  const realIndex = join(await realpath(process.cwd()), DB_PATH)
  if (isInside(realVault, realIndex)) {
    console.error(
      `reflex index: the index would be written inside the vault ${vaultPath}; run reflex index from outside it`
    )
    return 1
  }
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    console.error("reflex index: MISTRAL_API_KEY is missing or empty")
    return 1
  }

  const startedAt = performance.now()
  const parsed = await parseVault(vaultPath)
  const result = await buildIndex({
    vault: parsed,
    embedder: new MistralEmbedder({ apiKey }),
    dbPath: DB_PATH,
    vaultPath,
  })

  const tokens = result.calls.reduce((sum, call) => sum + call.inputTokens, 0)
  const seconds = (performance.now() - startedAt) / 1000
  console.log(
    [
      `Indexed ${vaultPath} into ${DB_PATH}`,
      `  notes:             ${result.notes}`,
      `  chunks:            ${result.chunks}`,
      `  links:             ${result.links}`,
      `  unresolved links:  ${result.unresolved}`,
      `  embedding tokens:  ${tokens}`,
      `  duration:          ${seconds.toFixed(1)} s`,
    ].join("\n")
  )
  return 0
}

function isInside(directory: string, path: string): boolean {
  const rel = relative(directory, path)
  return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
