# Index

Phase 1. The derived SQLite index of a vault: notes, section chunks, labelled links, a BM25 full-text index and chunk embeddings. Disposable and rebuilt from scratch by `reflex index`; the vault itself is never written.

## Acceptance criteria

- **AC1 — fresh build**: `buildIndex({ vault, embedder, dbPath, vaultPath })` writes a SQLite database at `dbPath` (creating missing parent folders), replacing any file already there.
- **AC2 — notes**: `openIndex(dbPath).getNote(pathOrTitle)` returns the parsed note (path, title, date, summary, frontmatter) by its path or by its title compared case-insensitively, and `null` when there is none.
- **AC3 — chunks**: `chunksOf(path)` returns the note's chunks (id, note path, heading, text) in document order.
- **AC4 — links**: `outgoingLinks(path)` returns the note's resolved links in document order, and `backlinks(path)` the resolved links that target it, each with id, source path, target path and label. Unresolved links are not stored; `buildIndex` returns their count.
- **AC5 — embeddings**: every chunk is embedded once, through a single `embedder.embed` call, from the text `<note title>\n<heading>\n\n<chunk text>` (the heading line is left out when the heading is empty). `embeddings()` returns one `Float32Array` per chunk id, equal to the vector the embedder returned. `buildIndex` returns the embedder's `calls`.
- **AC6 — BM25 search**: `searchBM25(query, k)` returns at most `k` `{ chunk, score }` results ranked best first by FTS5 `bm25` over note title, heading and chunk text, with the `porter unicode61` tokenizer, so that `validated vendors` finds a chunk saying `validate the vendor`. The query is split into words, any of which may match; punctuation and FTS5 syntax characters in the query (quotes, `-`, `:`, `*`, parentheses) never raise an error.
- **AC7 — metadata**: `meta()` returns the vault path, the embedder model and dimensions, the build time (ISO 8601) and the counts of notes, chunks, links and unresolved links.
- **AC8 — vault untouched**: building leaves every file and folder of the vault unchanged.
- **AC9 — rebuild**: building the same vault twice into the same `dbPath` gives the same notes, chunks, links and search results.
- **AC10 — CLI errors**: `reflex index <vault>` exits with code 1 and an error on stderr naming the path when `<vault>` is not a directory, and naming `MISTRAL_API_KEY` when that variable is missing or empty. (This replaces the "not implemented" answer of `reflex index` from the CLI skeleton.)

## Technical plan

Files:

- `src/index/build.ts` (new): `buildIndex(options: { vault: ParsedVault; embedder: Embedder; dbPath: string; vaultPath: string }): Promise<{ notes: number; chunks: number; links: number; unresolved: number; calls: ModelCall[] }>`. Tables `notes`, `chunks` (embedding as a Float32 BLOB), `links`, `meta`, and the FTS5 table `chunks_fts`. Uses `bun:sqlite`.
- `src/index/read.ts` (new): `openIndex(dbPath)` returning `{ getNote, chunksOf, outgoingLinks, backlinks, searchBM25, embeddings, meta, close }`.
- `src/commands/index.ts` (modified): parses the vault with `parseVault`, builds `.reflex/index.db` (relative to the working directory) with a `MistralEmbedder`, prints a summary (notes, chunks, links, unresolved links, embedding input tokens, duration) and returns 0. Errors of AC10 return 1.
- `scripts/inspect-note.ts` (new, no automated test): `bun scripts/inspect-note.ts <path or title>` opens `.reflex/index.db` and prints the note, its chunks, its outgoing links and its backlinks with their labels.
- No new dependency.

## Test strategy

Integration tests in `src/index/index.test.ts`: parse a small fixture vault (own fixtures under `src/index/fixtures/`, or the parser's `src/vault/fixtures/vault/`), build into a temporary folder with a deterministic fake `Embedder` (vectors derived from the text, records its calls), then check AC1 to AC9 through `openIndex`. CLI tests for AC10 in `src/cli.test.ts`, run from a temporary working directory so that the repository's `.env` (which Bun loads automatically) does not provide the key. The successful `reflex index` run calls the real API and is checked by hand.
