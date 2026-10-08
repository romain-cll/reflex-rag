# Vault parser

Phase 1. Turns an Obsidian vault (a folder of markdown files with wikilinks) into notes, section chunks and links labelled with the sentence around them. Pure extraction: no model call, never writes to the vault.

## Acceptance criteria

- **AC1 — frontmatter**: a YAML block between a leading `---` line and the next `---` line is parsed with `Bun.YAML`. `title` is the frontmatter `title` when it is a string, else the file name without `.md`. `date` is the frontmatter `date` as a string, else `null`. `summary` is the frontmatter `summary` when it is a string, else the first 200 characters of the body text (wikilinks rendered as their display text, heading markers removed, whitespace collapsed). Invalid YAML throws an error whose message contains the note path.
- **AC2 — chunks**: the body is split into one chunk per section, a section starting at a markdown ATX heading (`#` to `######`). Text before the first heading is a chunk with heading `""`. `heading` is the path of headings joined with `>` (for `## B` under `# A`: `A > B`). The heading line itself and the frontmatter are not part of `text`. Lines inside fenced code blocks (` ``` `) are never treated as headings. Sections whose text is empty after trimming produce no chunk.
- **AC3 — long sections**: a section longer than 2,000 characters is split at blank lines into consecutive chunks of at most 2,000 characters each, with the same `heading`. A single paragraph longer than 2,000 characters stays whole.
- **AC4 — chunk ids**: chunk ids are `<path>#<n>`, `n` counting the note's chunks from 0 in document order.
- **AC5 — wikilinks**: `[[Target]]`, `[[Target|Alias]]`, `[[Target#Heading]]` and `[[Target#Heading|Alias]]` are links to `Target`. Embeds (`![[...]]`) and anything inside inline code or fenced code blocks are not links. Links in the frontmatter are ignored.
- **AC6 — labels**: a link's `label` is the sentence that contains it (sentence boundaries from `Intl.Segmenter` with `granularity: "sentence"`, computed within the paragraph or list item), with every wikilink rendered as its display text (`Alias` when present, else `Target`), list markers removed and whitespace collapsed.
- **AC7 — vault walk**: `parseVault(dir)` reads every `*.md` file under `dir` recursively, skipping any file or folder whose name starts with `.` (such as `.obsidian`). Note paths are relative to `dir`, use `/`, and notes are returned sorted by path.
- **AC8 — resolution**: a link resolves to the note whose path, with or without `.md`, equals the target, else to the note whose file name without `.md` equals the target, both compared case-insensitively. Resolved links come back as `Link` (`targetPath` set); the others as `UnresolvedLink`. Link ids are `<sourcePath>@<n>`, `n` counting the note's links from 0 in document order.
- **AC9 — read only**: parsing a vault leaves every file and folder in it unchanged.

## Technical plan

Files:

- `src/core/types.ts` (modified): add `Note { path; title; date: string | null; summary; frontmatter: Record<string, unknown> }` and `heading: string` on `Chunk`. Add `UnresolvedLink { sourcePath; target; label }`.
- `src/vault/parse.ts` (new):
  - `parseNote(path: string, content: string): ParsedNote` with `ParsedNote { note: Note; chunks: Chunk[]; links: NoteLink[] }`, where `NoteLink { target: string; label: string }` is an unresolved link in document order.
  - `parseVault(dir: string): Promise<ParsedVault>` with `ParsedVault { notes: Note[]; chunks: Chunk[]; links: Link[]; unresolved: UnresolvedLink[] }`. Uses `Bun.Glob` to walk the folder.
- No new dependency (`Bun.YAML`, `Intl.Segmenter` and `Bun.Glob` are built in).

## Test strategy

Unit tests in `src/vault/parse.test.ts` for `parseNote` (AC1 to AC6) on inline markdown strings. Integration tests for `parseVault` (AC7 to AC9) on a small fixture vault under `src/vault/fixtures/vault/` (a few notes in subfolders, a `.obsidian/` folder with a markdown file that must be skipped, a link to a missing note, a link with a different case). AC9 compares a snapshot of file paths and contents before and after parsing.
