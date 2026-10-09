import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type {
  SystemOne,
  SystemOneAnswer,
  SystemOneQuestion,
  SystemOneRequest,
} from "../core/system-one.ts"
import { HttpSystemOne, clefSystemOne, jevSystemOne } from "./system-one.ts"

const BASE_URL = "https://system-one.test"
const MODEL = "test-model"
const API_KEY = "test-key"

interface RecordedRequest {
  url: string
  method: string | undefined
  headers: Headers
  body: unknown
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>

const STEP_QUESTION: SystemOneQuestion = {
  type: "choice",
  instructions: "What should the retrieval loop do next?",
  criteria: {
    step: "Follow a link to another note.",
    answer: "The context is enough to answer.",
  },
}

const ENOUGH_QUESTION: SystemOneQuestion = {
  type: "noul",
  instructions: "Is the context enough?",
  criteria: { true: "It is enough.", false: "It is not enough." },
}

const REQUEST: SystemOneRequest = {
  state: { question: "Who wrote the note?", chunks: ["c1", "c2"] },
  questions: { next: STEP_QUESTION, enough: ENOUGH_QUESTION },
}

const CHOICE_ANSWER: SystemOneAnswer = {
  type: "choice",
  choice: "step",
  probabilities: { step: 0.8, answer: 0.2 },
  confidence: 0.8,
}

const NOUL_ANSWER: SystemOneAnswer = { type: "noul", noul: 0.35 }

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

/** The error of a call that may fail synchronously or by rejection. */
async function failure(run: () => Promise<unknown>): Promise<Error> {
  return rejection(Promise.resolve().then(run))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** A well-formed 2xx answer in the shape of the real API. */
function apiBody(
  answers: Record<string, unknown> = {
    next: CHOICE_ANSWER,
    enough: NOUL_ANSWER,
  }
) {
  return {
    model: "model-reported-by-the-api",
    answers,
    usage: { input_tokens: 392, output_tokens: 0 },
  }
}

const ok: Responder = () => jsonResponse(apiBody())

const status =
  (code: number, body = "nope"): Responder =>
  () =>
    new Response(body, { status: code })

const networkError: Responder = () => {
  throw new TypeError("fetch failed")
}

function setup(script: Responder | Responder[] = ok) {
  const requests: RecordedRequest[] = []

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const recorded: RecordedRequest = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as unknown,
    }
    requests.push(recorded)
    const responder = Array.isArray(script)
      ? script[requests.length - 1]
      : script
    if (!responder) return new Response("unscripted request", { status: 418 })
    return responder(recorded)
  }

  const build = (
    options: { model?: string; apiKey?: string; retryBaseMs?: number } = {}
  ) =>
    new HttpSystemOne({
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: API_KEY,
      retryBaseMs: 0,
      fetch: fakeFetch as unknown as typeof fetch,
      ...options,
    })

  return {
    requests,
    build,
    fetch: fakeFetch as unknown as typeof fetch,
  }
}

// Environment and global fetch are restored after every test, so that no test
// can reach a real key or the network (AC5).
const ENV_NAMES = ["TYPESAFE_API_KEY", "OLLAMA_HOST"] as const
const savedEnv = new Map<string, string | undefined>()
const realFetch = globalThis.fetch
let globalFetchCalls: string[] = []

beforeEach(() => {
  for (const name of ENV_NAMES) savedEnv.set(name, process.env[name])
  delete process.env.TYPESAFE_API_KEY
  delete process.env.OLLAMA_HOST
  globalFetchCalls = []
  globalThis.fetch = ((input: string | URL | Request) => {
    globalFetchCalls.push(input instanceof Request ? input.url : String(input))
    return Promise.reject(new Error("the real fetch must not be used in tests"))
  }) as unknown as typeof fetch
})

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = savedEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  globalThis.fetch = realFetch
})

describe("AC1 — interface", () => {
  test("AC1 — an HttpSystemOne is usable as a SystemOne and exposes its model", () => {
    const client: SystemOne = setup().build()
    expect(client.model).toBe(MODEL)
    expect(typeof client.decide).toBe("function")
  })

  test("AC1 — decide takes a request and resolves { answers, call }", async () => {
    const client: SystemOne = setup().build()
    const result = await client.decide(REQUEST)
    expect(Object.keys(result).sort()).toEqual(["answers", "call"])
  })

  test("AC1 — accepts a noul question without criteria", async () => {
    const t = setup(() =>
      jsonResponse(apiBody({ solo: { type: "noul", noul: 0.5 } }))
    )
    const result = await t.build().decide({
      state: null,
      questions: { solo: { type: "noul", instructions: "Sure?" } },
    })
    expect(result.answers.solo).toEqual({ type: "noul", noul: 0.5 })
  })
})

describe("AC2 — HTTP client", () => {
  test("AC2 — POSTs to baseUrl/v1/systemone", async () => {
    const t = setup()
    await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(1)
    expect(t.requests[0]?.url).toBe(`${BASE_URL}/v1/systemone`)
    expect(t.requests[0]?.method).toBe("POST")
  })

  test("AC2 — body is the JSON { model, state, questions }", async () => {
    const t = setup()
    await t.build().decide(REQUEST)
    expect(t.requests[0]?.body).toEqual({
      model: MODEL,
      state: REQUEST.state,
      questions: REQUEST.questions,
    })
    expect(t.requests[0]?.headers.get("Content-Type")).toContain(
      "application/json"
    )
  })

  test("AC2 — sends Authorization: Bearer <apiKey> when a key is given", async () => {
    const t = setup()
    await t.build({ apiKey: "secret-123" }).decide(REQUEST)
    expect(t.requests[0]?.headers.get("Authorization")).toBe(
      "Bearer secret-123"
    )
  })

  test("AC2 — sends no Authorization header without a key", async () => {
    const t = setup()
    const client = new HttpSystemOne({
      baseUrl: BASE_URL,
      model: MODEL,
      retryBaseMs: 0,
      fetch: t.fetch,
    })
    await client.decide(REQUEST)
    expect(t.requests[0]?.headers.has("Authorization")).toBe(false)
  })

  test("AC2 — returns the answers of the request's question ids", async () => {
    const t = setup()
    const result = await t.build().decide(REQUEST)
    expect(result.answers).toEqual({ next: CHOICE_ANSWER, enough: NOUL_ANSWER })
  })

  test("AC2 — leaves out answers for ids that were not asked", async () => {
    const t = setup(() =>
      jsonResponse(
        apiBody({ next: CHOICE_ANSWER, stray: { type: "noul", noul: 0.9 } })
      )
    )
    const result = await t.build().decide({
      state: REQUEST.state,
      questions: { next: STEP_QUESTION },
    })
    expect(Object.keys(result.answers)).toEqual(["next"])
  })

  test("AC2 — call reports the configured model, the usage tokens and the latency", async () => {
    const t = setup()
    const { call } = await t.build().decide(REQUEST)
    expect(call.model).toBe(MODEL)
    expect(call.inputTokens).toBe(392)
    expect(call.outputTokens).toBe(0)
    expect(typeof call.latencyMs).toBe("number")
    expect(Number.isFinite(call.latencyMs)).toBe(true)
    expect(call.latencyMs).toBeGreaterThanOrEqual(0)
  })

  test("AC2 — call tokens follow the usage of the response", async () => {
    const t = setup(() =>
      jsonResponse({
        ...apiBody(),
        usage: { input_tokens: 1200, output_tokens: 15 },
      })
    )
    const { call } = await t.build().decide(REQUEST)
    expect(call.inputTokens).toBe(1200)
    expect(call.outputTokens).toBe(15)
  })

  test("AC2 — call.latencyMs covers the time spent on the request", async () => {
    const t = setup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return jsonResponse(apiBody())
    })
    const { call } = await t.build().decide(REQUEST)
    expect(call.latencyMs).toBeGreaterThanOrEqual(25)
  })
})

describe("AC2 — response validation", () => {
  const rejectsOnce = async (
    body: () => Response,
    cause?: RegExp
  ): Promise<void> => {
    const t = setup(body)
    const error = await rejection(t.build().decide(REQUEST))
    if (cause) expect(error.message).toMatch(cause)
    expect(t.requests).toHaveLength(1)
  }

  test("AC2 — rejects a 2xx body that is not JSON", async () => {
    await rejectsOnce(() => new Response("<html>oops</html>", { status: 200 }))
  })

  test("AC2 — rejects a response without answers, naming them", async () => {
    await rejectsOnce(
      () => jsonResponse({ usage: { input_tokens: 1, output_tokens: 0 } }),
      /answers/
    )
  })

  test("AC2 — rejects a response without usage, naming it", async () => {
    await rejectsOnce(
      () =>
        jsonResponse({ answers: { next: CHOICE_ANSWER, enough: NOUL_ANSWER } }),
      /usage/
    )
  })

  test("AC2 — rejects non-numeric usage tokens, naming the field", async () => {
    await rejectsOnce(
      () =>
        jsonResponse({
          answers: { next: CHOICE_ANSWER, enough: NOUL_ANSWER },
          usage: { input_tokens: "many", output_tokens: 0 },
        }),
      /input_tokens/
    )
  })

  test("AC2 — rejects a choice answer without probabilities", async () => {
    await rejectsOnce(
      () =>
        jsonResponse(
          apiBody({
            next: { type: "choice", choice: "step", confidence: 0.8 },
            enough: NOUL_ANSWER,
          })
        ),
      /probabilities/
    )
  })

  test("AC2 — rejects a noul answer whose value is not a number", async () => {
    await rejectsOnce(
      () =>
        jsonResponse(
          apiBody({
            next: CHOICE_ANSWER,
            enough: { type: "noul", noul: "high" },
          })
        ),
      /noul/
    )
  })

  test("AC2 — rejects an answer of an unknown type", async () => {
    await rejectsOnce(() =>
      jsonResponse(
        apiBody({ next: { type: "poem", text: "roses" }, enough: NOUL_ANSWER })
      )
    )
  })
})

describe("AC3 — retries", () => {
  test("AC3 — retries a 429 and returns the eventual success", async () => {
    const t = setup([status(429), ok])
    const result = await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(2)
    expect(t.requests[1]?.body).toEqual(t.requests[0]?.body)
    expect(result.answers.next).toEqual(CHOICE_ANSWER)
  })

  test("AC3 — retries a 529 (overloaded)", async () => {
    const t = setup([status(529), ok])
    const result = await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(2)
    expect(result.answers.enough).toEqual(NOUL_ANSWER)
  })

  test("AC3 — retries a 503", async () => {
    const t = setup([status(503), ok])
    await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(2)
  })

  test("AC3 — retries other 5xx statuses such as 500 and 502", async () => {
    const t = setup([status(500), status(502), ok])
    await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(3)
  })

  test("AC3 — retries a network error", async () => {
    const t = setup([networkError, ok])
    const result = await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(2)
    expect(result.answers.next).toEqual(CHOICE_ANSWER)
  })

  test("AC3 — succeeds on the third and last retry", async () => {
    const t = setup([status(503), networkError, status(429), ok])
    const result = await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(4)
    expect(result.answers.next).toEqual(CHOICE_ANSWER)
  })

  test("AC3 — gives up after 3 retries: 4 attempts, error names the status", async () => {
    const t = setup(status(503, "unavailable"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("503")
    expect(t.requests).toHaveLength(4)
  })

  test("AC3 — gives up after 3 retries on a persistent network error", async () => {
    const t = setup(networkError)
    await rejection(t.build().decide(REQUEST))
    expect(t.requests).toHaveLength(4)
  })

  test("AC3 — backs off exponentially from retryBaseMs", async () => {
    const t = setup(status(503))
    const client = t.build({ retryBaseMs: 40 })
    const started = performance.now()
    await rejection(client.decide(REQUEST))
    const elapsed = performance.now() - started
    // 40 + 80 + 160 = 280 ms; a constant (120) or linear (240) delay is too short.
    expect(elapsed).toBeGreaterThanOrEqual(260)
  })

  test("AC3 — retryBaseMs 0 retries without waiting", async () => {
    const t = setup(status(503))
    const started = performance.now()
    await rejection(t.build({ retryBaseMs: 0 }).decide(REQUEST))
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe("AC3 — errors", () => {
  test("AC3 — throws at once on 400 without retry", async () => {
    const t = setup(status(400, "bad request"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("400")
    expect(t.requests).toHaveLength(1)
  })

  test("AC3 — throws at once on 401 with the status and the body", async () => {
    const t = setup(status(401, "invalid api key"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("401")
    expect(error.message).toContain("invalid api key")
    expect(t.requests).toHaveLength(1)
  })

  test("AC3 — throws at once on 404", async () => {
    const t = setup(status(404, "no such route"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("404")
    expect(t.requests).toHaveLength(1)
  })

  test("AC3 — the error message keeps the first line of the body only", async () => {
    const t = setup(status(400, "unknown question type\nstack: secret detail"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("unknown question type")
    expect(error.message).not.toContain("secret detail")
  })

  test("AC3 — the first line of the body is reported after the retries too", async () => {
    const t = setup(status(529, "overloaded\nsecond line"))
    const error = await rejection(t.build().decide(REQUEST))
    expect(error.message).toContain("529")
    expect(error.message).toContain("overloaded")
    expect(error.message).not.toContain("second line")
    expect(t.requests).toHaveLength(4)
  })

  test("AC3 — a response that does not validate is not retried", async () => {
    const t = setup(() => jsonResponse({ nope: true }))
    await rejection(t.build().decide(REQUEST))
    expect(t.requests).toHaveLength(1)
  })
})

describe("AC4 — factories", () => {
  test("AC4 — jevSystemOne targets api.typesafe.ai with the pinned model and the key", async () => {
    process.env.TYPESAFE_API_KEY = "typesafe-test-key"
    const t = setup()
    const client = jevSystemOne({ fetch: t.fetch, retryBaseMs: 0 })
    expect(client.model).toBe("jev-1.13.0")

    const { call } = await client.decide(REQUEST)

    expect(t.requests).toHaveLength(1)
    expect(t.requests[0]?.url).toBe("https://api.typesafe.ai/v1/systemone")
    expect(t.requests[0]?.headers.get("Authorization")).toBe(
      "Bearer typesafe-test-key"
    )
    expect((t.requests[0]?.body as { model: string }).model).toBe("jev-1.13.0")
    expect(call.model).toBe("jev-1.13.0")
  })

  test("AC4 — jevSystemOne without TYPESAFE_API_KEY throws an error naming it", async () => {
    delete process.env.TYPESAFE_API_KEY
    const t = setup()
    const error = await failure(() =>
      jevSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    )
    expect(error.message).toContain("TYPESAFE_API_KEY")
    expect(t.requests).toHaveLength(0)
  })

  test("AC4 — jevSystemOne with an empty TYPESAFE_API_KEY throws an error naming it", async () => {
    process.env.TYPESAFE_API_KEY = ""
    const t = setup()
    const error = await failure(() =>
      jevSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    )
    expect(error.message).toContain("TYPESAFE_API_KEY")
    expect(t.requests).toHaveLength(0)
  })

  test("AC4 — jevSystemOne never sends the key anywhere but the Authorization header", async () => {
    process.env.TYPESAFE_API_KEY = "typesafe-test-key"
    const t = setup()
    await jevSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    expect(JSON.stringify(t.requests[0]?.body)).not.toContain(
      "typesafe-test-key"
    )
    expect(t.requests[0]?.url).not.toContain("typesafe-test-key")
  })

  test("AC4 — clefSystemOne defaults to http://localhost:11434 with the model clef-flash", async () => {
    delete process.env.OLLAMA_HOST
    const t = setup()
    const client = clefSystemOne({ fetch: t.fetch, retryBaseMs: 0 })
    expect(client.model).toBe("clef-flash")

    const { call } = await client.decide(REQUEST)

    expect(t.requests[0]?.url).toBe("http://localhost:11434/v1/systemone")
    expect((t.requests[0]?.body as { model: string }).model).toBe("clef-flash")
    expect(call.model).toBe("clef-flash")
  })

  test("AC4 — clefSystemOne targets OLLAMA_HOST when set", async () => {
    process.env.OLLAMA_HOST = "http://ollama.internal:9999"
    const t = setup()
    await clefSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    expect(t.requests[0]?.url).toBe("http://ollama.internal:9999/v1/systemone")
  })

  test("AC4 — clefSystemOne sends no Authorization header, even if a Jev key is set", async () => {
    process.env.TYPESAFE_API_KEY = "typesafe-test-key"
    const t = setup()
    await clefSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    expect(t.requests[0]?.headers.has("Authorization")).toBe(false)
  })

  test("AC4 — clefSystemOne works without TYPESAFE_API_KEY", async () => {
    delete process.env.TYPESAFE_API_KEY
    const t = setup()
    const result = await clefSystemOne({
      fetch: t.fetch,
      retryBaseMs: 0,
    }).decide(REQUEST)
    expect(result.answers.next).toEqual(CHOICE_ANSWER)
  })
})

describe("AC5 — no real calls in tests", () => {
  test("AC5 — the injected fetch is the only one used by HttpSystemOne", async () => {
    const t = setup()
    await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(1)
    expect(globalFetchCalls).toEqual([])
  })

  test("AC5 — the injected fetch is the only one used by the factories", async () => {
    process.env.TYPESAFE_API_KEY = "typesafe-test-key"
    const t = setup()
    await jevSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    await clefSystemOne({ fetch: t.fetch, retryBaseMs: 0 }).decide(REQUEST)
    expect(t.requests).toHaveLength(2)
    expect(globalFetchCalls).toEqual([])
  })

  test("AC5 — the retries go through the injected fetch too", async () => {
    const t = setup([status(503), networkError, ok])
    await t.build().decide(REQUEST)
    expect(t.requests).toHaveLength(3)
    expect(globalFetchCalls).toEqual([])
  })

  test("AC5 — the test environment holds no real TypeSafe key", () => {
    expect(process.env.TYPESAFE_API_KEY).toBeUndefined()
  })
})
