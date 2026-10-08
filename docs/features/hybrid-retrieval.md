# Hybrid retrieval

Phase 2. The candidate search shared by every config: BM25 and embedding similarity over the chunks of the index, fused by reciprocal rank fusion (RRF). Config A answers from its top k; configs B and C judge its top 50.

## Acceptance criteria

`new HybridRetriever(index, embedder, options?)` then `retrieve(query, k)` returns `{ chunks, calls }`, where each item of `chunks` is `{ chunk, score, bm25Rank, vectorRank }`.

- **AC1 — candidates**: the BM25 list is `index.searchBM25(query, candidates)`. The vector list is the `candidates` chunks with the highest cosine similarity between the query embedding and the chunk embeddings of the index. `candidates` defaults to 50.
- **AC2 — fusion**: a chunk's `score` is the sum, over the lists it appears in, of `1 / (rrfK + rank)`, ranks counted from 1; `rrfK` defaults to 60. Results are sorted by `score`, highest first, ties broken by chunk id, and cut to `k`. `bm25Rank` and `vectorRank` give the chunk's rank in each list, or `null` when it is not in that list.
- **AC3 — cosine**: similarity is the dot product divided by the product of the norms, so that vectors need not be normalized; a zero vector has similarity 0.
- **AC4 — calls**: the query is embedded with exactly one `embedder.embed([query])` call per `retrieve`, and `calls` returns that call's `ModelCall`s.
- **AC5 — edge cases**: when fewer than `k` chunks are found, all of them are returned; a query with no BM25 match still returns the vector candidates.
- **AC6 — loading**: the chunk embeddings are read from the index once per retriever, not once per query.

## Technical plan

Files:

- `src/retrieval/hybrid.ts` (new): `class HybridRetriever` with options `{ candidates?: number; rrfK?: number }`, and the types `RetrievedChunk`, `Retrieval`. Uses the index read API of `src/index/read.ts` (`searchBM25`, `embeddings`, `chunksOf` or an equivalent lookup of chunks by id) and the `Embedder` interface. Brute-force cosine in memory, no vector database.
- If the read API lacks a way to fetch a chunk by id, add `chunk(id)` to `src/index/read.ts`.
- No new dependency.

## Test strategy

Integration tests in `src/retrieval/hybrid.test.ts`: build an index from a small fixture vault (the index fixtures under `src/index/fixtures/` may be reused, read-only) with a deterministic fake embedder, then retrieve with a fake query embedder whose vectors are chosen to make the BM25 and vector rankings differ; check ranks, RRF scores, ties, the single embed call, and that `embeddings()` is read once (spy on the index object). No network.
