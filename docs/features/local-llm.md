# Local LLM for the bench

Run configs A, B, C and C+ fully locally on one Mac (Apple M4 Pro, 24 GB unified memory): Qwen3.5-9B served by Ollama in every LLM role (B's judge, C's fallback, the query rewriter, the answerer) and Clef-flash as the system one, so that the configs can be compared by relative differences on one machine. Clef-flash is a Qwen3.5-9B backbone with a decision head, so B against C isolates "decision head against generated text" on the same backbone. The published figures (Jev and Haiku) are unchanged: `--llm` defaults to `haiku`.

Built in PR #1 (red `11a7c47`, test fix `7fdcab9`, implementation `9079a9f`, squashed as `701c110`). This file is the spec of that PR, versioned afterwards: it was drafted in a local planning folder that is not versioned.

## Acceptance criteria

- AC1 — Given `reflex eval --config <A|B|C>` without `--llm`, when the run is built, then every LLM role (answerer; B's judge; C's fallback; the LLM rewriter) uses `claude-haiku-5-5` through `AnthropicLLM` exactly as today, and the settings line of the trace names `claude-haiku-5-5` for those roles.
- AC2 — Given `--llm qwen` with any config, when the run is built, then the answerer, B's judge, C's fallback and the LLM rewriter all use one `OllamaLLM` on the pinned tag `qwen3.5:9b-mxfp8`, and the settings line of the trace names `qwen3.5:9b-mxfp8` for each of those roles (`judge` is still the system one's model in C).
- AC3 — Given `--llm` with a value other than `haiku` or `qwen`, when the command parses its options, then it exits 1 with `reflex eval: invalid --llm "<value>", expected haiku or qwen`.
- AC4 — Given `--llm qwen`, when the environment needed by the run is listed, then `ANTHROPIC_API_KEY` is not in it (`MISTRAL_API_KEY` still is); given `--llm haiku` without `--dry-run`, it is.
- AC5 — Given `--llm qwen --dry-run`, when the upper bound is printed, then the LLM calls are counted and labelled `Ollama (qwen3.5:9b-mxfp8)` and priced 0 USD; with `--llm haiku` the output is unchanged (`Anthropic (claude-haiku-5-5)`).
- AC6 — Given `reflex --help`, when the usage is printed, then it lists `[--llm haiku|qwen]` for `eval`.
- AC7 — Given a `ModelCall` of model `qwen3.5:9b-mxfp8`, when `callCostUsd` prices it, then the cost is 0.
- AC8 — Given a request `{ system, prompt, maxTokens }`, when `complete` is called, then it sends one `POST <OLLAMA_HOST>/api/chat` with `model: "qwen3.5:9b-mxfp8"`, `stream: false`, `think: false`, messages `[system, user]` (no system message when `system` is absent), `options.num_ctx: 32768`, `options.num_predict: maxTokens`, and no other option; and it returns `message.content` as `text`. `OLLAMA_HOST` is read as `clefSystemOne` reads it.
- AC9 — Given a schema, when `completeJson` is called, then the body also carries `format` = the schema's JSON Schema (`z.toJSONSchema`, without `$schema`), and the reply's `message.content` is parsed as JSON and validated against the schema; the validated value is returned.
- AC10 — Given an Ollama reply with `prompt_eval_count`, `eval_count`, `load_duration` (ns), when the call is recorded, then its `ModelCall` has `inputTokens = prompt_eval_count`, `outputTokens = eval_count`, `loadMs = load_duration / 1e6`, and `latencyMs` = the wall-clock time of the request minus `loadMs`, floored at 0.
- AC11 — Given a reply with `done_reason: "length"`, when it comes back, then the adapter throws an `LLMCallError` (message names the truncation) carrying the call.
- AC12 — Given a reply where `prompt_eval_count + maxTokens > 32768`, when it comes back, then the adapter throws an `LLMCallError` saying the prompt fills the context window (`num_ctx 32768`) and may have been truncated, carrying the call.
- AC13 — Given `completeJson` and a reply whose content is not JSON, or is JSON that fails the schema, when it comes back, then the adapter throws an `LLMCallError` naming which of the two, carrying the call.
- AC14 — Given a non-2xx response (e.g. 404 for a model not pulled), when it comes back, then the adapter throws an `Error` `Ollama request failed (<status>): <first line of the body, 200 chars max>`; given a network failure (Ollama not running), it throws `Ollama request failed: <reason>`. No retry.
- AC15 — Given Clef-flash (`clefSystemOne()`), when `decide` is called, then it first sends `GET <host>/api/ps`; if `clef-flash` (or `clef-flash:latest`) is listed, it sends the decision request and the call has `loadMs: 0`.
- AC16 — Given `/api/ps` does not list Clef-flash, when `decide` is called, then it sends one warm-up `POST /v1/systemone` (one `noul` question) before the real request; the returned call's `loadMs` is the warm-up's wall-clock time, its `latencyMs` covers the real request only, and its tokens are the real request's. Concurrent `decide` calls (the judge sends its batches in parallel) share one warm-up: one call carries its `loadMs`, the others `loadMs: 0`. A failed warm-up fails `decide` with the existing `System-one request failed …` errors, without sending the real request.
- AC17 — Given Jev (`jevSystemOne()`), when `decide` is called, then no `/api/ps` or warm-up request is sent and the call has no `loadMs`.
- AC18 — Given calls with `loadMs` inside a loop turn, when the loop records its stages, then `rewriteMs` and `judgeMs` (when the judge reports no stages) are the wall-clock time of the stage minus the `loadMs` of the calls the stage returned, floored at 0.
- AC19 — Given the fallback judge, when it reports its stages, then `judgeMs` excludes the `loadMs` of the primary's calls and `fallbackMs` the `loadMs` of the fallback's calls, each floored at 0.
- AC20 — Given a question whose calls carry `loadMs`, when its record is written, then `latencyMs`, `retrievalMs`, `answerMs` and config A's `searchMs` exclude the `loadMs` of the calls of their span (all calls; retrieval calls; the answer call; retrieval calls), floored at 0; each call keeps its `loadMs` in the trace. The same holds for a record of a loop error or an answer error, over the calls it carries.
- AC21 — Given a run, when `summary.json` is written, then it holds `modelLoadMs: { total, max }` over the calls that have a `loadMs`, or `null` when none has one.
- AC22 — Given a `SystemOneJudge` with request limits `{ maxQuestions: 64, maxBytes: 65536 }`, when it judges notes, then every request it sends has at most 64 questions and a body (`JSON.stringify({ model, state, questions })`, UTF-8) under 65536 bytes; batches are filled in note order with as many notes as fit (with the veto and sufficiency on: at most 31 notes, 31×2+2 = 64 questions), and every note gets its verdict as today.
- AC23 — Given notes whose texts would push a batch to 65536 bytes or more, when it judges them, then the batch is split before that note, and every note's text is sent whole (no truncation).
- AC24 — Given a note whose request alone (with the kept notes of the context) is 65536 bytes or more, when it judges, then it throws, before sending any request, `System-one request for note <path> is <n> bytes, over the limit of 65536`; nothing is truncated.
- AC25 — Given a `SystemOneJudge` without request limits (Jev), when it judges, then the batches are exactly today's (40 notes per call, no byte or question check).
- AC26 — Given config C, when the system-one judge is built (run and dry run), then it gets Clef's limits (`CLEF_LIMITS`) with `--system-one clef` and none with `--system-one jev`; the dry run of C with Clef counts the calls of the split batches.

## Out of scope

- Threshold retuning for Qwen and Clef: a run phase on the tuning split, after this build.
- The runs themselves, any README or REPORT change, any change to published results or figures.
- A local embedder: embeddings stay `mistral-embed`, so the search is the published bench's.
- Retrying Ollama calls, streaming, choosing another local model or tag from the CLI.
- Managing Ollama (start, pull, `keep_alive`); `iogpu.wired_limit_mb` stays at its default.

## Decisions

- 2026-10-30 — Qwen3.5-9B on Ollama in all four LLM roles, Clef-flash as system one, `mistral-embed` kept; `--llm` defaults to `haiku`. Gemma 4 was rejected: Clef-flash's `config.json` is a Qwen3.5-9B (`model_type: qwen3_5`, 32 layers, hidden size 4096) with a decision head.
- 2026-10-30 — `think: false` (Qwen3.5 has no thinking budget, only on or off); `num_ctx: 32768` for every call (B's largest judge prompt in the published traces is 18,010 tokens, and a change of `num_ctx` reloads the model); sampling at the tag's defaults, no seed.
- 2026-10-30 — Clef reports no load time on `/v1/systemone`: its client checks `/api/ps` and warms Clef up outside the timer.
- 2026-10-30 — Clef's batching differs from the published C (Jev, up to 40 notes and 82 questions per call): at most 31 notes per call with the veto and sufficiency, and fewer when the body nears 64 KiB (49% of the published C judge calls exceed 15K tokens). The veto's `best` question and the sufficiency question see only their batch. Truncating note texts was rejected: C would see less than B.

## Revision 2 — the first smoke run

The first smoke run of B (3 tuning questions) failed on every question: the MLX runner of `qwen3.5:9b-mxfp8` answers `501 {"error":"structured output is unavailable"}` to any `format`, a JSON schema or plain `"json"` (Ollama 0.40.1, checked by hand); plain chat works. Reading the code against Ollama's behaviour also showed that Clef's 60 s timeout sits right above a 64 KiB request (Clef reads about 310 tokens/s: 14K tokens in 45 s), and that the batches the judge sends in parallel queue on Ollama, which serves one request at a time, so each batch's latency held the wait for the others.

- **AC27 — the tag**: `QWEN_MODEL` is `qwen3.5:9b-q8_0` (10 GB, 8-bit like Clef's mxfp8, on Ollama's GGUF runner, which supports `format`), priced 0. It replaces `qwen3.5:9b-mxfp8` in AC2, AC5, AC7 and AC8.
- **AC28 — Clef's timeout**: `clefSystemOne()` aborts an attempt after `CLEF_TIMEOUT_MS` = 600,000 ms unless `timeoutMs` is given; `jevSystemOne()` keeps 60 s.
- **AC29 — one batch at a time**: `SystemOneJudge` with `sequential: true` sends its batches one after the other, in batch order, and stops at the first that fails, throwing a `JudgeCallsError` that carries the completed calls. Config C sets it with `--system-one clef` only.

Decision (2026-10-30, validated by Romain): `q8_0` rather than keeping `mxfp8` with the schema in the prompt. With `q8_0`, B's judge keeps a constrained JSON output as Haiku had, with the same prompt; the price is a different runner from Clef's (GGUF against MLX), whose prefill speed can differ. That gap is measured in the traces (tokens per second of each model) and reported with the figures. Without a constraint, B would get a different prompt and lose a question to every malformed JSON, a bias against B on quality that cannot be corrected afterwards.

Tests: red `381e39b`, implementation `9aeef48`.

## Revision 3 — the second smoke run

The smoke run of C+ (3 tuning questions) ended in `loop_error` on every question, on two limits of Clef that revision 1 missed: `question "best": criteria must contain 2–26 candidates` (the veto's `best` question has an option per note plus `none`, so 31 notes are 32 options), and `Clef input has 17246 tokens; context limit is 16384` (a request under 64 KiB can still be over Clef's context). Four real judge requests measured 3.55 to 3.89 bytes a token (`usage.input_tokens` against the body's UTF-8 bytes).

- **AC30 — the limits**: `CLEF_LIMITS` is `{ maxQuestions: 64, maxBytes: 49152, maxChoices: 26 }`. 48 KiB is 16,384 tokens at 3.0 bytes a token, 15% below the lowest ratio measured; a request over Clef's context still fails loudly with its 400, never truncated.
- **AC31 — balanced batches**: with the veto and `maxChoices`, a batch holds at most `maxChoices − 1` notes, and the notes are split in batches of even size (40 notes are 20 and 20, 26 are 13 and 13, 25 fit one batch). Without the veto there is no `best` question and `maxChoices` does not cap the batch. The byte and question limits still apply on top.

Tests: red `4bee280`, then the implementation.
