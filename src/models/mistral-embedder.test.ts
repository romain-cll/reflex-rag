import { describe, expect, test } from "bun:test"
import type { Embedder } from "../core/embedder.ts"
import { MistralEmbedder } from "./mistral-embedder.ts"

const ENDPOINT = "https://api.mistral.ai/v1/embeddings"
const API_KEY = "test-key"
const DIMENSIONS = 1024

interface RecordedRequest {
  url: string
  method: string | undefined
  headers: Headers
  body: { model: string; input: string[] }
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>

/** A vector that carries `n` in its first component, so order is checkable. */
function vector(n: number): number[] {
  const values = new Array<number>(DIMENSIONS).fill(0)
  values[0] = n
  return values
}

/** Texts are named `t<n>`; the matching vector carries `n`. */
function texts(count: number, start = 0): string[] {
  return Array.from({ length: count }, (_, i) => `t${start + i}`)
}

function marker(text: string): number {
  return Number(text.slice(1))
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

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

/** A well-formed 2xx answer: one item per input, 7 prompt tokens each. */
function okResponse(
  request: RecordedRequest,
  order: (indexes: number[]) => number[] = (indexes) => indexes
): Response {
  const inputs = request.body.input
  const indexes = order(inputs.map((_, i) => i))
  return jsonResponse({
    data: indexes.map((index) => ({
      embedding: vector(marker(inputs[index] as string)),
      index,
    })),
    usage: { prompt_tokens: inputs.length * 7 },
  })
}

function setup(script: Responder | Responder[]) {
  const requests: RecordedRequest[] = []
  const waits: number[] = []
  let inFlight = 0
  let maxInFlight = 0

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const request: RecordedRequest = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as RecordedRequest["body"],
    }
    requests.push(request)
    const responder = Array.isArray(script)
      ? script[requests.length - 1]
      : script
    if (!responder) throw new Error("unscripted request")
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return await responder(request)
    } finally {
      inFlight -= 1
    }
  }

  const fakeSleep = (ms: number): Promise<void> => {
    waits.push(ms)
    return Promise.resolve()
  }

  const build = (
    options: {
      model?: string
      batchSize?: number
      maxRetries?: number
    } = {}
  ) =>
    new MistralEmbedder({
      apiKey: API_KEY,
      fetch: fakeFetch as unknown as typeof fetch,
      sleep: fakeSleep,
      ...options,
    })

  return {
    requests,
    waits,
    build,
    get maxInFlight() {
      return maxInFlight
    },
  }
}

describe("AC1 — request", () => {
  test("AC1 — POSTs to the Mistral embeddings endpoint", async () => {
    const t = setup(okResponse)
    await t.build().embed(["t0", "t1"])
    expect(t.requests).toHaveLength(1)
    expect(t.requests[0]?.url).toBe(ENDPOINT)
    expect(t.requests[0]?.method).toBe("POST")
  })

  test("AC1 — sends the bearer token and the JSON content type", async () => {
    const t = setup(okResponse)
    await t.build().embed(["t0"])
    const headers = t.requests[0]?.headers
    expect(headers?.get("Authorization")).toBe(`Bearer ${API_KEY}`)
    expect(headers?.get("Content-Type")).toBe("application/json")
  })

  test("AC1 — body holds the default model and the texts", async () => {
    const t = setup(okResponse)
    await t.build().embed(["t3", "t1", "t2"])
    expect(t.requests[0]?.body).toEqual({
      model: "mistral-embed",
      input: ["t3", "t1", "t2"],
    })
  })

  test("AC1 — body uses a custom model when given", async () => {
    const t = setup(okResponse)
    await t.build({ model: "mistral-embed-next" }).embed(["t0"])
    expect(t.requests[0]?.body.model).toBe("mistral-embed-next")
  })
})

describe("AC2 — batching and order", () => {
  test("AC2 — splits 70 texts into batches of 32, 32 and 6 by default", async () => {
    const t = setup(okResponse)
    const input = texts(70)
    await t.build().embed(input)
    expect(t.requests.map((r) => r.body.input.length)).toEqual([32, 32, 6])
    expect(t.requests.flatMap((r) => r.body.input)).toEqual(input)
  })

  test("AC2 — honours a custom batchSize", async () => {
    const t = setup(okResponse)
    await t.build({ batchSize: 2 }).embed(texts(5))
    expect(t.requests.map((r) => r.body.input)).toEqual([
      ["t0", "t1"],
      ["t2", "t3"],
      ["t4"],
    ])
  })

  test("AC2 — sends exactly one request when texts fit in one batch", async () => {
    const t = setup(okResponse)
    await t.build().embed(texts(32))
    expect(t.requests).toHaveLength(1)
  })

  test("AC2 — sends one request at a time", async () => {
    const t = setup(okResponse)
    await t.build({ batchSize: 2 }).embed(texts(8))
    expect(t.requests).toHaveLength(4)
    expect(t.maxInFlight).toBe(1)
  })

  test("AC2 — returns one Float32Array per text, in input order", async () => {
    const t = setup(okResponse)
    const result = await t.build({ batchSize: 3 }).embed(texts(7))
    expect(result.vectors).toHaveLength(7)
    result.vectors.forEach((v, i) => {
      expect(v).toBeInstanceOf(Float32Array)
      expect(v).toHaveLength(DIMENSIONS)
      expect(v[0]).toBe(i)
    })
  })

  test("AC2 — places vectors by item index when the response is out of order", async () => {
    const t = setup((request) =>
      okResponse(request, (indexes) => [...indexes].reverse())
    )
    const result = await t.build({ batchSize: 3 }).embed(texts(6))
    expect(result.vectors.map((v) => v[0])).toEqual([0, 1, 2, 3, 4, 5])
  })

  test("AC2 — handles a shuffled response within one batch", async () => {
    const t = setup((request) => okResponse(request, () => [2, 0, 1]))
    const result = await t.build().embed(["t10", "t20", "t30"])
    expect(result.vectors.map((v) => v[0])).toEqual([10, 20, 30])
  })
})

describe("AC3 — calls", () => {
  test("AC3 — returns one ModelCall per request", async () => {
    const t = setup(okResponse)
    const result = await t.build({ batchSize: 32 }).embed(texts(70))
    expect(result.calls).toHaveLength(3)
  })

  test("AC3 — each call has the model, prompt tokens as input and no output", async () => {
    const t = setup(okResponse)
    const result = await t.build().embed(texts(70))
    expect(result.calls.map((c) => c.model)).toEqual([
      "mistral-embed",
      "mistral-embed",
      "mistral-embed",
    ])
    expect(result.calls.map((c) => c.inputTokens)).toEqual([224, 224, 42])
    expect(result.calls.map((c) => c.outputTokens)).toEqual([0, 0, 0])
  })

  test("AC3 — call model follows the configured model", async () => {
    const t = setup(okResponse)
    const result = await t.build({ model: "mistral-embed-next" }).embed(["t0"])
    expect(result.calls[0]?.model).toBe("mistral-embed-next")
  })

  test("AC3 — latencyMs is a non-negative number", async () => {
    const t = setup(okResponse)
    const result = await t.build().embed(texts(3))
    const latency = result.calls[0]?.latencyMs
    expect(typeof latency).toBe("number")
    expect(Number.isFinite(latency)).toBe(true)
    expect(latency).toBeGreaterThanOrEqual(0)
  })
})

describe("AC4 — retries", () => {
  const failure =
    (status: number, headers: Record<string, string> = {}): Responder =>
    () =>
      new Response("slow down", { status, headers })

  test("AC4 — retries a 429 and returns the eventual success", async () => {
    const t = setup([failure(429), okResponse])
    const result = await t.build().embed(["t5"])
    expect(t.requests).toHaveLength(2)
    expect(t.requests[1]?.body).toEqual(t.requests[0]?.body)
    expect(result.vectors[0]?.[0]).toBe(5)
  })

  test("AC4 — retries a 5xx and returns the eventual success", async () => {
    const t = setup([failure(503), okResponse])
    const result = await t.build().embed(["t5"])
    expect(t.requests).toHaveLength(2)
    expect(result.vectors[0]?.[0]).toBe(5)
  })

  test("AC4 — retries other 5xx statuses such as 500 and 502", async () => {
    const t = setup([failure(500), failure(502), okResponse])
    const result = await t.build().embed(["t5"])
    expect(t.requests).toHaveLength(3)
    expect(result.vectors[0]?.[0]).toBe(5)
  })

  test("AC4 — waits the Retry-After header in seconds before retrying", async () => {
    const t = setup([failure(429, { "Retry-After": "3" }), okResponse])
    await t.build().embed(["t0"])
    expect(t.waits).toEqual([3000])
  })

  test("AC4 — backs off 1 s, 2 s, 4 s without Retry-After", async () => {
    const t = setup([failure(503), failure(503), failure(503), okResponse])
    await t.build().embed(["t0"])
    expect(t.waits).toEqual([1000, 2000, 4000])
  })

  test("AC4 — does not sleep when the first request succeeds", async () => {
    const t = setup(okResponse)
    await t.build().embed(["t0"])
    expect(t.waits).toEqual([])
  })

  test("AC4 — gives up after 5 retries by default and reports the status", async () => {
    const t = setup(failure(503))
    expect((await rejection(t.build().embed(["t0"]))).message).toMatch(/503/)
    expect(t.requests).toHaveLength(6)
    expect(t.waits).toEqual([1000, 2000, 4000, 8000, 16000])
  })

  test("AC4 — honours a custom maxRetries", async () => {
    const t = setup(failure(429))
    expect(
      (await rejection(t.build({ maxRetries: 2 }).embed(["t0"]))).message
    ).toMatch(/429/)
    expect(t.requests).toHaveLength(3)
    expect(t.waits).toHaveLength(2)
  })

  test("AC4 — maxRetries 0 means a single attempt", async () => {
    const t = setup(failure(500))
    expect(
      (await rejection(t.build({ maxRetries: 0 }).embed(["t0"]))).message
    ).toMatch(/500/)
    expect(t.requests).toHaveLength(1)
    expect(t.waits).toEqual([])
  })

  test("AC4 — waits Retry-After before every retry when the header repeats", async () => {
    const t = setup(failure(429, { "Retry-After": "2" }))
    expect(
      (await rejection(t.build({ maxRetries: 2 }).embed(["t0"]))).message
    ).toMatch(/429/)
    expect(t.waits).toEqual([2000, 2000])
  })
})

describe("AC5 — other errors", () => {
  test("AC5 — throws at once on 401 with the status and the body start", async () => {
    const t = setup(
      () =>
        new Response("invalid api key: check your credentials", { status: 401 })
    )
    const error = await t
      .build()
      .embed(["t0"])
      .then(
        () => undefined,
        (e: unknown) => e
      )
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain("401")
    expect(message).toContain("invalid api key")
    expect(t.requests).toHaveLength(1)
    expect(t.waits).toEqual([])
  })

  test("AC5 — throws at once on 400 without retry", async () => {
    const t = setup(() => new Response("bad input", { status: 400 }))
    expect((await rejection(t.build().embed(["t0"]))).message).toMatch(/400/)
    expect(t.requests).toHaveLength(1)
    expect(t.waits).toEqual([])
  })

  test("AC5 — stops at the failing batch and sends no further request", async () => {
    const t = setup([okResponse, () => new Response("nope", { status: 422 })])
    expect(
      (await rejection(t.build({ batchSize: 2 }).embed(texts(6)))).message
    ).toMatch(/422/)
    expect(t.requests).toHaveLength(2)
  })
})

describe("AC6 — malformed response", () => {
  const rejectsWith = async (body: () => Response, input = ["t0", "t1"]) => {
    const t = setup(body)
    await rejection(t.build().embed(input))
    expect(t.requests).toHaveLength(1)
  }

  test("AC6 — throws when a 2xx body is not JSON", async () => {
    await rejectsWith(() => new Response("<html>oops</html>", { status: 200 }))
  })

  test("AC6 — throws when data is missing", async () => {
    await rejectsWith(() => jsonResponse({ usage: { prompt_tokens: 2 } }))
  })

  test("AC6 — throws when usage is missing", async () => {
    await rejectsWith(() =>
      jsonResponse({
        data: [
          { embedding: vector(0), index: 0 },
          { embedding: vector(1), index: 1 },
        ],
      })
    )
  })

  test("AC6 — throws when an item has no embedding", async () => {
    await rejectsWith(() =>
      jsonResponse({
        data: [{ index: 0 }, { index: 1 }],
        usage: { prompt_tokens: 2 },
      })
    )
  })

  test("AC6 — throws when an embedding holds non-numbers", async () => {
    await rejectsWith(() =>
      jsonResponse({
        data: [
          { embedding: ["a", "b"], index: 0 },
          { embedding: vector(1), index: 1 },
        ],
        usage: { prompt_tokens: 2 },
      })
    )
  })

  test("AC6 — throws when the response has fewer items than inputs", async () => {
    await rejectsWith(() =>
      jsonResponse({
        data: [{ embedding: vector(0), index: 0 }],
        usage: { prompt_tokens: 2 },
      })
    )
  })

  test("AC6 — throws when the response has more items than inputs", async () => {
    await rejectsWith(() =>
      jsonResponse({
        data: [
          { embedding: vector(0), index: 0 },
          { embedding: vector(1), index: 1 },
          { embedding: vector(2), index: 2 },
        ],
        usage: { prompt_tokens: 3 },
      })
    )
  })

  test("AC6 — does not retry a malformed 2xx response", async () => {
    const t = setup(() => jsonResponse({ nope: true }))
    await rejection(t.build().embed(["t0"]))
    expect(t.requests).toHaveLength(1)
    expect(t.waits).toEqual([])
  })
})

describe("AC7 — empty input", () => {
  test("AC7 — returns no vectors and no calls", async () => {
    const t = setup(okResponse)
    const result = await t.build().embed([])
    expect(result.vectors).toEqual([])
    expect(result.calls).toEqual([])
  })

  test("AC7 — sends no request", async () => {
    const t = setup(okResponse)
    await t.build().embed([])
    expect(t.requests).toHaveLength(0)
    expect(t.waits).toEqual([])
  })
})

describe("AC8 — interface", () => {
  test("AC8 — is usable as an Embedder with default model and 1024 dimensions", () => {
    const embedder: Embedder = setup(okResponse).build()
    expect(embedder.model).toBe("mistral-embed")
    expect(embedder.dimensions).toBe(1024)
  })

  test("AC8 — model reflects the configured model", () => {
    const embedder = setup(okResponse).build({ model: "mistral-embed-next" })
    expect(embedder.model).toBe("mistral-embed-next")
    expect(embedder.dimensions).toBe(1024)
  })
})
