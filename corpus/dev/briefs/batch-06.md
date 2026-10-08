# Writing brief batch-06

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Diego Bishop: Product Manager, Product team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Ines Fitzgerald: Procurement Specialist, Operations team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Naomi Boyle: Quality Engineer, Operations team

## Notes

### `Meetings/2025-03-21 Cirrus kickoff.md`

- Type: meeting
- Date: 2025-03-21
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-03-21
project: Cirrus
attendees:
  - Diego Bishop
  - Tessa Okafor
  - Ruth Holloway
  - Rafael Nakamura
  - Ines Fitzgerald
```

Situation: Kickoff meeting of Cirrus: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Cirrus is the project to build a sensor kit for school gyms and auditoriums, sold as the Larkspur Vista Gen 2. Anchors: "sensor kit", "Larkspur Vista Gen 2".
- Diego Bishop is the product owner of Cirrus. Anchors: "Diego Bishop".
- Cirrus is scheduled to launch on January 16, 2026. Anchors: "January 16, 2026".

Links, each inside a real sentence of the note:

- [[Diego Bishop]]: Diego Bishop owns the project

### `Specs/Cirrus requirements.md`

- Type: spec
- Date: 2025-03-31
- Author: Diego Bishop (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-03-31
project: Cirrus
owner: Diego Bishop
status: approved
```

Situation: Requirements document of Cirrus, with sections for power, cost and enclosure. A short "Decisions" section at the end was added later, after the enclosure vendor was settled.

Facts to state, keeping every anchor word for word:

- The Cirrus requirements call for a battery life of 24 months. Anchors: "24 months".
- The target unit cost for Cirrus is $71. Anchors: "$71".

Links, each inside a real sentence of the note:

- [[2025-03-21 Cirrus kickoff]]: the requirements build on what the kickoff agreed
- [[2025-06-04 Cirrus tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Cirrus requirements (copy).md`

- Type: spec
- Date: 2025-04-02
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-04-02
project: Cirrus
owner: Diego Bishop
status: draft
```

Situation: An old working copy of the Cirrus requirements that was never deleted. Same structure as the main requirements, but it asks for 30 months of battery life.

Facts to state, keeping every anchor word for word:

- The Cirrus requirements call for a battery life of 30 months. Anchors: "30 months".

Links, each inside a real sentence of the note:

- [[2025-03-21 Cirrus kickoff]]: written right after the kickoff

### `Quotes/Cirrus enclosure - Juno Plastics.md`

- Type: quote
- Date: 2025-04-15
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-15
project: Cirrus
supplier: Juno Plastics
```

Situation: Summary of the quote Juno Plastics sent for the Cirrus enclosure.

Facts to state, keeping every anchor word for word:

- Juno Plastics quoted $36,400 for the Cirrus enclosure tooling. Anchors: "$36,400".
- Juno Plastics needs 13 weeks to deliver the Cirrus enclosure tooling. Anchors: "13 weeks".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the enclosure section of the requirements
- [[Juno Plastics]]: supplier details

### `Quotes/Cirrus enclosure - Cobalt Molding.md`

- Type: quote
- Date: 2025-04-18
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-18
project: Cirrus
supplier: Cobalt Molding
```

Situation: Summary of the quote Cobalt Molding sent for the Cirrus enclosure.

Facts to state, keeping every anchor word for word:

- Cobalt Molding quoted $48,100 for the Cirrus enclosure tooling. Anchors: "$48,100".
- Cobalt Molding needs 12 weeks to deliver the Cirrus enclosure tooling. Anchors: "12 weeks".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the enclosure section of the requirements
- [[Cobalt Molding]]: supplier details

### `Quotes/Cirrus sensor module - Paragon Photonics.md`

- Type: quote
- Date: 2025-04-20
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-20
project: Cirrus
supplier: Paragon Photonics
```

Situation: Summary of the quote Paragon Photonics sent for the Cirrus sensor module.

Facts to state, keeping every anchor word for word:

- Paragon Photonics quoted $9.66 per module for the Cirrus sensor module. Anchors: "$9.66".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the sensor module section of the requirements
- [[Paragon Photonics]]: supplier details

### `Meetings/2025-04-30 Cirrus enclosure review.md`

- Type: meeting
- Date: 2025-04-30
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-04-30
project: Cirrus
attendees:
  - Tessa Okafor
  - Diego Bishop
  - Ines Fitzgerald
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Juno Plastics, mainly on price.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Juno Plastics for the Cirrus enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[Cirrus enclosure - Juno Plastics]]: the offer from Juno Plastics
- [[Cirrus enclosure - Cobalt Molding]]: the offer from Cobalt Molding
- [[Cirrus requirements]]: the enclosure requirements being checked

### `Projects/Cirrus.md`

- Type: project
- Date: 2025-05-05
- Author: Diego Bishop (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Vista Gen 2
owner: Diego Bishop
status: active
updated: 2025-05-05
```

Situation: Project page of Cirrus, last edited on 2025-05-05 and never updated since: it still shows Juno Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Cirrus is scheduled to launch on January 16, 2026. Anchors: "January 16, 2026".
- The team chose to move forward with Juno Plastics for the Cirrus enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[2025-03-21 Cirrus kickoff]]: how the project started
- [[Cirrus requirements]]: the requirements
- [[2025-04-30 Cirrus enclosure review]]: where the enclosure vendor was discussed

### `Journal/Ruth Holloway/2025-05-10 Ruth Holloway journal.md`

- Type: journal
- Date: 2025-05-10
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-05-10
author: Ruth Holloway
project: Cirrus
```

Situation: Personal note: heard in the hallway that Cirrus is going with Juno Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Juno Plastics for the Cirrus enclosure. Anchors: "Juno Plastics".

Links, each inside a real sentence of the note:

- [[2025-04-30 Cirrus enclosure review]]: what came out of the enclosure review

### `Meetings/2025-05-20 Cirrus design review.md`

- Type: meeting
- Date: 2025-05-20
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-05-20
project: Cirrus
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Diego Bishop
```

Situation: Design review of Cirrus. One open question is debated at length and left open.

Facts to state, keeping every anchor word for word:

- The team discussed adding an e-ink display for Cirrus but made no decision. Anchors: "e-ink".

Links, each inside a real sentence of the note:

- [[Cirrus]]: open questions are tracked on the project page

### `Journal/Rosa Novak/2025-05-22 Rosa Novak journal.md`

- Type: journal
- Date: 2025-05-22
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-05-22
author: Rosa Novak
project: Cirrus
```

Situation: Personal note: frustrated that the team still has not settled adding an e-ink display for Cirrus.

Facts to state, keeping every anchor word for word:

- The team discussed adding an e-ink display for Cirrus but made no decision. Anchors: "e-ink".

Links, each inside a real sentence of the note:

- [[2025-05-20 Cirrus design review]]: the question came up in the design review

### `Meetings/2025-06-04 Cirrus tooling sign-off.md`

- Type: meeting
- Date: 2025-06-04
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-06-04
project: Cirrus
attendees:
  - Tessa Okafor
  - Diego Bishop
  - Ines Fitzgerald
  - Naomi Boyle
```

Situation: Vendor validation after the drop tests: the team gives Cobalt Molding the tooling go-ahead for the Cirrus enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Cobalt Molding received the tooling go-ahead for the Cirrus enclosure after the drop tests. Anchors: "Cobalt Molding".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: this settles the enclosure section of the requirements
- [[Cobalt Molding]]: Cobalt Molding is now the validated vendor

Never use these words: quote, quotes, quoted, quotation, bid, bids.

### `Meetings/2025-06-24 Cirrus EVT review.md`

- Type: meeting
- Date: 2025-06-24
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-06-24
project: Cirrus
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Naomi Boyle
```

Situation: Review of the first engineering validation build of Cirrus.

Facts to state, keeping every anchor word for word:

- The Cirrus EVT build produced 20 units. Anchors: "20 units".

Links, each inside a real sentence of the note:

- [[2025-06-04 Cirrus tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Tessa Okafor/2025-06-26 Tessa Okafor journal.md`

- Type: journal
- Date: 2025-06-26
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-06-26
author: Tessa Okafor
project: Cirrus
```

Situation: Personal note after the Cirrus EVT build, counting the units on the bench.

Facts to state, keeping every anchor word for word:

- The Cirrus EVT build produced 25 units. Anchors: "25 units".

Links, each inside a real sentence of the note:

- [[2025-06-24 Cirrus EVT review]]: notes from the EVT review

### `Meetings/2025-08-08 Cirrus pilot kickoff with Thornbury Unified Schools.md`

- Type: meeting
- Date: 2025-08-08
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-08-08
project: Cirrus
attendees:
  - Diego Bishop
  - Naomi Boyle
```

Situation: Kickoff of the Cirrus pilot at Thornbury Unified Schools: scope and number of units.

Facts to state, keeping every anchor word for word:

- Thornbury Unified Schools is piloting Cirrus with 90 units. Anchors: "Thornbury Unified Schools", "90 units".

Links, each inside a real sentence of the note:

- [[Thornbury Unified Schools]]: who the customer is
- [[Cirrus]]: the project page

### `Meetings/2025-08-18 Cirrus DVT review.md`

- Type: meeting
- Date: 2025-08-18
- Author: Naomi Boyle (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-08-18
project: Cirrus
attendees:
  - Naomi Boyle
  - Ruth Holloway
  - Tessa Okafor
  - Diego Bishop
```

Situation: Design validation review of Cirrus: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Cirrus DVT units showed a cracked battery door after the drop test. Anchors: "battery door".

Links, each inside a real sentence of the note:

- [[2025-08-08 Cirrus pilot kickoff with Thornbury Unified Schools]]: DVT units also went to the pilot

### `Meetings/2025-09-12 Cirrus schedule review.md`

- Type: meeting
- Date: 2025-09-12
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-12
project: Cirrus
attendees:
  - Diego Bishop
  - Naomi Boyle
  - Emeka Nordin
```

Situation: Schedule review of Cirrus: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Cirrus will now launch on April 8, 2026. Anchors: "April 8, 2026".
- The Cirrus launch slipped because of a certification retest at Redstone Compliance Labs. Anchors: "Redstone Compliance Labs".

Links, each inside a real sentence of the note:

- [[Redstone Compliance Labs]]: the lab running the retest
- [[Cirrus]]: the project page

### `Decisions/Cirrus launch date change.md`

- Type: decision
- Date: 2025-09-14
- Author: Diego Bishop (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2025-09-14
project: Cirrus
decided_by: Diego Bishop
```

Situation: Decision record of the new Cirrus launch date.

Facts to state, keeping every anchor word for word:

- Cirrus will now launch on April 8, 2026. Anchors: "April 8, 2026".

Links, each inside a real sentence of the note:

- [[2025-09-12 Cirrus schedule review]]: the reasons are in the schedule review
