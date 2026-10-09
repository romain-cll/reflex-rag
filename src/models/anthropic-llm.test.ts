import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import type { LLM } from "../core/llm.ts"
import type { ModelCall } from "../core/types.ts"
import { AnthropicLLM } from "./anthropic-llm.ts"
import * as llmModule from "./anthropic-llm.ts"

/** The part of a request to `messages.create` / `messages.parse` we check. */
interface RecordedParams {
  model: string
  max_tokens: number
  system?: unknown
  messages: { role: string; content: unknown }[]
  output_config?: {
    effort?: string
    format?: {
      type: string
      schema: {
        properties?: Record<string, unknown>
        required?: string[]
        additionalProperties?: unknown
      }
      parse?: (text: string) => unknown
    }
  }
  [key: string]: unknown
}

type Responder = (params: RecordedParams) => unknown

const Schema = z.object({ city: z.string(), population: z.number() })

const DEFAULT_MODEL = "claude-haiku-5-5"

interface MessageOptions {
  model?: string
  text?: string
  stopReason?: string
  inputTokens?: number
  outputTokens?: number
  parsed?: unknown
}

/** A Messages API response, with the fields the wrapper may read. */
function message(options: MessageOptions = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: options.model ?? DEFAULT_MODEL,
    content: [{ type: "text", text: options.text ?? "hello" }],
    stop_reason: options.stopReason ?? "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: options.inputTokens ?? 11,
      output_tokens: options.outputTokens ?? 7,
    },
    parsed_output: options.parsed ?? null,
  }
}

function setup(script: { create?: Responder; parse?: Responder }) {
  const created: RecordedParams[] = []
  const parsed: RecordedParams[] = []
  const unscripted: Responder = () => {
    throw new Error("unexpected call to the fake client")
  }
  const client = {
    messages: {
      create: async (params: RecordedParams) => {
        created.push(params)
        return await (script.create ?? unscripted)(params)
      },
      parse: async (params: RecordedParams) => {
        parsed.push(params)
        return await (script.parse ?? unscripted)(params)
      },
    },
  } as unknown as Anthropic
  return { client, created, parsed }
}

/**
 * Wraps a scripted response so that it behaves like `messages.parse` of the
 * SDK (0.132): the `parse` of the output format, or `JSON.parse` without one,
 * is applied to the text of every text block before the message is returned,
 * and a throw becomes `Failed to parse structured output: ...`, whatever the
 * `stop_reason` is.
 */
function sdkParse(respond: Responder): Responder {
  return async (params) => {
    const response = (await respond(params)) as ReturnType<typeof message>
    const format = params.output_config?.format
    let firstParsed: unknown = null
    if (format?.type === "json_schema") {
      for (const block of response.content) {
        if (block.type !== "text") continue
        try {
          const parsedOutput =
            typeof format.parse === "function"
              ? format.parse(block.text)
              : (JSON.parse(block.text) as unknown)
          if (firstParsed === null) firstParsed = parsedOutput
        } catch (error) {
          throw new Error(
            `Failed to parse structured output: ${String(error)}`,
            { cause: error }
          )
        }
      }
    }
    return { ...response, parsed_output: firstParsed }
  }
}

/** The `ModelCall` an error carries in `error.call`, if any. */
function callOf(error: Error): ModelCall | undefined {
  return (error as Error & { call?: ModelCall }).call
}

/** The error carries the call of the response, with its billed tokens. */
function expectCall(
  error: Error,
  tokens: { inputTokens: number; outputTokens: number }
): void {
  const call = callOf(error)
  expect(call).toBeDefined()
  expect(call?.model).toBe(DEFAULT_MODEL)
  expect(call?.inputTokens).toBe(tokens.inputTokens)
  expect(call?.outputTokens).toBe(tokens.outputTokens)
  expect(Number.isFinite(call?.latencyMs)).toBe(true)
}

/** The text of the single user message, whatever its content shape. */
function userText(params: RecordedParams): string {
  expect(params.messages).toHaveLength(1)
  const [only] = params.messages
  expect(only?.role).toBe("user")
  const content = only?.content
  if (typeof content === "string") return content
  return (content as { type: string; text?: string }[])
    .map((block) => block.text ?? "")
    .join("")
}

/** The text of the `system` parameter, whatever its shape. */
function systemText(params: RecordedParams): string {
  const system = params.system
  if (typeof system === "string") return system
  return (system as { text: string }[]).map((block) => block.text).join("")
}

/** The error a promise rejects with; fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error("rejected with a non-Error value", { cause: error })
  }
  throw new Error("expected the promise to reject")
}

const good = { city: "Lyon", population: 522_000 }

describe("AnthropicLLM", () => {
  test("AC1 — implements the LLM interface and exposes the default model", () => {
    const { client } = setup({})
    const llm: LLM = new AnthropicLLM({ client })
    expect(llm.model).toBe(DEFAULT_MODEL)
    expect(typeof llm.complete).toBe("function")
    expect(typeof llm.completeJson).toBe("function")
  })

  test("AC1 — exposes the model given in the options", () => {
    const { client } = setup({})
    const llm = new AnthropicLLM({ client, model: "claude-test-model" })
    expect(llm.model).toBe("claude-test-model")
  })

  test("AC1 — complete sends the prompt through messages.create with the default model and low effort", async () => {
    const { client, created, parsed } = setup({ create: () => message() })
    const llm = new AnthropicLLM({ client })

    await llm.complete({
      system: "Be brief.",
      prompt: "What is the capital of France?",
      maxTokens: 321,
    })

    expect(parsed).toHaveLength(0)
    expect(created).toHaveLength(1)
    const params = created[0] as RecordedParams
    expect(params.model).toBe(DEFAULT_MODEL)
    expect(params.max_tokens).toBe(321 + llmModule.THINKING_HEADROOM_TOKENS)
    expect(systemText(params)).toBe("Be brief.")
    expect(userText(params)).toBe("What is the capital of France?")
    expect(params.output_config?.effort).toBe("low")
    expect(params.output_config?.format).toBeUndefined()
  })

  test("AC7 — THINKING_HEADROOM_TOKENS is 4096", () => {
    expect(llmModule.THINKING_HEADROOM_TOKENS).toBe(4096)
  })

  test("AC7 — complete and completeJson both send maxTokens plus the headroom as max_tokens", async () => {
    const { client, created, parsed } = setup({
      create: () => message(),
      parse: () => message({ parsed: good }),
    })
    const llm = new AnthropicLLM({ client })

    await llm.complete({ prompt: "Hi", maxTokens: 50 })
    await llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)

    expect((created[0] as RecordedParams).max_tokens).toBe(50 + 4096)
    expect((parsed[0] as RecordedParams).max_tokens).toBe(50 + 4096)
  })

  test("AC1 — complete leaves the system parameter out when the request has none", async () => {
    const { client, created } = setup({ create: () => message() })
    const llm = new AnthropicLLM({ client })

    await llm.complete({ prompt: "Hi", maxTokens: 50 })

    expect((created[0] as RecordedParams).system).toBeUndefined()
  })

  test("AC1 — complete uses the model and effort given in the options", async () => {
    const { client, created } = setup({
      create: () => message({ model: "claude-test-model" }),
    })
    const llm = new AnthropicLLM({
      client,
      model: "claude-test-model",
      effort: "high",
    })

    await llm.complete({ prompt: "Hi", maxTokens: 50 })

    const params = created[0] as RecordedParams
    expect(params.model).toBe("claude-test-model")
    expect(params.output_config?.effort).toBe("high")
  })

  test("AC1 — complete sends no sampling parameters", async () => {
    const { client, created } = setup({ create: () => message() })
    const llm = new AnthropicLLM({ client })

    await llm.complete({ prompt: "Hi", maxTokens: 50 })

    const params = created[0] as RecordedParams
    expect(params).not.toHaveProperty("temperature")
    expect(params).not.toHaveProperty("top_p")
    expect(params).not.toHaveProperty("top_k")
  })

  test("AC1 — complete returns the response text and its ModelCall", async () => {
    const { client } = setup({
      create: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40))
        return message({
          text: "Paris.",
          inputTokens: 123,
          outputTokens: 45,
        })
      },
    })
    const llm = new AnthropicLLM({ client })

    const response = await llm.complete({ prompt: "Hi", maxTokens: 50 })

    expect(response.text).toBe("Paris.")
    expect(response.call.model).toBe(DEFAULT_MODEL)
    expect(response.call.inputTokens).toBe(123)
    expect(response.call.outputTokens).toBe(45)
    expect(Number.isFinite(response.call.latencyMs)).toBe(true)
    expect(response.call.latencyMs).toBeGreaterThanOrEqual(20)
  })

  test("AC1 — completeJson calls messages.parse with a JSON output format built from the schema", async () => {
    const { client, created, parsed } = setup({
      parse: () => message({ parsed: good }),
    })
    const llm = new AnthropicLLM({ client })

    await llm.completeJson(
      { system: "Extract.", prompt: "Lyon has 522000 people.", maxTokens: 200 },
      Schema
    )

    expect(created).toHaveLength(0)
    expect(parsed).toHaveLength(1)
    const params = parsed[0] as RecordedParams
    expect(params.model).toBe(DEFAULT_MODEL)
    expect(params.max_tokens).toBe(200 + llmModule.THINKING_HEADROOM_TOKENS)
    expect(systemText(params)).toBe("Extract.")
    expect(userText(params)).toBe("Lyon has 522000 people.")
    expect(params.output_config?.effort).toBe("low")
    const format = params.output_config?.format
    expect(format?.type).toBe("json_schema")
    expect(Object.keys(format?.schema.properties ?? {}).sort()).toEqual([
      "city",
      "population",
    ])
  })

  test("AC1 — completeJson sends enums as enum, every property as required and additionalProperties false", async () => {
    const StatusSchema = z.object({
      status: z.enum(["answered", "conflict", "abstained"]),
      value: z.string(),
      citations: z.array(z.string()),
    })
    const { client, parsed } = setup({
      parse: () =>
        message({ parsed: { status: "answered", value: "x", citations: [] } }),
    })
    const llm = new AnthropicLLM({ client })

    await llm.completeJson({ prompt: "Hi", maxTokens: 50 }, StatusSchema)

    const schema = (parsed[0] as RecordedParams).output_config?.format?.schema
    expect(schema?.properties?.["status"]).toMatchObject({
      enum: ["answered", "conflict", "abstained"],
    })
    expect([...(schema?.required ?? [])].sort()).toEqual([
      "citations",
      "status",
      "value",
    ])
    expect(schema?.additionalProperties).toBe(false)
  })

  test("AC1 — completeJson uses the effort given in the options and sends no sampling parameters", async () => {
    const { client, parsed } = setup({
      parse: () => message({ parsed: good }),
    })
    const llm = new AnthropicLLM({ client, effort: "medium" })

    await llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)

    const params = parsed[0] as RecordedParams
    expect(params.output_config?.effort).toBe("medium")
    expect(params).not.toHaveProperty("temperature")
    expect(params).not.toHaveProperty("top_p")
    expect(params).not.toHaveProperty("top_k")
  })

  test("AC1 — completeJson returns the parsed value and its ModelCall", async () => {
    const { client } = setup({
      parse: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40))
        return message({
          parsed: good,
          text: JSON.stringify(good),
          inputTokens: 300,
          outputTokens: 60,
        })
      },
    })
    const llm = new AnthropicLLM({ client })

    const result = await llm.completeJson(
      { prompt: "Hi", maxTokens: 50 },
      Schema
    )

    expect(result.value).toEqual(good)
    expect(result.call.model).toBe(DEFAULT_MODEL)
    expect(result.call.inputTokens).toBe(300)
    expect(result.call.outputTokens).toBe(60)
    expect(Number.isFinite(result.call.latencyMs)).toBe(true)
    expect(result.call.latencyMs).toBeGreaterThanOrEqual(20)
  })

  test("AC2 — complete throws an error naming an API error", async () => {
    const { client } = setup({
      create: () => {
        throw new Error("529 overloaded_error: servers are busy")
      },
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 50 }))

    expect(error.message).toContain("overloaded_error")
  })

  test("AC2 — completeJson throws an error naming an API error", async () => {
    const { client } = setup({
      parse: () => {
        throw new Error("401 authentication_error: invalid x-api-key")
      },
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toContain("authentication_error")
  })

  test("AC2 — complete throws an error naming a refusal", async () => {
    const { client } = setup({
      create: () => message({ stopReason: "refusal", text: "" }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 50 }))

    expect(error.message).toMatch(/refus/i)
  })

  test("AC2 — completeJson throws an error naming a refusal", async () => {
    const { client } = setup({
      parse: () => message({ stopReason: "refusal", text: "", parsed: null }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/refus/i)
  })

  test("AC2 — complete throws an error naming a truncated output", async () => {
    const { client } = setup({
      create: () => message({ stopReason: "max_tokens", text: "Paris is" }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 50 }))

    expect(error.message).toMatch(/max_tokens|truncat/i)
  })

  test("AC2 — completeJson throws an error naming a truncated output", async () => {
    const { client } = setup({
      parse: () =>
        message({
          stopReason: "max_tokens",
          text: '{"city": "Ly',
          parsed: null,
        }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/max_tokens|truncat/i)
  })

  test("AC2 — completeJson throws an error naming an output that does not parse", async () => {
    const { client } = setup({
      parse: () => {
        throw new Error("Failed to parse structured output: SyntaxError")
      },
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/pars|invalid|validat/i)
  })

  test("AC2 — completeJson throws an error naming a response with no parsed output", async () => {
    const { client } = setup({
      parse: () => message({ text: "not json at all", parsed: null }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/pars|invalid|validat/i)
  })

  test("AC2 — completeJson throws an error naming an output that does not validate against the schema", async () => {
    const { client } = setup({
      parse: () =>
        message({ parsed: { city: "Lyon", population: "many" }, text: "{}" }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/invalid|validat|schema/i)
  })

  test("AC2 — complete: the refusal error carries the ModelCall in error.call", async () => {
    const { client } = setup({
      create: () =>
        message({
          stopReason: "refusal",
          text: "",
          inputTokens: 120,
          outputTokens: 4,
        }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 50 }))

    expectCall(error, { inputTokens: 120, outputTokens: 4 })
  })

  test("AC2 — complete: the truncation error carries the ModelCall in error.call", async () => {
    const { client } = setup({
      create: () =>
        message({
          stopReason: "max_tokens",
          text: "Paris is",
          inputTokens: 120,
          outputTokens: 50,
        }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 50 }))

    expectCall(error, { inputTokens: 120, outputTokens: 50 })
  })
})

describe("AnthropicLLM.completeJson with the parsing of the SDK", () => {
  test("AC1 — returns the value parsed from the text and its ModelCall", async () => {
    const { client } = setup({
      parse: sdkParse(() =>
        message({
          text: JSON.stringify(good),
          inputTokens: 300,
          outputTokens: 60,
        })
      ),
    })
    const llm = new AnthropicLLM({ client })

    const result = await llm.completeJson(
      { prompt: "Hi", maxTokens: 50 },
      Schema
    )

    expect(result.value).toEqual(good)
    expect(result.call.inputTokens).toBe(300)
    expect(result.call.outputTokens).toBe(60)
  })

  test("AC2 — a max_tokens response with cut JSON gives a truncation error, not a parse failure", async () => {
    const { client } = setup({
      parse: sdkParse(() =>
        message({
          stopReason: "max_tokens",
          text: '{"city": "Ly',
          inputTokens: 200,
          outputTokens: 50,
        })
      ),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/max_tokens|truncat/i)
    expect(error.message).not.toMatch(/parse structured output/i)
    expectCall(error, { inputTokens: 200, outputTokens: 50 })
  })

  test("AC2 — a refusal with free text gives a refusal error, not a parse failure", async () => {
    const { client } = setup({
      parse: sdkParse(() =>
        message({
          stopReason: "refusal",
          text: "I can't help with that request.",
          inputTokens: 90,
          outputTokens: 9,
        })
      ),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/refus/i)
    expect(error.message).not.toMatch(/parse structured output/i)
    expectCall(error, { inputTokens: 90, outputTokens: 9 })
  })

  test("AC2 — a complete JSON that does not validate gives a validation error carrying the call", async () => {
    const { client } = setup({
      parse: sdkParse(() =>
        message({
          text: JSON.stringify({ city: "Lyon", population: "many" }),
          inputTokens: 150,
          outputTokens: 20,
        })
      ),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/invalid|validat|schema/i)
    expectCall(error, { inputTokens: 150, outputTokens: 20 })
  })

  test("AC2 — a text that is not JSON, with a normal stop, gives a parse error carrying the call", async () => {
    const { client } = setup({
      parse: sdkParse(() =>
        message({
          text: "not json at all",
          inputTokens: 80,
          outputTokens: 5,
        })
      ),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toMatch(/pars|invalid|validat/i)
    expectCall(error, { inputTokens: 80, outputTokens: 5 })
  })

  test("AC2 — an API error does not invent a ModelCall", async () => {
    const { client } = setup({
      parse: sdkParse(() => {
        throw new Error("529 overloaded_error: servers are busy")
      }),
    })
    const llm = new AnthropicLLM({ client })

    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    )

    expect(error.message).toContain("overloaded_error")
    expect(callOf(error)).toBeUndefined()
  })
})

describe("AnthropicLLM (no network)", () => {
  test("AC6 — a fake client is enough: no call leaves the process", async () => {
    const originalFetch = globalThis.fetch
    let fetched = 0
    globalThis.fetch = (() => {
      fetched += 1
      throw new Error("network call attempted")
    }) as unknown as typeof fetch
    try {
      const { client } = setup({
        create: () => message(),
        parse: () => message({ parsed: good }),
      })
      const llm = new AnthropicLLM({ client })
      await llm.complete({ prompt: "Hi", maxTokens: 50 })
      await llm.completeJson({ prompt: "Hi", maxTokens: 50 }, Schema)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(fetched).toBe(0)
  })
})
