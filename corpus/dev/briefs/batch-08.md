# Writing brief batch-08

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Carmen Iverson: Product Manager, Product team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Omar Hart: Procurement Specialist, Operations team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Claire Gallagher: Quality Engineer, Operations team

## Notes

### `Meetings/2025-05-06 Dune kickoff.md`

- Type: meeting
- Date: 2025-05-06
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-05-06
project: Dune
attendees:
  - Carmen Iverson
  - Rosa Novak
  - Zoe Adeyemi
  - Hector Haddad
  - Omar Hart
```

Situation: Kickoff meeting of Dune: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Dune is the project to build a low-cost VOC monitor for school gyms, sold as the Larkspur Halo Gen 2. Anchors: "VOC monitor for school gyms", "Larkspur Halo Gen 2".
- Carmen Iverson is the product owner of Dune. Anchors: "Carmen Iverson".
- Dune is scheduled to launch on March 6, 2027. Anchors: "March 6, 2027".

Links, each inside a real sentence of the note:

- [[Carmen Iverson]]: Carmen Iverson owns the project

### `Specs/Dune requirements.md`

- Type: spec
- Date: 2025-05-16
- Author: Carmen Iverson (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-05-16
project: Dune
owner: Carmen Iverson
status: approved
```

Situation: Requirements document of Dune, with sections for power, cost, the enclosure and the battery pack. A short "Decisions" section at the end was added later, after the enclosure vendor was settled; it does not name the vendor.

Facts to state, keeping every anchor word for word:

- The Dune requirements call for a battery life of 40 months. Anchors: "40 months".
- The target unit cost for Dune is $95. Anchors: "$95".

Links, each inside a real sentence of the note:

- [[2025-05-06 Dune kickoff]]: the requirements build on what the kickoff agreed
- [[2025-07-20 Dune tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Dune requirements (copy).md`

- Type: spec
- Date: 2025-05-16
- Author: Rosa Novak (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-05-16
project: Dune
owner: Carmen Iverson
status: approved
```

Situation: A duplicate of the Dune requirements made the same day and edited separately. It looks just as official, with the same sections, but asks for 32 months of battery life.

Facts to state, keeping every anchor word for word:

- The Dune requirements call for a battery life of 32 months. Anchors: "32 months".

Links, each inside a real sentence of the note:

- [[2025-05-06 Dune kickoff]]: written right after the kickoff

### `Quotes/Dune enclosure - Lattice Molding.md`

- Type: quote
- Date: 2025-05-31
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-05-31
project: Dune
supplier: Lattice Molding
```

Situation: Summary of the quote Lattice Molding sent for the Dune enclosure.

Facts to state, keeping every anchor word for word:

- Lattice Molding quoted $39,400 for the Dune enclosure tooling. Anchors: "$39,400".
- Lattice Molding needs 6 weeks to deliver the Dune enclosure tooling. Anchors: "6 weeks".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the enclosure section of the requirements
- [[Lattice Molding]]: supplier details

### `Quotes/Dune enclosure - Redstone Plastics.md`

- Type: quote
- Date: 2025-06-03
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-06-03
project: Dune
supplier: Redstone Plastics
```

Situation: Summary of the quote Redstone Plastics sent for the Dune enclosure.

Facts to state, keeping every anchor word for word:

- Redstone Plastics quoted $54,100 for the Dune enclosure tooling. Anchors: "$54,100".
- Redstone Plastics needs 7 weeks to deliver the Dune enclosure tooling. Anchors: "7 weeks".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the enclosure section of the requirements
- [[Redstone Plastics]]: supplier details

### `Quotes/Dune battery pack - Everest Energy.md`

- Type: quote
- Date: 2025-06-05
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-06-05
project: Dune
supplier: Everest Energy
```

Situation: Summary of the quote Everest Energy sent for the Dune battery pack.

Facts to state, keeping every anchor word for word:

- Everest Energy quoted $5.74 per pack for the Dune battery pack. Anchors: "$5.74".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: answers the battery pack section of the requirements
- [[Everest Energy]]: supplier details

### `Meetings/2025-06-15 Dune enclosure review.md`

- Type: meeting
- Date: 2025-06-15
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-06-15
project: Dune
attendees:
  - Rosa Novak
  - Carmen Iverson
  - Omar Hart
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Lattice Molding, mainly because its tooling is cheaper.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Lattice Molding for the Dune enclosure. Anchors: "Lattice Molding".

Links, each inside a real sentence of the note:

- [[Dune enclosure - Lattice Molding]]: the offer from Lattice Molding
- [[Dune enclosure - Redstone Plastics]]: the offer from Redstone Plastics
- [[Dune requirements]]: the enclosure requirements being checked

### `Projects/Dune.md`

- Type: project
- Date: 2025-06-20
- Author: Carmen Iverson (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Halo Gen 2
owner: Carmen Iverson
status: active
updated: 2025-06-20
```

Situation: Project page of Dune, last edited on 2025-06-20 and never updated since: it still shows Lattice Molding as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Dune is scheduled to launch on March 6, 2027. Anchors: "March 6, 2027".
- The team chose to move forward with Lattice Molding for the Dune enclosure. Anchors: "Lattice Molding".

Links, each inside a real sentence of the note:

- [[2025-05-06 Dune kickoff]]: how the project started
- [[Dune requirements]]: the requirements
- [[2025-06-15 Dune enclosure review]]: where the enclosure vendor was discussed

### `Journal/Ruth Holloway/2025-06-25 Ruth Holloway journal.md`

- Type: journal
- Date: 2025-06-25
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-06-25
author: Ruth Holloway
project: Dune
```

Situation: Personal note from someone who was not at the enclosure review: heard in the hallway that Dune is going with Lattice Molding for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Lattice Molding for the Dune enclosure. Anchors: "Lattice Molding".

Links, each inside a real sentence of the note:

- [[2025-06-15 Dune enclosure review]]: what came out of the enclosure review

### `Meetings/2025-07-05 Dune design review.md`

- Type: meeting
- Date: 2025-07-05
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-07-05
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

### `Journal/Rosa Novak/2025-07-07 Rosa Novak journal.md`

- Type: journal
- Date: 2025-07-07
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-07-07
author: Rosa Novak
project: Dune
```

Situation: Personal note: frustrated that the team still has not settled offering the wall-mount bracket in white for Dune.

Facts to state, keeping every anchor word for word:

- The team discussed offering the wall-mount bracket in white for Dune but made no decision. Anchors: "wall-mount bracket".

Links, each inside a real sentence of the note:

- [[2025-07-05 Dune design review]]: the question came up in the design review

### `Meetings/2025-07-20 Dune tooling sign-off.md`

- Type: meeting
- Date: 2025-07-20
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-07-20
project: Dune
attendees:
  - Rosa Novak
  - Carmen Iverson
  - Omar Hart
  - Claire Gallagher
```

Situation: Vendor validation after the drop tests: the team gives Redstone Plastics the tooling go-ahead for the Dune enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Redstone Plastics received the tooling go-ahead for the Dune enclosure after the drop tests. Anchors: "Redstone Plastics".

Links, each inside a real sentence of the note:

- [[Dune requirements]]: this settles the enclosure section of the requirements
- [[Redstone Plastics]]: Redstone Plastics is now the validated vendor

Never use these words: quote, quotes, quoted, quoting, quotation, quotations, bid, bids, bidding, bidder, bidders.

### `Meetings/2025-09-14 Dune EVT review.md`

- Type: meeting
- Date: 2025-09-14
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-14
project: Dune
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Claire Gallagher
```

Situation: Review of the first engineering validation build of Dune, once the enclosure tooling was ready.

Facts to state, keeping every anchor word for word:

- The Dune EVT build produced 75 units. Anchors: "75 units".

Links, each inside a real sentence of the note:

- [[2025-07-20 Dune tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Tessa Okafor/2025-09-16 Tessa Okafor journal.md`

- Type: journal
- Date: 2025-09-16
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-09-16
author: Tessa Okafor
project: Dune
```

Situation: Personal note from someone who helped on the Dune EVT build but was not at the review: they counted the units themselves.

Facts to state, keeping every anchor word for word:

- The Dune EVT build produced 80 units. Anchors: "80 units".

Links, each inside a real sentence of the note:

- [[2025-09-14 Dune EVT review]]: the build the EVT review was about

### `Meetings/2025-10-29 Dune pilot kickoff.md`

- Type: meeting
- Date: 2025-10-29
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-29
project: Dune
customer: Pine Valley Medical Center
attendees:
  - Carmen Iverson
  - Claire Gallagher
```

Situation: Kickoff of the Dune pilot at Pine Valley Medical Center: scope and number of units.

Facts to state, keeping every anchor word for word:

- Pine Valley Medical Center is piloting Dune with 80 units. Anchors: "Pine Valley Medical Center", "80 units".

Links, each inside a real sentence of the note:

- [[Pine Valley Medical Center]]: who the customer is
- [[Dune]]: the project page

### `Meetings/2025-11-08 Dune DVT review.md`

- Type: meeting
- Date: 2025-11-08
- Author: Claire Gallagher (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-08
project: Dune
attendees:
  - Claire Gallagher
  - Zoe Adeyemi
  - Rosa Novak
  - Carmen Iverson
```

Situation: Design validation review of Dune: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Dune DVT units showed firmware resets when the gateway reboots. Anchors: "firmware resets".

Links, each inside a real sentence of the note:

- [[2025-10-29 Dune pilot kickoff]]: DVT units also went to the pilot

### `Meetings/2025-12-03 Dune schedule review.md`

- Type: meeting
- Date: 2025-12-03
- Author: Carmen Iverson (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-12-03
project: Dune
attendees:
  - Carmen Iverson
  - Claire Gallagher
  - Emeka Nordin
```

Situation: Schedule review of Dune: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Dune will now launch on May 24, 2027. Anchors: "May 24, 2027".
- The Dune launch slipped because of a certification retest at Cobalt Test Labs. Anchors: "Cobalt Test Labs".

Links, each inside a real sentence of the note:

- [[Cobalt Test Labs]]: the lab running the retest
- [[Dune]]: the project page

### `Decisions/Dune launch date change.md`

- Type: decision
- Date: 2025-12-05
- Author: Carmen Iverson (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2025-12-05
project: Dune
decided_by: Carmen Iverson
```

Situation: Decision record of the new Dune launch date. The reasons are left to the schedule review.

Facts to state, keeping every anchor word for word:

- Dune will now launch on May 24, 2027. Anchors: "May 24, 2027".

Links, each inside a real sentence of the note:

- [[2025-12-03 Dune schedule review]]: the reasons are in the schedule review
