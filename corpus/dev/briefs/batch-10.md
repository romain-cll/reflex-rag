# Writing brief batch-10

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Diego Bishop: Product Manager, Product team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Omar Hart: Procurement Specialist, Operations team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Claire Gallagher: Quality Engineer, Operations team

## Notes

### `Meetings/2025-09-07 Fjord kickoff.md`

- Type: meeting
- Date: 2025-09-07
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-07
project: Fjord
attendees:
  - Diego Bishop
  - Rosa Novak
  - Zoe Adeyemi
  - Hector Haddad
  - Omar Hart
```

Situation: Kickoff meeting of Fjord: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Fjord is the project to build a portable particulate sensor for hotel rooms, sold as the Larkspur Sentinel Gen 2. Anchors: "particulate sensor for hotel rooms", "Larkspur Sentinel Gen 2".
- Diego Bishop is the product owner of Fjord. Anchors: "Diego Bishop".
- Fjord is scheduled to launch on December 14, 2026. Anchors: "December 14, 2026".

Links, each inside a real sentence of the note:

- [[Diego Bishop]]: Diego Bishop owns the project

### `Specs/Fjord requirements.md`

- Type: spec
- Date: 2025-09-17
- Author: Diego Bishop (Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-09-17
project: Fjord
owner: Diego Bishop
status: approved
```

Situation: Requirements document of Fjord, with sections for power, cost, the enclosure and the sensor module. A short "Decisions" section at the end was added later, after the enclosure vendor was settled; it does not name the vendor.

Facts to state, keeping every anchor word for word:

- The Fjord requirements call for a battery life of 59 months. Anchors: "59 months".
- The target unit cost for Fjord is $56. Anchors: "$56".

Links, each inside a real sentence of the note:

- [[2025-09-07 Fjord kickoff]]: the requirements build on what the kickoff agreed
- [[2025-11-21 Fjord tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Fjord requirements (copy).md`

- Type: spec
- Date: 2025-09-17
- Author: Rosa Novak (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-09-17
project: Fjord
owner: Diego Bishop
status: approved
```

Situation: A duplicate of the Fjord requirements made the same day and edited separately. It looks just as official, with the same sections, but asks for 34 months of battery life.

Facts to state, keeping every anchor word for word:

- The Fjord requirements call for a battery life of 34 months. Anchors: "34 months".

Links, each inside a real sentence of the note:

- [[2025-09-07 Fjord kickoff]]: written right after the kickoff

### `Quotes/Fjord enclosure - Ironwood Plastics.md`

- Type: quote
- Date: 2025-10-02
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-10-02
project: Fjord
supplier: Ironwood Plastics
```

Situation: Summary of the quote Ironwood Plastics sent for the Fjord enclosure.

Facts to state, keeping every anchor word for word:

- Ironwood Plastics quoted $36,300 for the Fjord enclosure tooling. Anchors: "$36,300".
- Ironwood Plastics needs 10 weeks to deliver the Fjord enclosure tooling. Anchors: "10 weeks".

Links, each inside a real sentence of the note:

- [[Fjord requirements]]: answers the enclosure section of the requirements
- [[Ironwood Plastics]]: supplier details

### `Quotes/Fjord enclosure - Wexford Molding.md`

- Type: quote
- Date: 2025-10-05
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-10-05
project: Fjord
supplier: Wexford Molding
```

Situation: Summary of the quote Wexford Molding sent for the Fjord enclosure.

Facts to state, keeping every anchor word for word:

- Wexford Molding quoted $54,300 for the Fjord enclosure tooling. Anchors: "$54,300".
- Wexford Molding needs 9 weeks to deliver the Fjord enclosure tooling. Anchors: "9 weeks".

Links, each inside a real sentence of the note:

- [[Fjord requirements]]: answers the enclosure section of the requirements
- [[Wexford Molding]]: supplier details

### `Quotes/Fjord sensor module - Keystone Sensing.md`

- Type: quote
- Date: 2025-10-07
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-10-07
project: Fjord
supplier: Keystone Sensing
```

Situation: Summary of the quote Keystone Sensing sent for the Fjord sensor module.

Facts to state, keeping every anchor word for word:

- Keystone Sensing quoted $1.70 per module for the Fjord sensor module. Anchors: "$1.70".

Links, each inside a real sentence of the note:

- [[Fjord requirements]]: answers the sensor module section of the requirements
- [[Keystone Sensing]]: supplier details

### `Meetings/2025-10-17 Fjord enclosure review.md`

- Type: meeting
- Date: 2025-10-17
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-17
project: Fjord
attendees:
  - Rosa Novak
  - Diego Bishop
  - Omar Hart
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Ironwood Plastics, mainly because its tooling is cheaper.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Ironwood Plastics for the Fjord enclosure. Anchors: "Ironwood Plastics".

Links, each inside a real sentence of the note:

- [[Fjord enclosure - Ironwood Plastics]]: the offer from Ironwood Plastics
- [[Fjord enclosure - Wexford Molding]]: the offer from Wexford Molding
- [[Fjord requirements]]: the enclosure requirements being checked

### `Projects/Fjord.md`

- Type: project
- Date: 2025-10-22
- Author: Diego Bishop (Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Sentinel Gen 2
owner: Diego Bishop
status: active
updated: 2025-10-22
```

Situation: Project page of Fjord, last edited on 2025-10-22 and never updated since: it still shows Ironwood Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Fjord is scheduled to launch on December 14, 2026. Anchors: "December 14, 2026".
- The team chose to move forward with Ironwood Plastics for the Fjord enclosure. Anchors: "Ironwood Plastics".

Links, each inside a real sentence of the note:

- [[2025-09-07 Fjord kickoff]]: how the project started
- [[Fjord requirements]]: the requirements
- [[2025-10-17 Fjord enclosure review]]: where the enclosure vendor was discussed

### `Journal/Tessa Okafor/2025-10-27 Tessa Okafor journal.md`

- Type: journal
- Date: 2025-10-27
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-10-27
author: Tessa Okafor
project: Fjord
```

Situation: Personal note from someone who was not at the enclosure review: heard in the hallway that Fjord is going with Ironwood Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Ironwood Plastics for the Fjord enclosure. Anchors: "Ironwood Plastics".

Links, each inside a real sentence of the note:

- [[2025-10-17 Fjord enclosure review]]: what came out of the enclosure review

### `Meetings/2025-11-06 Fjord design review.md`

- Type: meeting
- Date: 2025-11-06
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-06
project: Fjord
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Diego Bishop
```

Situation: Design review of Fjord. One open question is debated at length and left open.

Facts to state, keeping every anchor word for word:

- The team discussed adding Bluetooth commissioning for Fjord but made no decision. Anchors: "Bluetooth".

Links, each inside a real sentence of the note:

- [[Fjord]]: open questions are tracked on the project page

### `Journal/Zoe Adeyemi/2025-11-08 Zoe Adeyemi journal.md`

- Type: journal
- Date: 2025-11-08
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-11-08
author: Zoe Adeyemi
project: Fjord
```

Situation: Personal note: frustrated that the team still has not settled adding Bluetooth commissioning for Fjord.

Facts to state, keeping every anchor word for word:

- The team discussed adding Bluetooth commissioning for Fjord but made no decision. Anchors: "Bluetooth".

Links, each inside a real sentence of the note:

- [[2025-11-06 Fjord design review]]: the question came up in the design review

### `Meetings/2025-11-21 Fjord tooling sign-off.md`

- Type: meeting
- Date: 2025-11-21
- Author: Rosa Novak (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-21
project: Fjord
attendees:
  - Rosa Novak
  - Diego Bishop
  - Omar Hart
  - Claire Gallagher
```

Situation: Vendor validation after the drop tests: the team gives Wexford Molding the tooling go-ahead for the Fjord enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Wexford Molding received the tooling go-ahead for the Fjord enclosure after the drop tests. Anchors: "Wexford Molding".

Links, each inside a real sentence of the note:

- [[Fjord requirements]]: this settles the enclosure section of the requirements
- [[Wexford Molding]]: Wexford Molding is now the validated vendor

Never use these words: quote, quotes, quoted, quoting, quotation, quotations, bid, bids, bidding, bidder, bidders.

### `Meetings/2026-01-30 Fjord EVT review.md`

- Type: meeting
- Date: 2026-01-30
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-01-30
project: Fjord
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Claire Gallagher
```

Situation: Review of the first engineering validation build of Fjord, once the enclosure tooling was ready.

Facts to state, keeping every anchor word for word:

- The Fjord EVT build produced 91 units. Anchors: "91 units".

Links, each inside a real sentence of the note:

- [[2025-11-21 Fjord tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Ruth Holloway/2026-02-01 Ruth Holloway journal.md`

- Type: journal
- Date: 2026-02-01
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2026-02-01
author: Ruth Holloway
project: Fjord
```

Situation: Personal note from someone who helped on the Fjord EVT build but was not at the review: they counted the units themselves.

Facts to state, keeping every anchor word for word:

- The Fjord EVT build produced 96 units. Anchors: "96 units".

Links, each inside a real sentence of the note:

- [[2026-01-30 Fjord EVT review]]: the build the EVT review was about

### `Meetings/2026-03-16 Fjord pilot kickoff.md`

- Type: meeting
- Date: 2026-03-16
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-03-16
project: Fjord
customer: Whitmore Campus Services
attendees:
  - Diego Bishop
  - Claire Gallagher
```

Situation: Kickoff of the Fjord pilot at Whitmore Campus Services: scope and number of units.

Facts to state, keeping every anchor word for word:

- Whitmore Campus Services is piloting Fjord with 100 units. Anchors: "Whitmore Campus Services", "100 units".

Links, each inside a real sentence of the note:

- [[Whitmore Campus Services]]: who the customer is
- [[Fjord]]: the project page

### `Meetings/2026-03-26 Fjord DVT review.md`

- Type: meeting
- Date: 2026-03-26
- Author: Claire Gallagher (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-03-26
project: Fjord
attendees:
  - Claire Gallagher
  - Zoe Adeyemi
  - Rosa Novak
  - Diego Bishop
```

Situation: Design validation review of Fjord: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Fjord DVT units showed a buzzing noise from the power supply. Anchors: "buzzing noise".

Links, each inside a real sentence of the note:

- [[2026-03-16 Fjord pilot kickoff]]: DVT units also went to the pilot

### `Meetings/2026-04-20 Fjord schedule review.md`

- Type: meeting
- Date: 2026-04-20
- Author: Diego Bishop (Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-04-20
project: Fjord
attendees:
  - Diego Bishop
  - Claire Gallagher
  - Emeka Nordin
```

Situation: Schedule review of Fjord: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Fjord will now launch on February 26, 2027. Anchors: "February 26, 2027".
- The Fjord launch slipped because of a certification retest at Halcyon Compliance Labs. Anchors: "Halcyon Compliance Labs".

Links, each inside a real sentence of the note:

- [[Halcyon Compliance Labs]]: the lab running the retest
- [[Fjord]]: the project page

### `Decisions/Fjord launch date change.md`

- Type: decision
- Date: 2026-04-22
- Author: Diego Bishop (Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2026-04-22
project: Fjord
decided_by: Diego Bishop
```

Situation: Decision record of the new Fjord launch date. The reasons are left to the schedule review.

Facts to state, keeping every anchor word for word:

- Fjord will now launch on February 26, 2027. Anchors: "February 26, 2027".

Links, each inside a real sentence of the note:

- [[2026-04-20 Fjord schedule review]]: the reasons are in the schedule review
