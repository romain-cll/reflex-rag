# Writing brief batch-07

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Carmen Iverson: Product Manager, Product team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Ines Fitzgerald: Procurement Specialist, Operations team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Naomi Boyle: Quality Engineer, Operations team

## Notes

### `Meetings/2025-06-20 Dune kickoff.md`

- Type: meeting
- Date: 2025-06-20
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-06-20
project: Dune
attendees:
  - Carmen Iverson
  - Rosa Novak
  - Zoe Adeyemi
  - Hector Haddad
  - Ines Fitzgerald
```

Situation: Kickoff meeting of Dune: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Dune is the project to build a ceiling-mounted sensor for retrofit projects, sold as the Larkspur Halo Gen 2. Anchors: "ceiling-mounted sensor", "Larkspur Halo Gen 2".
- Carmen Iverson is the product owner of Dune. Anchors: "Carmen Iverson".
- Dune is scheduled to launch on May 4, 2026. Anchors: "May 4, 2026".

Links, each inside a real sentence of the note:

- [[Carmen Iverson]]: Carmen Iverson owns the project

### `Specs/Dune requirements.md`

- Type: spec
- Date: 2025-06-30
- Author: Carmen Iverson (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-06-30
project: Dune
owner: Carmen Iverson
status: approved
```

Situation: Requirements document of Dune, with sections for power, cost and enclosure. A short "Decisions" section at the end was added later, after the enclosure vendor was settled.

Facts to state, keeping every anchor word for word:

- The Dune requirements call for a battery life of 12 months. Anchors: "12 months".
- The target unit cost for Dune is $37. Anchors: "$37".

Links, each inside a real sentence of the note:

- [[2025-06-20 Dune kickoff]]: the requirements build on what the kickoff agreed
- [[2025-09-03 Dune tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Dune requirements (copy).md`

- Type: spec
- Date: 2025-07-02
- Author: Rosa Novak (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-07-02
project: Dune
owner: Carmen Iverson
status: draft
```

Situation: An old working copy of the Dune requirements that was never deleted. Same structure as the main requirements, but it asks for 18 months of battery life.

Facts to state, keeping every anchor word for word:

- The Dune requirements call for a battery life of 18 months. Anchors: "18 months".

Links, each inside a real sentence of the note:

- [[2025-06-20 Dune kickoff]]: written right after the kickoff

### `Quotes/Dune enclosure - Pacifica Plastics.md`

- Type: quote
- Date: 2025-07-15
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-07-15
project: Dune
supplier: Pacifica Plastics
```

Situation: Summary of the quote Pacifica Plastics sent for the Dune enclosure.

Facts to state, keeping every anchor word for word:

- Pacifica Plastics quoted $60,700 for the Dune enclosure tooling. Anchors: "$60,700".
- Pacifica Plastics needs 8 weeks to deliver the Dune enclosure tooling. Anchors: "8 weeks".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the enclosure section of the requirements
- [[Pacifica Plastics]]: supplier details

### `Quotes/Dune enclosure - Cobalt Molding.md`

- Type: quote
- Date: 2025-07-18
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-07-18
project: Dune
supplier: Cobalt Molding
```

Situation: Summary of the quote Cobalt Molding sent for the Dune enclosure.

Facts to state, keeping every anchor word for word:

- Cobalt Molding quoted $68,900 for the Dune enclosure tooling. Anchors: "$68,900".
- Cobalt Molding needs 9 weeks to deliver the Dune enclosure tooling. Anchors: "9 weeks".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the enclosure section of the requirements
- [[Cobalt Molding]]: supplier details

### `Quotes/Dune battery pack - Lodestar Energy.md`

- Type: quote
- Date: 2025-07-20
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-07-20
project: Dune
supplier: Lodestar Energy
```

Situation: Summary of the quote Lodestar Energy sent for the Dune battery pack.

Facts to state, keeping every anchor word for word:

- Lodestar Energy quoted $8.96 per pack for the Dune battery pack. Anchors: "$8.96".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the battery pack section of the requirements
- [[Lodestar Energy]]: supplier details

### `Meetings/2025-07-30 Dune enclosure review.md`

- Type: meeting
- Date: 2025-07-30
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-07-30
project: Dune
attendees:
  - Rosa Novak
  - Carmen Iverson
  - Ines Fitzgerald
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Pacifica Plastics, mainly on price.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Pacifica Plastics for the Dune enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[Dune enclosure - Pacifica Plastics]]: the offer from Pacifica Plastics
- [[Dune enclosure - Cobalt Molding]]: the offer from Cobalt Molding
- [[Dune requirements]]: the enclosure requirements being checked

### `Projects/Dune.md`

- Type: project
- Date: 2025-08-04
- Author: Carmen Iverson (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Halo Gen 2
owner: Carmen Iverson
status: active
updated: 2025-08-04
```

Situation: Project page of Dune, last edited on 2025-08-04 and never updated since: it still shows Pacifica Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Dune is scheduled to launch on May 4, 2026. Anchors: "May 4, 2026".
- The team chose to move forward with Pacifica Plastics for the Dune enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[2025-06-20 Dune kickoff]]: how the project started
- [[Dune requirements]]: the requirements
- [[2025-07-30 Dune enclosure review]]: where the enclosure vendor was discussed

### `Journal/Zoe Adeyemi/2025-08-09 Zoe Adeyemi journal.md`

- Type: journal
- Date: 2025-08-09
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-08-09
author: Zoe Adeyemi
project: Dune
```

Situation: Personal note: heard in the hallway that Dune is going with Pacifica Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Pacifica Plastics for the Dune enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[2025-07-30 Dune enclosure review]]: what came out of the enclosure review

### `Meetings/2025-08-19 Dune design review.md`

- Type: meeting
- Date: 2025-08-19
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-08-19
project: Dune
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Carmen Iverson
```

Situation: Design review of Dune. One open question is debated at length and left open.

Facts to state, keeping every anchor word for word:

- The team discussed offering the wall-mount bracket in white for Dune but made no decision. Anchors: "wall-mount bracket".

Links, each inside a real sentence of the note:

- [[Dune]]: open questions are tracked on the project page

### `Journal/Ruth Holloway/2025-08-21 Ruth Holloway journal.md`

- Type: journal
- Date: 2025-08-21
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-08-21
author: Ruth Holloway
project: Dune
```

Situation: Personal note: frustrated that the team still has not settled offering the wall-mount bracket in white for Dune.

Facts to state, keeping every anchor word for word:

- The team discussed offering the wall-mount bracket in white for Dune but made no decision. Anchors: "wall-mount bracket".

Links, each inside a real sentence of the note:

- [[2025-08-19 Dune design review]]: the question came up in the design review

### `Meetings/2025-09-03 Dune tooling sign-off.md`

- Type: meeting
- Date: 2025-09-03
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-03
project: Dune
attendees:
  - Rosa Novak
  - Carmen Iverson
  - Ines Fitzgerald
  - Naomi Boyle
```

Situation: Vendor validation after the drop tests: the team gives Cobalt Molding the tooling go-ahead for the Dune enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Cobalt Molding received the tooling go-ahead for the Dune enclosure after the drop tests. Anchors: "Cobalt Molding".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: this settles the enclosure section of the requirements
- [[Cobalt Molding]]: Cobalt Molding is now the validated vendor

Never use these words: quote, quotes, quoted, quotation, bid, bids.

### `Meetings/2025-09-23 Dune EVT review.md`

- Type: meeting
- Date: 2025-09-23
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-23
project: Dune
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Naomi Boyle
```

Situation: Review of the first engineering validation build of Dune.

Facts to state, keeping every anchor word for word:

- The Dune EVT build produced 35 units. Anchors: "35 units".

Links, each inside a real sentence of the note:

- [[2025-09-03 Dune tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Rosa Novak/2025-09-25 Rosa Novak journal.md`

- Type: journal
- Date: 2025-09-25
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-09-25
author: Rosa Novak
project: Dune
```

Situation: Personal note after the Dune EVT build, counting the units on the bench.

Facts to state, keeping every anchor word for word:

- The Dune EVT build produced 40 units. Anchors: "40 units".

Links, each inside a real sentence of the note:

- [[2025-09-23 Dune EVT review]]: notes from the EVT review

### `Meetings/2025-11-07 Dune pilot kickoff with Riverside Regional Hospital.md`

- Type: meeting
- Date: 2025-11-07
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-07
project: Dune
attendees:
  - Carmen Iverson
  - Naomi Boyle
```

Situation: Kickoff of the Dune pilot at Riverside Regional Hospital: scope and number of units.

Facts to state, keeping every anchor word for word:

- Riverside Regional Hospital is piloting Dune with 90 units. Anchors: "Riverside Regional Hospital", "90 units".

Links, each inside a real sentence of the note:

- [[Riverside Regional Hospital]]: who the customer is
- [[Dune]]: the project page

### `Meetings/2025-11-17 Dune DVT review.md`

- Type: meeting
- Date: 2025-11-17
- Author: Naomi Boyle (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-17
project: Dune
attendees:
  - Naomi Boyle
  - Zoe Adeyemi
  - Rosa Novak
  - Carmen Iverson
```

Situation: Design validation review of Dune: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Dune DVT units showed Wi-Fi dropouts near metal ceiling grids. Anchors: "Wi-Fi dropouts".

Links, each inside a real sentence of the note:

- [[2025-11-07 Dune pilot kickoff with Riverside Regional Hospital]]: DVT units also went to the pilot

### `Meetings/2025-12-12 Dune schedule review.md`

- Type: meeting
- Date: 2025-12-12
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-12-12
project: Dune
attendees:
  - Carmen Iverson
  - Naomi Boyle
  - Emeka Nordin
```

Situation: Schedule review of Dune: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Dune will now launch on August 2, 2026. Anchors: "August 2, 2026".
- The Dune launch slipped because of a certification retest at Redstone Compliance Labs. Anchors: "Redstone Compliance Labs".

Links, each inside a real sentence of the note:

- [[Redstone Compliance Labs]]: the lab running the retest
- [[Dune]]: the project page

### `Decisions/Dune launch date change.md`

- Type: decision
- Date: 2025-12-14
- Author: Carmen Iverson (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2025-12-14
project: Dune
decided_by: Carmen Iverson
```

Situation: Decision record of the new Dune launch date.

Facts to state, keeping every anchor word for word:

- Dune will now launch on August 2, 2026. Anchors: "August 2, 2026".

Links, each inside a real sentence of the note:

- [[2025-12-12 Dune schedule review]]: the reasons are in the schedule review
