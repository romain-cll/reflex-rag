import { openIndex } from "/Users/romain/projects/reflex-rag/src/index/read.ts"
import { noteText } from "/Users/romain/projects/reflex-rag/src/loop/loop.ts"
import { JUDGE_QUESTION } from "/Users/romain/projects/reflex-rag/src/judge/question.ts"
const ROOT = "/Users/romain/projects/reflex-rag"
const index = openIndex(`${ROOT}/.reflex/index.db`)
const qs: any[] = ((await Bun.file(`${ROOT}/evals/dev/questions.json`).json()) as any).questions
async function judge(state: unknown) {
  const r = await fetch("http://localhost:11434/v1/systemone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "clef-flash", state, questions: { verdict: { type: "choice", instructions: JUDGE_QUESTION.instructions, criteria: JUDGE_QUESTION.criteria } } }) })
  const p = ((await r.json()) as any).answers.verdict.probabilities
  return `answer ${p.answer.toFixed(2)} step ${p.step.toFixed(2)} none ${p.none.toFixed(2)}`
}
const note = (path: string) => ({ path, date: index.getNote(path)?.date ?? null, links: [...new Set(index.outgoingLinks(path).map((l) => l.targetPath))], text: noteText(index, path) })
for (const id of ["q-013", "q-015", "q-016", "q-022", "q-023", "q-024", "q-026", "q-027"]) {
  const q = qs.find((x) => x.id === id)
  const [[parent], [target]] = q.sourceGroups
  const link = index.outgoingLinks(parent).find((l) => l.targetPath === target)
  const plain = await judge({ question: q.question, note: note(target) })
  const withPath = await judge({ question: q.question, note: { ...note(target), reached_from: { path: parent, sentence: link?.label ?? null } } })
  console.log(`${id} ${target.split("/").pop()}\n   alone:        ${plain}\n   reached_from: ${withPath}   (link ${link ? "found" : "MISSING"})`)
}
