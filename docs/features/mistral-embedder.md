# Mistral embedder

Phase 1. An `Embedder` backed by the Mistral embeddings API (`mistral-embed`, 1,024 dimensions, unit-norm vectors), used to embed chunks when building the index and questions at query time.

API facts (docs.mistral.ai, endpoint reference): `POST https://api.mistral.ai/v1/embeddings`, JSON body `{ "model": "mistral-embed", "input": string[] }`, response `{ data: [{ embedding: number[], index: number }], usage: { prompt_tokens: number } }`. The docs state no limit on inputs per request, and the free tier is rate limited: requests are batched and retried.

## Acceptance criteria

- **AC1 — request**: `embed(texts)` sends `POST https://api.mistral.ai/v1/embeddings` with headers `Authorization: Bearer <apiKey>` and `Content-Type: application/json`, and body `{ "model": <model>, "input": <texts of the batch> }`. The model defaults to `mistral-embed`.
- **AC2 — batching and order**: texts are sent in consecutive batches of at most `batchSize` (default 32), one request at a time. The result has one `Float32Array` per input text, in input order, placed by each item's `index` even when the response lists them out of order.
- **AC3 — calls**: the result has one `ModelCall` per request: `model`, `inputTokens` = `usage.prompt_tokens`, `outputTokens` = 0, `latencyMs` ≥ 0.
- **AC4 — retries**: a response with status 429 or 5xx is retried up to `maxRetries` times (default 5), waiting through the injected `sleep` before each retry: the `Retry-After` header in seconds when present, else 1 s, 2 s, 4 s… After the last retry, `embed` throws an error that contains the status.
- **AC5 — other errors**: any other non-2xx status throws at once, without retry, with an error that contains the status and the start of the response body.
- **AC6 — malformed response**: a 2xx response that does not match the expected shape, or that has not exactly one item per input of the batch, throws.
- **AC7 — empty input**: `embed([])` returns no vectors and no calls, without any request.
- **AC8 — interface**: `MistralEmbedder` implements `Embedder` with `model` and `dimensions` = 1024.

## Technical plan

Files:

- `src/core/embedder.ts` (modified): `Embedding.call: ModelCall` becomes `calls: ModelCall[]`, one per request, as in `Judge`.
- `src/models/mistral-embedder.ts` (new): `class MistralEmbedder implements Embedder`, constructor options `{ apiKey: string; model?: string; batchSize?: number; maxRetries?: number; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }`. `fetch` defaults to the global `fetch`, `sleep` to `Bun.sleep`. Response validated with a Zod schema.
- Dependency: `zod` (already installed).

## Test strategy

Unit tests in `src/models/mistral-embedder.test.ts` with an injected fake `fetch` that records requests and returns scripted `Response`s, and an injected `sleep` that records the waits. No real network call.
