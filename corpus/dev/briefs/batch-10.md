# Writing brief batch-10

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Carmen Iverson: Product Manager, Product team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Ines Fitzgerald: Procurement Specialist, Operations team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Naomi Boyle: Quality Engineer, Operations team

## Notes

### `Meetings/2026-01-23 Granite kickoff.md`

- Type: meeting
- Date: 2026-01-23
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-01-23
project: Granite
attendees:
  - Carmen Iverson
  - Tessa Okafor
  - Ruth Holloway
  - Rafael Nakamura
  - Ines Fitzgerald
```

Situation: Kickoff meeting of Granite: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Granite is the project to build a ceiling-mounted sensor for retrofit projects, sold as the Larkspur Pulse Gen 2. Anchors: "ceiling-mounted sensor", "Larkspur Pulse Gen 2".
- Carmen Iverson is the product owner of Granite. Anchors: "Carmen Iverson".
- Granite is scheduled to launch on December 3, 2026. Anchors: "December 3, 2026".

Links, each inside a real sentence of the note:

- [[Carmen Iverson]]: Carmen Iverson owns the project

### `Specs/Granite requirements.md`

- Type: spec
- Date: 2026-02-02
- Author: Carmen Iverson (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2026-02-02
project: Granite
owner: Carmen Iverson
status: approved
```

Situation: Requirements document of Granite, with sections for power, cost and enclosure. A short "Decisions" section at the end was added later, after the enclosure vendor was settled.

Facts to state, keeping every anchor word for word:

- The Granite requirements call for a battery life of 24 months. Anchors: "24 months".
- The target unit cost for Granite is $72. Anchors: "$72".

Links, each inside a real sentence of the note:

- [[2026-01-23 Granite kickoff]]: the requirements build on what the kickoff agreed
- [[2026-04-08 Granite tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Granite requirements (copy).md`

- Type: spec
- Date: 2026-02-04
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2026-02-04
project: Granite
owner: Carmen Iverson
status: draft
```

Situation: An old working copy of the Granite requirements that was never deleted. Same structure as the main requirements, but it asks for 30 months of battery life.

Facts to state, keeping every anchor word for word:

- The Granite requirements call for a battery life of 30 months. Anchors: "30 months".

Links, each inside a real sentence of the note:

- [[2026-01-23 Granite kickoff]]: written right after the kickoff

### `Quotes/Granite enclosure - Juno Plastics.md`

- Type: quote
- Date: 2026-02-17
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2026-02-17
project: Granite
supplier: Juno Plastics
```

Situation: Summary of the quote Juno Plastics sent for the Granite enclosure.

Facts to state, keeping every anchor word for word:

- Juno Plastics quoted $57,400 for the Granite enclosure tooling. Anchors: "$57,400".
- Juno Plastics needs 7 weeks to deliver the Granite enclosure tooling. Anchors: "7 weeks".

Links, each inside a real sentence of the note:

- [[Granite requirements]]: answers the enclosure section of the requirements
- [[Juno Plastics]]: supplier details

### `Quotes/Granite enclosure - Pacifica Plastics.md`

- Type: quote
- Date: 2026-02-20
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2026-02-20
project: Granite
supplier: Pacifica Plastics
```

Situation: Summary of the quote Pacifica Plastics sent for the Granite enclosure.

Facts to state, keeping every anchor word for word:

- Pacifica Plastics quoted $36,700 for the Granite enclosure tooling. Anchors: "$36,700".
- Pacifica Plastics needs 9 weeks to deliver the Granite enclosure tooling. Anchors: "9 weeks".

Links, each inside a real sentence of the note:

- [[Granite requirements]]: answers the enclosure section of the requirements
- [[Pacifica Plastics]]: supplier details

### `Quotes/Granite battery pack - Lodestar Energy.md`

- Type: quote
- Date: 2026-02-22
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2026-02-22
project: Granite
supplier: Lodestar Energy
```

Situation: Summary of the quote Lodestar Energy sent for the Granite battery pack.

Facts to state, keeping every anchor word for word:

- Lodestar Energy quoted $5.58 per pack for the Granite battery pack. Anchors: "$5.58".

Links, each inside a real sentence of the note:

- [[Granite requirements]]: answers the battery pack section of the requirements
- [[Lodestar Energy]]: supplier details

### `Meetings/2026-03-04 Granite enclosure review.md`

- Type: meeting
- Date: 2026-03-04
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-03-04
project: Granite
attendees:
  - Tessa Okafor
  - Carmen Iverson
  - Ines Fitzgerald
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Juno Plastics, mainly on price.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Juno Plastics for the Granite enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[Granite enclosure - Juno Plastics]]: the offer from Juno Plastics
- [[Granite enclosure - Pacifica Plastics]]: the offer from Pacifica Plastics
- [[Granite requirements]]: the enclosure requirements being checked

### `Projects/Granite.md`

- Type: project
- Date: 2026-03-09
- Author: Carmen Iverson (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Pulse Gen 2
owner: Carmen Iverson
status: active
updated: 2026-03-09
```

Situation: Project page of Granite, last edited on 2026-03-09 and never updated since: it still shows Juno Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Granite is scheduled to launch on December 3, 2026. Anchors: "December 3, 2026".
- The team chose to move forward with Juno Plastics for the Granite enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[2026-01-23 Granite kickoff]]: how the project started
- [[Granite requirements]]: the requirements
- [[2026-03-04 Granite enclosure review]]: where the enclosure vendor was discussed

### `Journal/Ruth Holloway/2026-03-14 Ruth Holloway journal.md`

- Type: journal
- Date: 2026-03-14
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2026-03-14
author: Ruth Holloway
project: Granite
```

Situation: Personal note: heard in the hallway that Granite is going with Juno Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Juno Plastics for the Granite enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[2026-03-04 Granite enclosure review]]: what came out of the enclosure review

### `Meetings/2026-03-24 Granite design review.md`

- Type: meeting
- Date: 2026-03-24
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-03-24
project: Granite
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Carmen Iverson
```

Situation: Design review of Granite. One open question is debated at length and left open.

Facts to state, keeping every anchor word for word:

- The team discussed adding a cellular backhaul option for Granite but made no decision. Anchors: "cellular backhaul".

Links, each inside a real sentence of the note:

- [[Granite]]: open questions are tracked on the project page

### `Journal/Rosa Novak/2026-03-26 Rosa Novak journal.md`

- Type: journal
- Date: 2026-03-26
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2026-03-26
author: Rosa Novak
project: Granite
```

Situation: Personal note: frustrated that the team still has not settled adding a cellular backhaul option for Granite.

Facts to state, keeping every anchor word for word:

- The team discussed adding a cellular backhaul option for Granite but made no decision. Anchors: "cellular backhaul".

Links, each inside a real sentence of the note:

- [[2026-03-24 Granite design review]]: the question came up in the design review

### `Meetings/2026-04-08 Granite tooling sign-off.md`

- Type: meeting
- Date: 2026-04-08
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-04-08
project: Granite
attendees:
  - Tessa Okafor
  - Carmen Iverson
  - Ines Fitzgerald
  - Naomi Boyle
```

Situation: Vendor validation after the drop tests: the team gives Pacifica Plastics the tooling go-ahead for the Granite enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Pacifica Plastics received the tooling go-ahead for the Granite enclosure after the drop tests. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[Granite requirements]]: this settles the enclosure section of the requirements
- [[Pacifica Plastics]]: Pacifica Plastics is now the validated vendor

Never use these words: quote, quotes, quoted, quotation, bid, bids.

### `Meetings/2026-04-28 Granite EVT review.md`

- Type: meeting
- Date: 2026-04-28
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-04-28
project: Granite
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Naomi Boyle
```

Situation: Review of the first engineering validation build of Granite.

Facts to state, keeping every anchor word for word:

- The Granite EVT build produced 20 units. Anchors: "20 units".

Links, each inside a real sentence of the note:

- [[2026-04-08 Granite tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Tessa Okafor/2026-04-30 Tessa Okafor journal.md`

- Type: journal
- Date: 2026-04-30
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2026-04-30
author: Tessa Okafor
project: Granite
```

Situation: Personal note after the Granite EVT build, counting the units on the bench.

Facts to state, keeping every anchor word for word:

- The Granite EVT build produced 25 units. Anchors: "25 units".

Links, each inside a real sentence of the note:

- [[2026-04-28 Granite EVT review]]: notes from the EVT review

### `Meetings/2026-06-12 Granite pilot kickoff with Rosewood Property Group.md`

- Type: meeting
- Date: 2026-06-12
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-06-12
project: Granite
attendees:
  - Carmen Iverson
  - Naomi Boyle
```

Situation: Kickoff of the Granite pilot at Rosewood Property Group: scope and number of units.

Facts to state, keeping every anchor word for word:

- Rosewood Property Group is piloting Granite with 40 units. Anchors: "Rosewood Property Group", "40 units".

Links, each inside a real sentence of the note:

- [[Rosewood Property Group]]: who the customer is
- [[Granite]]: the project page

### `Meetings/2026-06-22 Granite DVT review.md`

- Type: meeting
- Date: 2026-06-22
- Author: Naomi Boyle (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-06-22
project: Granite
attendees:
  - Naomi Boyle
  - Ruth Holloway
  - Tessa Okafor
  - Carmen Iverson
```

Situation: Design validation review of Granite: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Granite DVT units showed firmware resets when the gateway reboots. Anchors: "firmware resets".

Links, each inside a real sentence of the note:

- [[2026-06-12 Granite pilot kickoff with Rosewood Property Group]]: DVT units also went to the pilot

### `Meetings/2026-07-17 Granite schedule review.md`

- Type: meeting
- Date: 2026-07-17
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-07-17
project: Granite
attendees:
  - Carmen Iverson
  - Naomi Boyle
  - Emeka Nordin
```

Situation: Schedule review of Granite: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Granite will now launch on February 24, 2027. Anchors: "February 24, 2027".
- The Granite launch slipped because of a certification retest at Redstone Compliance Labs. Anchors: "Redstone Compliance Labs".

Links, each inside a real sentence of the note:

- [[Redstone Compliance Labs]]: the lab running the retest
- [[Granite]]: the project page

### `Decisions/Granite launch date change.md`

- Type: decision
- Date: 2026-07-19
- Author: Carmen Iverson (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2026-07-19
project: Granite
decided_by: Carmen Iverson
```

Situation: Decision record of the new Granite launch date.

Facts to state, keeping every anchor word for word:

- Granite will now launch on February 24, 2027. Anchors: "February 24, 2027".

Links, each inside a real sentence of the note:

- [[2026-07-17 Granite schedule review]]: the reasons are in the schedule review
