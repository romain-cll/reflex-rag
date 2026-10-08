import { describe, expect, test } from "bun:test"
import { stat } from "node:fs/promises"
import { join } from "node:path"
import type { Link, UnresolvedLink } from "../core/types.ts"
import { parseNote, parseVault } from "./parse.ts"

const fixtureVault = join(import.meta.dir, "fixtures", "vault")

/** Splits a section body into the list of paragraphs it was built from. */
function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).filter((p) => p.trim() !== "")
}

function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

async function snapshot(dir: string): Promise<Record<string, string | null>> {
  const entries: Record<string, string | null> = {}
  const glob = new Bun.Glob("**/*")
  for await (const rel of glob.scan({
    cwd: dir,
    dot: true,
    onlyFiles: false,
  })) {
    const full = join(dir, rel)
    // Folders have no content: record only their presence.
    entries[rel] = (await stat(full)).isDirectory()
      ? null
      : await Bun.file(full).text()
  }
  return entries
}

describe("AC1 — frontmatter", () => {
  test("AC1 — reads title, date and summary from the frontmatter", () => {
    const content = [
      "---",
      "title: Custom title",
      'date: "2026-03-04"',
      "summary: A hand-written summary.",
      "---",
      "",
      "Body text that must not become the summary.",
    ].join("\n")
    const { note } = parseNote("notes/file-name.md", content)
    expect(note.path).toBe("notes/file-name.md")
    expect(note.title).toBe("Custom title")
    expect(note.date).toBe("2026-03-04")
    expect(note.summary).toBe("A hand-written summary.")
  })

  test("AC1 — keeps an unquoted YAML date as a string", () => {
    const { note } = parseNote("a.md", "---\ndate: 2026-03-04\n---\nBody")
    expect(note.date).toBe("2026-03-04")
  })

  test("AC1 — exposes the parsed frontmatter object", () => {
    const content = "---\ntitle: T\ntags:\n  - a\n  - b\n---\nBody"
    const { note } = parseNote("a.md", content)
    expect(note.frontmatter).toEqual({ title: "T", tags: ["a", "b"] })
  })

  test("AC1 — falls back to the file name for the title and null for the date", () => {
    const { note } = parseNote("folder/My Note.md", "Just a body.")
    expect(note.title).toBe("My Note")
    expect(note.date).toBeNull()
    expect(note.frontmatter).toEqual({})
  })

  test("AC1 — falls back to the file name when the frontmatter title is not a string", () => {
    const { note } = parseNote("folder/My Note.md", "---\ntitle: 42\n---\nBody")
    expect(note.title).toBe("My Note")
  })

  test("AC1 — a --- line that is not at the very start does not open a frontmatter", () => {
    const content = "Intro\n\n---\ntitle: Not frontmatter\n---\n\nOutro"
    const { note } = parseNote("folder/plain.md", content)
    expect(note.title).toBe("plain")
    expect(note.frontmatter).toEqual({})
  })

  test("AC1 — summary falls back to the cleaned start of the body", () => {
    const content = [
      "---",
      "title: T",
      "---",
      "# Heading",
      "",
      "Some   text with [[Target|an alias]] and [[Other]].",
    ].join("\n")
    const { note } = parseNote("a.md", content)
    expect(note.summary).toBe("Heading Some text with an alias and Other.")
  })

  test("AC1 — summary fallback is the first 200 characters", () => {
    const text = "abcdef ".repeat(100).trim()
    const { note } = parseNote("a.md", text)
    expect(note.summary).toBe(text.slice(0, 200))
    expect(note.summary).toHaveLength(200)
  })

  test("AC1 — summary falls back to the body when the frontmatter summary is not a string", () => {
    const content = "---\nsummary:\n  - one\n  - two\n---\nThe body text."
    const { note } = parseNote("a.md", content)
    expect(note.summary).toBe("The body text.")
  })

  test("AC1 — invalid YAML throws an error mentioning the note path", () => {
    const content = "---\ntitle: [unclosed\n---\nBody"
    expect(() => parseNote("notes/broken.md", content)).toThrow(
      "notes/broken.md"
    )
  })
})

describe("AC2 — chunks", () => {
  test("AC2 — splits the body at headings and joins the heading path with >", () => {
    const content = [
      "Intro text",
      "",
      "# A",
      "",
      "Text A",
      "",
      "## B",
      "",
      "Text B",
      "",
      "# C",
      "",
      "Text C",
    ].join("\n")
    const { chunks } = parseNote("n.md", content)
    expect(chunks.map((c) => [c.heading, c.text.trim()])).toEqual([
      ["", "Intro text"],
      ["A", "Text A"],
      ["A > B", "Text B"],
      ["C", "Text C"],
    ])
  })

  test("AC2 — builds the heading path across skipped levels and sibling sections", () => {
    const content = [
      "# A",
      "",
      "### Deep",
      "",
      "deep text",
      "",
      "## Sibling",
      "",
      "sibling text",
      "",
      "###### Six",
      "",
      "six text",
    ].join("\n")
    const { chunks } = parseNote("n.md", content)
    expect(chunks.map((c) => c.heading)).toEqual([
      "A > Deep",
      "A > Sibling",
      "A > Sibling > Six",
    ])
  })

  test("AC2 — leaves the heading line and the frontmatter out of the text", () => {
    const content = "---\ntitle: T\n---\n# Section\n\nSection body."
    const { chunks } = parseNote("n.md", content)
    expect(chunks).toHaveLength(1)
    const [chunk] = chunks
    expect(chunk?.heading).toBe("Section")
    expect(chunk?.text.trim()).toBe("Section body.")
    expect(chunk?.text).not.toContain("# Section")
    expect(chunk?.text).not.toContain("title: T")
  })

  test("AC2 — does not treat lines inside fenced code blocks as headings", () => {
    const content = [
      "# A",
      "",
      "Before the code.",
      "",
      "```sh",
      "# not a heading",
      "echo hi",
      "```",
      "",
      "After the code.",
    ].join("\n")
    const { chunks } = parseNote("n.md", content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.heading).toBe("A")
    expect(chunks[0]?.text).toContain("# not a heading")
    expect(chunks[0]?.text).toContain("After the code.")
  })

  test("AC2 — produces no chunk for sections that are empty after trimming", () => {
    const content = [
      "# A",
      "",
      "## Empty",
      "",
      "   ",
      "",
      "## Filled",
      "",
      "Real text.",
      "",
      "## Trailing",
    ].join("\n")
    const { chunks } = parseNote("n.md", content)
    expect(chunks.map((c) => c.heading)).toEqual(["A > Filled"])
  })

  test("AC2 — produces no chunk for a body that is empty or only frontmatter", () => {
    expect(parseNote("n.md", "").chunks).toEqual([])
    expect(parseNote("n.md", "---\ntitle: T\n---\n").chunks).toEqual([])
  })
})

describe("AC3 — long sections", () => {
  test("AC3 — splits a section over 2000 characters at blank lines", () => {
    const paras = ["a".repeat(900), "b".repeat(900), "c".repeat(900)]
    const content = `# Long\n\n${paras.join("\n\n")}`
    const { chunks } = parseNote("n.md", content)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Long")
      expect(chunk.text.length).toBeLessThanOrEqual(2000)
    }
    // Every chunk is made of whole paragraphs, in document order, none lost.
    const rebuilt = chunks.flatMap((c) =>
      paragraphs(c.text).map((p) => p.trim())
    )
    expect(rebuilt).toEqual(paras)
  })

  test("AC3 — keeps a section of exactly 2000 characters in one chunk", () => {
    const content = `# Edge\n\n${"a".repeat(999)}\n\n${"b".repeat(999)}`
    const { chunks } = parseNote("n.md", content)
    expect(chunks).toHaveLength(1)
  })

  test("AC3 — splits a section of 2001 characters", () => {
    const content = `# Edge\n\n${"a".repeat(1000)}\n\n${"b".repeat(999)}`
    const { chunks } = parseNote("n.md", content)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(2000)
    }
  })

  test("AC3 — keeps a single paragraph longer than 2000 characters whole", () => {
    const long = "x".repeat(2500)
    const content = `# Long\n\nShort before.\n\n${long}\n\nShort after.`
    const { chunks } = parseNote("n.md", content)
    const holders = chunks.filter((c) => c.text.includes("x"))
    expect(holders).toHaveLength(1)
    expect(holders[0]?.text).toContain(long)
    expect(holders[0]?.heading).toBe("Long")
    expect(chunks.map((c) => c.text).join("\n")).toContain("Short before.")
    expect(chunks.map((c) => c.text).join("\n")).toContain("Short after.")
  })
})

describe("AC4 — chunk ids", () => {
  test("AC4 — numbers chunks from 0 in document order, skipping empty sections", () => {
    const content = [
      "Intro",
      "",
      "# A",
      "",
      "Text A",
      "",
      "# Empty",
      "",
      "# C",
      "",
      "Text C",
    ].join("\n")
    const { chunks } = parseNote("folder/n.md", content)
    expect(chunks.map((c) => c.id)).toEqual([
      "folder/n.md#0",
      "folder/n.md#1",
      "folder/n.md#2",
    ])
    expect(chunks.every((c) => c.notePath === "folder/n.md")).toBe(true)
  })

  test("AC4 — keeps counting through the pieces of a split section", () => {
    const paras = ["a".repeat(1500), "b".repeat(1500)]
    const content = `# Long\n\n${paras.join("\n\n")}\n\n# After\n\nTail.`
    const { chunks } = parseNote("n.md", content)
    expect(chunks.map((c) => c.id)).toEqual(
      chunks.map((_, index) => `n.md#${index}`)
    )
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.at(-1)?.heading).toBe("After")
  })
})

describe("AC5 — wikilinks", () => {
  test("AC5 — reads all four wikilink forms as links to Target", () => {
    const content = [
      "- [[Target]]",
      "- [[Target|Alias]]",
      "- [[Target#Heading]]",
      "- [[Target#Heading|Alias]]",
    ].join("\n")
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual([
      "Target",
      "Target",
      "Target",
      "Target",
    ])
  })

  test("AC5 — returns links in document order", () => {
    const content =
      "# A\n\nSee [[First]].\n\n# B\n\nThen [[Second]] and [[Third]]."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual(["First", "Second", "Third"])
  })

  test("AC5 — ignores embeds", () => {
    const content = "![[diagram.png]] and ![[Other note]] but [[Real]]."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual(["Real"])
  })

  test("AC5 — ignores links inside inline code", () => {
    const content = "Write `[[Not a link]]` to link, e.g. [[Real]]."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual(["Real"])
  })

  test("AC5 — ignores links inside fenced code blocks", () => {
    const content = [
      "Before [[Real]].",
      "",
      "```md",
      "[[Not a link]]",
      "```",
      "",
      "After.",
    ].join("\n")
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual(["Real"])
  })

  test("AC5 — ignores links in the frontmatter", () => {
    const content = [
      "---",
      'related: "[[In frontmatter]]"',
      "see:",
      '  - "[[Also frontmatter]]"',
      "---",
      "",
      "Body links to [[In body]].",
    ].join("\n")
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.target)).toEqual(["In body"])
  })
})

describe("AC6 — labels", () => {
  test("AC6 — labels a link with the sentence that contains it", () => {
    const content =
      "First sentence here. See [[Target|the alias]] for more. Last one."
    const { links } = parseNote("n.md", content)
    expect(links).toEqual([
      { target: "Target", label: "See the alias for more." },
    ])
  })

  test("AC6 — renders Target when there is no alias, dropping the heading", () => {
    const content = "Read [[Target#Heading]] and [[Other]] first."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual([
      "Read Target and Other first.",
      "Read Target and Other first.",
    ])
  })

  test("AC6 — renders every wikilink of the sentence as its display text", () => {
    const content = "Compare [[A]] with [[B|bee]] today."
    const { links } = parseNote("n.md", content)
    expect(links).toEqual([
      { target: "A", label: "Compare A with bee today." },
      { target: "B", label: "Compare A with bee today." },
    ])
  })

  test("AC6 — gives links in different sentences different labels", () => {
    const content = "Alpha links to [[One]]. Beta links to [[Two]]."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual([
      "Alpha links to One.",
      "Beta links to Two.",
    ])
  })

  test("AC6 — removes list markers and uses the list item as the context", () => {
    const content = [
      "Intro sentence without link.",
      "",
      "- Bullet with [[Dash]] inside.",
      "* Star with [[Star]] inside.",
      "1. Numbered with [[Num]] inside.",
      "- Unrelated item.",
    ].join("\n")
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual([
      "Bullet with Dash inside.",
      "Star with Star inside.",
      "Numbered with Num inside.",
    ])
  })

  test("AC6 — cuts sentences inside a list item", () => {
    const content = "- Does not matter. But this one has [[Target]] in it."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual([
      "But this one has Target in it.",
    ])
  })

  test("AC6 — collapses whitespace and line breaks of the paragraph", () => {
    const content = "Line one\nmentions   [[Target]]\nin   text."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual([
      "Line one mentions Target in text.",
    ])
  })

  test("AC6 — does not extend the sentence into the previous paragraph", () => {
    const content =
      "Previous paragraph with no full stop\n\nNext has [[Target]] here."
    const { links } = parseNote("n.md", content)
    expect(links.map((l) => l.label)).toEqual(["Next has Target here."])
  })
})

describe("AC7 — vault walk", () => {
  test("AC7 — reads every markdown file recursively, sorted, skipping dot entries", async () => {
    const { notes } = await parseVault(fixtureVault)
    expect(notes.map((n) => n.path)).toEqual([
      "daily/2026-01-01.md",
      "index.md",
      "projects/alpha.md",
      "projects/beta.md",
    ])
  })

  test("AC7 — builds notes with the single-note rules", async () => {
    const { notes } = await parseVault(fixtureVault)
    expect(notes.map((n) => n.title)).toEqual([
      "2026-01-01",
      "Home",
      "Alpha project",
      "beta",
    ])
  })

  test("AC7 — builds chunks for every note with path-based ids", async () => {
    const { chunks } = await parseVault(fixtureVault)
    expect(byId(chunks).map((c) => c.id)).toEqual([
      "daily/2026-01-01.md#0",
      "index.md#0",
      "projects/alpha.md#0",
      "projects/alpha.md#1",
      "projects/beta.md#0",
    ])
    const alphaGoals = chunks.find((c) => c.id === "projects/alpha.md#1")
    expect(alphaGoals?.heading).toBe("Alpha > Goals")
    expect(alphaGoals?.notePath).toBe("projects/alpha.md")
  })
})

describe("AC8 — resolution", () => {
  test("AC8 — resolves by file name, by path with or without .md, ignoring case", async () => {
    const { links } = await parseVault(fixtureVault)
    const expected: Link[] = [
      {
        id: "index.md@0",
        sourcePath: "index.md",
        targetPath: "projects/alpha.md",
        label: "Start with Alpha and then read the beta notes.",
      },
      {
        id: "index.md@1",
        sourcePath: "index.md",
        targetPath: "projects/beta.md",
        label: "Start with Alpha and then read the beta notes.",
      },
      {
        id: "index.md@3",
        sourcePath: "index.md",
        targetPath: "projects/alpha.md",
        label: "Check the goals regularly.",
      },
      {
        id: "projects/alpha.md@0",
        sourcePath: "projects/alpha.md",
        targetPath: "projects/beta.md",
        label: "Alpha ships with Beta.",
      },
      {
        id: "projects/alpha.md@1",
        sourcePath: "projects/alpha.md",
        targetPath: "index.md",
        label: "Back to the INDEX page.",
      },
      {
        id: "projects/beta.md@0",
        sourcePath: "projects/beta.md",
        targetPath: "projects/alpha.md",
        label: "Beta builds on projects/alpha.md and the Daily/2026-01-01 log.",
      },
      {
        id: "projects/beta.md@1",
        sourcePath: "projects/beta.md",
        targetPath: "daily/2026-01-01.md",
        label: "Beta builds on projects/alpha.md and the Daily/2026-01-01 log.",
      },
    ]
    expect(byId(links)).toEqual(expected)
  })

  test("AC8 — returns links to missing notes as unresolved links", async () => {
    const { unresolved } = await parseVault(fixtureVault)
    const expected: UnresolvedLink[] = [
      {
        sourcePath: "index.md",
        target: "Missing note",
        label: "A dangling reference to Missing note remains.",
      },
    ]
    expect(unresolved).toEqual(expected)
  })

  test("AC8 — counts unresolved links in the link ids of the note", async () => {
    // index.md has links 0 and 1 resolved, 2 unresolved, 3 resolved.
    const { links } = await parseVault(fixtureVault)
    const indexIds = links
      .filter((l) => l.sourcePath === "index.md")
      .map((l) => l.id)
    expect(indexIds.sort()).toEqual(["index.md@0", "index.md@1", "index.md@3"])
  })
})

describe("AC9 — read only", () => {
  test("AC9 — leaves every file and folder of the vault unchanged", async () => {
    const before = await snapshot(fixtureVault)
    expect(Object.keys(before)).toContain(".obsidian/workspace.md")

    await parseVault(fixtureVault)

    const after = await snapshot(fixtureVault)
    expect(after).toEqual(before)
  })
})
