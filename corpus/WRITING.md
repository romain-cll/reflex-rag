# Writing the vault

You write notes of the Obsidian vault of Larkspur Devices, Inc., a fictional company. Each note comes from a brief in `corpus/<name>/briefs/batch-NN.md`. The vault is the test corpus of a retrieval benchmark: a script checks every fact, link and trap of the brief, and anything you add beyond the brief can corrupt the expected answers of the evals.

## Files

- Write each note at `corpus/<name>/vault/<path>`, with the path given in the brief (create the folders). One file per note, nothing else in the vault.
- A file starts with the frontmatter: a `---` line, the YAML block of the brief copied exactly (same keys, values and order), a `---` line.
- The body follows in markdown. Do not repeat the title as a `#` heading: Obsidian shows the file name. Use `##` headings for the sections the note type calls for.

## What to write

- US English, in a workplace tone that fits the note type and its author:
  - **meeting**: one line on who met and why, then sections such as `## Discussion`, `## Decisions`, `## Action items`. Attendees are in the frontmatter.
  - **spec**: structured sections (`## Overview`, `## Power`, `## Cost`, `## Enclosure`…).
  - **quote**: summary of a supplier's offer: scope, price, lead time, conditions.
  - **decision**: context, decision, consequences.
  - **project**: hub page with a summary, the status, the key dates and links.
  - **customer**, **supplier**, **person**: short reference pages.
  - **journal**: first person, informal, a few paragraphs. Opinions and moods are welcome.
- Stay within the word range of the brief.
- State every fact of the brief in natural prose. You may rephrase the statement, but keep each anchor word for word.
- Put each link `[[Title]]` inside a real sentence that says what the brief's intent says, for example: "The final decision is recorded in [[2025-03-22 Atlas tooling sign-off]]." Never a bare list of links, never a link in the frontmatter. Use the exact title between the brackets; an alias is allowed: `[[Title|alias]]`.
- Follow the "Situation": it says what the note is and what it must convey, including its traps (a page that was never updated, a copy that disagrees with the original, a rumour).

## What not to write

- No names of people, companies, products or places other than those of the brief (cast, facts, frontmatter, links, situation). Refer to anyone else by role: "the team", "finance", "the vendor".
- No numbers, amounts, dates, percentages, durations or quantities other than those of the brief (anchors, frontmatter, situation, titles of linked notes). Numbers from zero to ten are allowed but must not carry facts. No times of day.
- No decisions, outcomes, prices or plans the brief does not state. Filler is fine when it stays generic (process, mood, routine).
- No wikilinks other than the brief's links.
- The words listed under "Never use these words" must not appear, in any form.
- Never mention these topics, anywhere: patents, crowdfunding (Kickstarter, Indiegogo), Japan, NPS or Net Promoter Score, data residency, ISO 14001, carbon footprint, SOC 2, Series C, a holiday party, a four-day week, Seattle.

## Check your work

Run `bun corpus/generator/cli.ts validate <name> --batch batch-NN` and fix every error until there is none. Read the warnings (`unknown-person`, `extra-link`, `length`) and fix them too, unless clearly harmless. Never edit `world.json`, the briefs, or any file outside the notes of your batch.
