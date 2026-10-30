import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { z } from "zod"
import { LLMCallError } from "../core/llm.ts"
import { NUM_CTX, ollamaLLM, QWEN_MODEL } from "./ollama-llm.ts"

// The adapter is built by its factory `ollamaLLM({ fetch })`, which reads
// `OLLAMA_HOST` as `clefSystemOne` does. Time is faked: no test waits.

const Schema = z.object({ city: z.string(), population: z.number() })

interface Recorded {
  url: string
  method: string | undefined
  body: Record<string, unknown>
}

interface ReplyOptions {
  content?: string
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  /** Nanoseconds, as Ollama reports it. */
  load_duration?: number
}

/** An `/api/chat` reply (stream: false) with the fields the adapter may read. */
function chatReply(options: ReplyOptions = {}) {
  return {
    model: QWEN_MODEL,
    created_at: "2026-10-30T10:00:00Z",
    message: { role: "assistant", content: options.content ?? "hello" },
    done: true,
    done_reason: options.done_reason ?? "stop",
    total_duration: 2_000_000_000,
    load_duration: options.load_duration ?? 0,
    prompt_eval_count: options.prompt_eval_count ?? 12,
    prompt_eval_duration: 1_000_000,
    eval_count: options.eval_count ?? 7,
    eval_duration: 1_000_000,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A virtual clock behind `performance.now` and `Date.now`. */
function fakeClock() {
  let now = 0
  const perf = spyOn(performance, "now").mockImplementation(() => now)
  const date = spyOn(Date, "now").mockImplementation(() => 1.7e12 + now)
  return {
    advance: (ms: number) => {
      now += ms
    },
    restore: () => {
      perf.mockRestore()
      date.mockRestore()
    },
  }
}

type Responder = (request: Recorded) => Response | Promise<Response>

function setup(responder: Responder = () => jsonResponse(chatReply())) {
  const requests: Recorded[] = []
  const clock = fakeClock()
  clocks.push(clock)
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const recorded: Recorded = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method,
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    }
    requests.push(recorded)
    return responder(recorded)
  }
  const llm = ollamaLLM({ fetch: fakeFetch as unknown as typeof fetch })
  return { llm, requests, clock }
}

const clocks: Array<{ restore: () => void }> = []
let savedHost: string | undefined

beforeEach(() => {
  savedHost = process.env.OLLAMA_HOST
  delete process.env.OLLAMA_HOST
})

afterEach(() => {
  for (const clock of clocks.splice(0)) clock.restore()
  if (savedHost === undefined) delete process.env.OLLAMA_HOST
  else process.env.OLLAMA_HOST = savedHost
})

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error("rejected with a non-Error value", { cause: error })
  }
  throw new Error("expected the promise to reject")
}

describe("local-llm AC8 — the request", () => {
  test("AC8 — one POST to <OLLAMA_HOST>/api/chat with the pinned model, no thinking, no stream, num_ctx and num_predict only", async () => {
    const { llm, requests } = setup(() =>
      jsonResponse(chatReply({ content: "Paris" }))
    )
    const { text } = await llm.complete({
      system: "Be brief.",
      prompt: "Capital of France?",
      maxTokens: 300,
    })
    expect(QWEN_MODEL).toBe("qwen3.5:9b-q8_0")
    expect(NUM_CTX).toBe(32768)
    expect(llm.model).toBe("qwen3.5:9b-q8_0")
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe("http://localhost:11434/api/chat")
    expect(requests[0]!.method).toBe("POST")
    expect(requests[0]!.body).toEqual({
      model: "qwen3.5:9b-q8_0",
      stream: false,
      think: false,
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Capital of France?" },
      ],
      options: { num_ctx: 32768, num_predict: 300 },
    })
    expect(text).toBe("Paris")
  })

  test("AC8 — no system message when the request has no system", async () => {
    const { llm, requests } = setup()
    await llm.complete({ prompt: "Hi", maxTokens: 10 })
    expect(requests[0]!.body["messages"]).toEqual([
      { role: "user", content: "Hi" },
    ])
  })

  test("AC8 — OLLAMA_HOST is read as clefSystemOne reads it: scheme and port added when missing", async () => {
    process.env.OLLAMA_HOST = "ollama.internal"
    const { llm, requests } = setup()
    await llm.complete({ prompt: "Hi", maxTokens: 10 })
    expect(requests[0]!.url).toBe("http://ollama.internal:11434/api/chat")
  })
})

describe("local-llm AC9 — structured output", () => {
  test("AC9 — the body carries the JSON Schema of the schema as format, and the validated value comes back", async () => {
    const { llm, requests } = setup(() =>
      jsonResponse(
        chatReply({
          content: JSON.stringify({ city: "Lyon", population: 520 }),
        })
      )
    )
    const { value } = await llm.completeJson(
      { prompt: "Describe Lyon", maxTokens: 100 },
      Schema
    )
    const expectedFormat: Record<string, unknown> = z.toJSONSchema(Schema)
    delete expectedFormat["$schema"]
    expect(requests[0]!.body["format"]).toEqual(expectedFormat)
    expect(requests[0]!.body["options"]).toEqual({
      num_ctx: 32768,
      num_predict: 100,
    })
    expect(value).toEqual({ city: "Lyon", population: 520 })
  })
})

describe("local-llm AC10 — the recorded call", () => {
  test("AC10 — tokens from the reply, loadMs from load_duration, latencyMs is the wall time without the load", async () => {
    const { llm, clock } = setup(() => {
      clock.advance(500)
      return jsonResponse(
        chatReply({
          prompt_eval_count: 321,
          eval_count: 45,
          load_duration: 200_000_000,
        })
      )
    })
    const { call } = await llm.complete({ prompt: "Hi", maxTokens: 100 })
    expect(call.model).toBe("qwen3.5:9b-q8_0")
    expect(call.inputTokens).toBe(321)
    expect(call.outputTokens).toBe(45)
    expect(call.loadMs).toBe(200)
    expect(call.latencyMs).toBe(300)
  })

  test("AC10 — latencyMs is floored at 0 when the load is longer than the wall time", async () => {
    const { llm, clock } = setup(() => {
      clock.advance(500)
      return jsonResponse(chatReply({ load_duration: 900_000_000 }))
    })
    const { call } = await llm.complete({ prompt: "Hi", maxTokens: 100 })
    expect(call.loadMs).toBe(900)
    expect(call.latencyMs).toBe(0)
  })
})

describe("local-llm AC11 — truncated output", () => {
  test("AC11 — done_reason length throws an LLMCallError naming the truncation, with the call", async () => {
    const { llm } = setup(() =>
      jsonResponse(
        chatReply({
          done_reason: "length",
          prompt_eval_count: 50,
          eval_count: 100,
        })
      )
    )
    const error = await rejection(
      llm.complete({ prompt: "Hi", maxTokens: 100 })
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect(error.message).toMatch(/truncat/i)
    const { call } = error as LLMCallError
    expect(call.model).toBe("qwen3.5:9b-q8_0")
    expect(call.inputTokens).toBe(50)
    expect(call.outputTokens).toBe(100)
  })
})

describe("local-llm AC12 — full context window", () => {
  test("AC12 — prompt_eval_count + maxTokens over 32768 throws an LLMCallError about the window, with the call", async () => {
    const { llm } = setup(() =>
      jsonResponse(chatReply({ prompt_eval_count: 32000, eval_count: 5 }))
    )
    const error = await rejection(
      llm.complete({ prompt: "Hi", maxTokens: 1000 })
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect(error.message).toContain("context window")
    expect(error.message).toContain("num_ctx 32768")
    expect(error.message).toMatch(/truncated/i)
    expect((error as LLMCallError).call.inputTokens).toBe(32000)
  })

  test("AC12 — exactly 32768 fits", async () => {
    const { llm } = setup(() =>
      jsonResponse(chatReply({ prompt_eval_count: 31768 }))
    )
    const { text } = await llm.complete({ prompt: "Hi", maxTokens: 1000 })
    expect(text).toBe("hello")
  })
})

describe("local-llm AC13 — unusable JSON", () => {
  test("AC13 — content that is not JSON throws an LLMCallError saying so, with the call", async () => {
    const { llm } = setup(() =>
      jsonResponse(chatReply({ content: "Lyon, about 520 thousand" }))
    )
    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 100 }, Schema)
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect(error.message).toMatch(/not JSON/i)
    expect((error as LLMCallError).call.model).toBe("qwen3.5:9b-q8_0")
  })

  test("AC13 — JSON that fails the schema throws an LLMCallError naming the schema, with the call", async () => {
    const { llm } = setup(() =>
      jsonResponse(chatReply({ content: JSON.stringify({ city: "Lyon" }) }))
    )
    const error = await rejection(
      llm.completeJson({ prompt: "Hi", maxTokens: 100 }, Schema)
    )
    expect(error).toBeInstanceOf(LLMCallError)
    expect(error.message).toMatch(/schema/i)
    expect(error.message).not.toMatch(/not JSON/i)
    expect((error as LLMCallError).call.inputTokens).toBe(12)
  })
})

describe("local-llm AC14 — HTTP and network failures", () => {
  test("AC14 — a non-2xx response throws the status and the first line of the body", async () => {
    const { llm, requests } = setup(
      () =>
        new Response("model 'qwen3.5:9b-q8_0' not found\nsecond line", {
          status: 404,
        })
    )
    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 10 }))
    expect(error).not.toBeInstanceOf(LLMCallError)
    expect(error.message).toBe(
      "Ollama request failed (404): model 'qwen3.5:9b-q8_0' not found"
    )
    expect(requests).toHaveLength(1)
  })

  test("AC14 — the first line of the body is cut at 200 characters", async () => {
    const { llm } = setup(
      () => new Response("e".repeat(300) + "\nsecond line", { status: 500 })
    )
    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 10 }))
    expect(error.message).toBe(
      `Ollama request failed (500): ${"e".repeat(200)}`
    )
  })

  test("AC14 — a network failure throws the reason, without a retry", async () => {
    const { llm, requests } = setup(() => {
      throw new TypeError("fetch failed")
    })
    const error = await rejection(llm.complete({ prompt: "Hi", maxTokens: 10 }))
    expect(error.message).toBe("Ollama request failed: fetch failed")
    expect(requests).toHaveLength(1)
  })
})
