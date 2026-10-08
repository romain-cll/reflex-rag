import { stat } from "node:fs/promises"
import { resolve } from "node:path"
import { buildIndex } from "../index/build.ts"
import { MistralEmbedder } from "../models/mistral-embedder.ts"
import { parseVault } from "../vault/parse.ts"

const DB_PATH = ".reflex/index.db"

export async function indexCommand(vault: string): Promise<number> {
  const vaultPath = resolve(vault)
  if (!(await isDirectory(vaultPath))) {
    console.error(`reflex index: not a directory: ${vault}`)
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

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
