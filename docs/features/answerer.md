# Answerer

Phase 2. The fixed, minimal LLM step that turns a context packet into a cited answer, so that the evals can measure end-to-end quality. In MCP use the host LLM writes the answer; this answerer exists for the evals only.

## Acceptance criteria

- **AC1 — structured LLM call**: the `LLM` interface gains `completeJson(request, schema)`, which returns `{ value, call }` where `value` is parsed and validated against the Zod `schema`. `AnthropicLLM` implements `LLM` with the official SDK: `messages.create` for `complete`, `messages.parse` with `output_config.format` built from the schema for `completeJson`, model `claude-haiku-5-5` by default, `output_config.effort` from the options (default `low`), no sampling parameters. `call` reports the model, `usage.input_tokens`, `usage.output_tokens` and the latency.
- **AC2 — failures**: an API error, a refusal (`stop_reason` `refusal`), a truncated output (`max_tokens`) or an output that does not validate throws an error whose message names the cause, and which carries the `ModelCall` of the request when the API answered (tokens are billed even then). The SDK's `messages.parse` applies the output format's `parse` to the text before returning, so the format given to it must not throw: `stop_reason` is checked first, then the text is parsed and validated with the Zod schema.
- **AC3 — answer shape**: `answerQuestion(question, context, llm)` returns `{ output, call }` where `output` is `{ status, value, answer, citations }`: `status` is `answered`, `conflict` or `abstained`; `value` is the bare answer alone (a name, a date, an amount, a short phrase, or `no decision`; empty when `abstained`; for `conflict`, each value separated by `|`); `answer` is a short text that may explain; `citations` are note paths taken from the context.
- **AC4 — prompt**: the request sends a fixed system prompt and a user message holding the question and every context chunk in rank order, each with its note path, the note date, the heading and the text. The system prompt tells the model to answer only from the excerpts, to set `abstained` when they do not hold the answer (never inferring a "no" from the absence of a mention), to set `conflict` and give each value with its source when sources disagree without one superseding the other, to answer that no decision was made (status `answered`) when the excerpts say a question was discussed but left open, to copy names, dates and amounts exactly as written in the excerpts, to cite the note paths it used, to keep the answer short, and to put in `value` only the answer itself, without the outdated values it replaces.
- **AC5 — citations**: citations that are not note paths of the context are removed from the output.
- **AC6 — no real calls in tests**: `AnthropicLLM` takes an injectable client, so that every test runs on a fake.

## Technical plan

Files:

- `src/core/llm.ts` (modified): add `completeJson<T>(request: LLMRequest, schema: z.ZodType<T>): Promise<{ value: T; call: ModelCall }>`.
- `src/models/anthropic-llm.ts` (new): `class AnthropicLLM implements LLM`, options `{ client?: Anthropic; model?: string; effort?: "low" | "medium" | "high" }` (the token budget comes from each request); the client defaults to `new Anthropic()` (key from `ANTHROPIC_API_KEY`).
- `src/answer/answerer.ts` (new): `AnswerSchema`, `answerQuestion(question: string, context: ContextChunk[], llm: LLM)`, with `ContextChunk { notePath; noteDate: string | null; heading; text }`, and the system prompt as a constant.
- Dependency: `@anthropic-ai/sdk` (new). Check that its Zod helper works with the installed `zod` 4; if not, build the JSON schema with `z.toJSONSchema` and validate the parsed text with Zod.

## Test strategy

Unit tests in `src/models/anthropic-llm.test.ts` with a fake client object (records the request, returns scripted responses or throws): request shape, usage mapping, failures. Unit tests in `src/answer/answerer.test.ts` with a fake `LLM`: prompt content and order, output validation, citation filtering. No network.
