export type EvalConfig = "A" | "B" | "C"

export function evalCommand(config?: EvalConfig): number {
  void config
  console.error("reflex eval: not implemented")
  return 1
}
