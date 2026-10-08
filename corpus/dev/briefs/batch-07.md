# Writing brief batch-07

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Diego Bishop: Product Manager, Product team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Omar Hart: Procurement Specialist, Operations team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Claire Gallagher: Quality Engineer, Operations team

## Notes

### `Meetings/2025-03-15 Cirrus kickoff.md`

- Type: meeting
- Date: 2025-03-15
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-03-15
project: Cirrus
attendees:
  - Diego Bishop
  - Tessa Okafor
  - Ruth Holloway
  - Rafael Nakamura
  - Omar Hart
```

Situation: Kickoff meeting of Cirrus: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Cirrus is the project to build a hospital-grade radon monitor for meeting rooms, sold as the Larkspur Vista Gen 2. Anchors: "radon monitor for meeting rooms", "Larkspur Vista Gen 2".
- Diego Bishop is the product owner of Cirrus. Anchors: "Diego Bishop".
- Cirrus is scheduled to launch on March 31, 2027. Anchors: "March 31, 2027".

Links, each inside a real sentence of the note:

- [[Diego Bishop]]: Diego Bishop owns the project

### `Specs/Cirrus requirements.md`

- Type: spec
- Date: 2025-03-25
- Author: Diego Bishop (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-03-25
project: Cirrus
owner: Diego Bishop
status: approved
```

Situation: Requirements document of Cirrus, with sections for power, cost, the enclosure and the sensor module. A short "Decisions" section at the end was added later, after the enclosure vendor was settled; it does not name the vendor.

Facts to state, keeping every anchor word for word:

- The Cirrus requirements call for a battery life of 16 months. Anchors: "16 months".
- The target unit cost for Cirrus is $90. Anchors: "$90".

Links, each inside a real sentence of the note:

- [[2025-03-15 Cirrus kickoff]]: the requirements build on what the kickoff agreed
- [[2025-05-29 Cirrus tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Cirrus requirements (copy).md`

- Type: spec
- Date: 2025-03-25
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-03-25
project: Cirrus
owner: Diego Bishop
status: approved
```

Situation: A duplicate of the Cirrus requirements made the same day and edited separately. It looks just as official, with the same sections, but asks for 23 months of battery life.

Facts to state, keeping every anchor word for word:

- The Cirrus requirements call for a battery life of 23 months. Anchors: "23 months".

Links, each inside a real sentence of the note:

- [[2025-03-15 Cirrus kickoff]]: written right after the kickoff

### `Quotes/Cirrus enclosure - Wexford Molding.md`

- Type: quote
- Date: 2025-04-09
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-09
project: Cirrus
supplier: Wexford Molding
```

Situation: Summary of the quote Wexford Molding sent for the Cirrus enclosure.

Facts to state, keeping every anchor word for word:

- Wexford Molding quoted $42,700 for the Cirrus enclosure tooling. Anchors: "$42,700".
- Wexford Molding needs 8 weeks to deliver the Cirrus enclosure tooling. Anchors: "8 weeks".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the enclosure section of the requirements
- [[Wexford Molding]]: supplier details

### `Quotes/Cirrus enclosure - Lattice Molding.md`

- Type: quote
- Date: 2025-04-12
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-12
project: Cirrus
supplier: Lattice Molding
```

Situation: Summary of the quote Lattice Molding sent for the Cirrus enclosure.

Facts to state, keeping every anchor word for word:

- Lattice Molding quoted $63,400 for the Cirrus enclosure tooling. Anchors: "$63,400".
- Lattice Molding needs 9 weeks to deliver the Cirrus enclosure tooling. Anchors: "9 weeks".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the enclosure section of the requirements
- [[Lattice Molding]]: supplier details

### `Quotes/Cirrus sensor module - Tamarack Sensing.md`

- Type: quote
- Date: 2025-04-14
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-04-14
project: Cirrus
supplier: Tamarack Sensing
```

Situation: Summary of the quote Tamarack Sensing sent for the Cirrus sensor module.

Facts to state, keeping every anchor word for word:

- Tamarack Sensing quoted $5.70 per module for the Cirrus sensor module. Anchors: "$5.70".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: answers the sensor module section of the requirements
- [[Tamarack Sensing]]: supplier details

### `Meetings/2025-04-24 Cirrus enclosure review.md`

- Type: meeting
- Date: 2025-04-24
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-04-24
project: Cirrus
attendees:
  - Tessa Okafor
  - Diego Bishop
  - Omar Hart
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Wexford Molding, mainly because its tooling is cheaper.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Wexford Molding for the Cirrus enclosure. Anchors: "Wexford Molding".

Links, each inside a real sentence of the note:

- [[Cirrus enclosure - Wexford Molding]]: the offer from Wexford Molding
- [[Cirrus enclosure - Lattice Molding]]: the offer from Lattice Molding
- [[Cirrus requirements]]: the enclosure requirements being checked

### `Projects/Cirrus.md`

- Type: project
- Date: 2025-04-29
- Author: Diego Bishop (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Vista Gen 2
owner: Diego Bishop
status: active
updated: 2025-04-29
```

Situation: Project page of Cirrus, last edited on 2025-04-29 and never updated since: it still shows Wexford Molding as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Cirrus is scheduled to launch on March 31, 2027. Anchors: "March 31, 2027".
- The team chose to move forward with Wexford Molding for the Cirrus enclosure. Anchors: "Wexford Molding".

Links, each inside a real sentence of the note:

- [[2025-03-15 Cirrus kickoff]]: how the project started
- [[Cirrus requirements]]: the requirements
- [[2025-04-24 Cirrus enclosure review]]: where the enclosure vendor was discussed

### `Journal/Rosa Novak/2025-05-04 Rosa Novak journal.md`

- Type: journal
- Date: 2025-05-04
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-05-04
author: Rosa Novak
project: Cirrus
```

Situation: Personal note from someone who was not at the enclosure review: heard in the hallway that Cirrus is going with Wexford Molding for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Wexford Molding for the Cirrus enclosure. Anchors: "Wexford Molding".

Links, each inside a real sentence of the note:

- [[2025-04-24 Cirrus enclosure review]]: what came out of the enclosure review

### `Meetings/2025-05-14 Cirrus design review.md`

- Type: meeting
- Date: 2025-05-14
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-05-14
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

### `Journal/Tessa Okafor/2025-05-16 Tessa Okafor journal.md`

- Type: journal
- Date: 2025-05-16
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-05-16
author: Tessa Okafor
project: Cirrus
```

Situation: Personal note: frustrated that the team still has not settled adding an e-ink display for Cirrus.

Facts to state, keeping every anchor word for word:

- The team discussed adding an e-ink display for Cirrus but made no decision. Anchors: "e-ink".

Links, each inside a real sentence of the note:

- [[2025-05-14 Cirrus design review]]: the question came up in the design review

### `Meetings/2025-05-29 Cirrus tooling sign-off.md`

- Type: meeting
- Date: 2025-05-29
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-05-29
project: Cirrus
attendees:
  - Tessa Okafor
  - Diego Bishop
  - Omar Hart
  - Claire Gallagher
```

Situation: Vendor validation after the drop tests: the team gives Lattice Molding the tooling go-ahead for the Cirrus enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Lattice Molding received the tooling go-ahead for the Cirrus enclosure after the drop tests. Anchors: "Lattice Molding".

Links, each inside a real sentence of the note:

- [[Cirrus requirements]]: this settles the enclosure section of the requirements
- [[Lattice Molding]]: Lattice Molding is now the validated vendor

Never use these words: quote, quotes, quoted, quoting, quotation, quotations, bid, bids, bidding, bidder, bidders.

### `Meetings/2025-08-07 Cirrus EVT review.md`

- Type: meeting
- Date: 2025-08-07
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-08-07
project: Cirrus
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Claire Gallagher
```

Situation: Review of the first engineering validation build of Cirrus, once the enclosure tooling was ready.

Facts to state, keeping every anchor word for word:

- The Cirrus EVT build produced 65 units. Anchors: "65 units".

Links, each inside a real sentence of the note:

- [[2025-05-29 Cirrus tooling sign-off]]: enclosures built as agreed at the sign-off

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
project: Cirrus
```

Situation: Personal note from someone who helped on the Cirrus EVT build but was not at the review: they counted the units themselves.

Facts to state, keeping every anchor word for word:

- The Cirrus EVT build produced 70 units. Anchors: "70 units".

Links, each inside a real sentence of the note:

- [[2025-08-07 Cirrus EVT review]]: the build the EVT review was about

### `Meetings/2025-09-21 Cirrus pilot kickoff.md`

- Type: meeting
- Date: 2025-09-21
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-21
project: Cirrus
customer: Foxborough Unified Schools
attendees:
  - Diego Bishop
  - Claire Gallagher
```

Situation: Kickoff of the Cirrus pilot at Foxborough Unified Schools: scope and number of units.

Facts to state, keeping every anchor word for word:

- Foxborough Unified Schools is piloting Cirrus with 110 units. Anchors: "Foxborough Unified Schools", "110 units".

Links, each inside a real sentence of the note:

- [[Foxborough Unified Schools]]: who the customer is
- [[Cirrus]]: the project page

### `Meetings/2025-10-01 Cirrus DVT review.md`

- Type: meeting
- Date: 2025-10-01
- Author: Claire Gallagher (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-01
project: Cirrus
attendees:
  - Claire Gallagher
  - Ruth Holloway
  - Tessa Okafor
  - Diego Bishop
```

Situation: Design validation review of Cirrus: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Cirrus DVT units showed a clock that drifts after a power cut. Anchors: "clock that drifts".

Links, each inside a real sentence of the note:

- [[2025-09-21 Cirrus pilot kickoff]]: DVT units also went to the pilot

### `Meetings/2025-10-26 Cirrus schedule review.md`

- Type: meeting
- Date: 2025-10-26
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-26
project: Cirrus
attendees:
  - Diego Bishop
  - Claire Gallagher
  - Emeka Nordin
```

Situation: Schedule review of Cirrus: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Cirrus will now launch on June 27, 2027. Anchors: "June 27, 2027".
- The Cirrus launch slipped because of a certification retest at Halcyon Compliance Labs. Anchors: "Halcyon Compliance Labs".

Links, each inside a real sentence of the note:

- [[Halcyon Compliance Labs]]: the lab running the retest
- [[Cirrus]]: the project page

### `Decisions/Cirrus launch date change.md`

- Type: decision
- Date: 2025-10-28
- Author: Diego Bishop (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2025-10-28
project: Cirrus
decided_by: Diego Bishop
```

Situation: Decision record of the new Cirrus launch date. The reasons are left to the schedule review.

Facts to state, keeping every anchor word for word:

- Cirrus will now launch on June 27, 2027. Anchors: "June 27, 2027".

Links, each inside a real sentence of the note:

- [[2025-10-26 Cirrus schedule review]]: the reasons are in the schedule review
