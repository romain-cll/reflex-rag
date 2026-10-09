# System-one client

Phase 4. The client of the system-one decision API (`POST /v1/systemone`), shared by Jev (TypeSafe's hosted API, used for tuning and the published runs) and Clef-flash served locally by Ollama (same API, used only to check that code runs). A request holds one shared `state` and named closed questions; the answer gives a probability per option.

## Acceptance criteria

- **AC1 — interface**: `src/core/system-one.ts` defines `SystemOne { model: string; decide(request): Promise<{ answers; call }> }`. A request is `{ state: unknown; questions: Record<string, SystemOneQuestion> }`, where a question is `{ type: "choice"; instructions: string; criteria: Record<string, string> }` or `{ type: "noul"; instructions: string; criteria?: { true: string; false: string } }`. An answer is `{ type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }` or `{ type: "noul"; noul: number }`.
- **AC2 — HTTP client**: `HttpSystemOne({ baseUrl, model, apiKey?, fetch? })` posts `{ model, state, questions }` as JSON to `${baseUrl}/v1/systemone`, with `Authorization: Bearer <apiKey>` when a key is given. The response is validated with Zod (`answers`, `usage.input_tokens`, `usage.output_tokens`); the answers of the request's question ids are returned. `call` reports the configured model, the input and output tokens of `usage`, and the latency.
- **AC3 — retries and errors**: statuses 429, 529 and 5xx, and network errors, are retried up to 3 times with an exponential backoff (base delay an option, so that tests run without waiting); any other status throws at once. An error message names the status and the first line of the response body; a response that does not validate throws an error naming the cause.
- **AC4 — factories**: `jevSystemOne()` reads `TYPESAFE_API_KEY` (missing or empty: an error naming it) and targets `https://api.typesafe.ai` with the model pinned to `jev-1.13.0`, so that runs are reproducible. `clefSystemOne()` targets `OLLAMA_HOST` (default `http://localhost:11434`) with the model `clef-flash` and no key.
- **AC5 — no real calls in tests**: `fetch` is injectable; every test runs on a fake.

## Technical plan

- `src/core/system-one.ts` (new): the types and the `SystemOne` interface.
- `src/models/system-one.ts` (new): `HttpSystemOne`, `jevSystemOne`, `clefSystemOne`.
- Uses `ModelCall` from `src/core/types.ts`. No new dependency.

## Test strategy

Unit tests in `src/models/system-one.test.ts` with a fake `fetch`: request URL, headers and body; response mapping and the `ModelCall`; validation errors; retries on 429, 529, 503 and a network error, then success; no retry on 400 or 401; the retry limit; the factories' URL, model and key handling (environment set and restored inside the test).
