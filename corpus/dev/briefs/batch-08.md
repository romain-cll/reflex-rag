# Writing brief batch-08

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver and Austin.
- Hazel Osei: Senior Product Manager, Product team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Ines Fitzgerald: Procurement Specialist, Operations team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Naomi Boyle: Quality Engineer, Operations team

## Notes

### `Meetings/2025-09-01 Ember kickoff.md`

- Type: meeting
- Date: 2025-09-01
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-01
project: Ember
attendees:
  - Hazel Osei
  - Tessa Okafor
  - Ruth Holloway
  - Rafael Nakamura
  - Ines Fitzgerald
```

Situation: Kickoff meeting of Ember: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Ember is the project to build a gateway that collects readings across a multi-floor building, sold as the Larkspur Breeze Gen 2. Anchors: "gateway", "Larkspur Breeze Gen 2".
- Hazel Osei is the product owner of Ember. Anchors: "Hazel Osei".
- Ember is scheduled to launch on July 26, 2026. Anchors: "July 26, 2026".

Links, each inside a real sentence of the note:

- [[Hazel Osei]]: Hazel Osei owns the project

### `Specs/Ember requirements.md`

- Type: spec
- Date: 2025-09-11
- Author: Hazel Osei (Senior Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-09-11
project: Ember
owner: Hazel Osei
status: approved
```

Situation: Requirements document of Ember, with sections for power, cost and enclosure. A short "Decisions" section at the end was added later, after the enclosure vendor was settled.

Facts to state, keeping every anchor word for word:

- The Ember requirements call for a battery life of 12 months. Anchors: "12 months".
- The target unit cost for Ember is $38. Anchors: "$38".

Links, each inside a real sentence of the note:

- [[2025-09-01 Ember kickoff]]: the requirements build on what the kickoff agreed
- [[2025-11-15 Ember tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Ember requirements (copy).md`

- Type: spec
- Date: 2025-09-13
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-09-13
project: Ember
owner: Hazel Osei
status: draft
```

Situation: An old working copy of the Ember requirements that was never deleted. Same structure as the main requirements, but it asks for 18 months of battery life.

Facts to state, keeping every anchor word for word:

- The Ember requirements call for a battery life of 18 months. Anchors: "18 months".

Links, each inside a real sentence of the note:

- [[2025-09-01 Ember kickoff]]: written right after the kickoff

### `Quotes/Ember enclosure - Pacifica Plastics.md`

- Type: quote
- Date: 2025-09-26
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-09-26
project: Ember
supplier: Pacifica Plastics
```

Situation: Summary of the quote Pacifica Plastics sent for the Ember enclosure.

Facts to state, keeping every anchor word for word:

- Pacifica Plastics quoted $47,900 for the Ember enclosure tooling. Anchors: "$47,900".
- Pacifica Plastics needs 10 weeks to deliver the Ember enclosure tooling. Anchors: "10 weeks".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the enclosure section of the requirements
- [[Pacifica Plastics]]: supplier details

### `Quotes/Ember enclosure - Cobalt Molding.md`

- Type: quote
- Date: 2025-09-29
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-09-29
project: Ember
supplier: Cobalt Molding
```

Situation: Summary of the quote Cobalt Molding sent for the Ember enclosure.

Facts to state, keeping every anchor word for word:

- Cobalt Molding quoted $70,000 for the Ember enclosure tooling. Anchors: "$70,000".
- Cobalt Molding needs 11 weeks to deliver the Ember enclosure tooling. Anchors: "11 weeks".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the enclosure section of the requirements
- [[Cobalt Molding]]: supplier details

### `Quotes/Ember circuit board assembly - Trident Electronics.md`

- Type: quote
- Date: 2025-10-01
- Author: Ines Fitzgerald (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-10-01
project: Ember
supplier: Trident Electronics
```

Situation: Summary of the quote Trident Electronics sent for the Ember circuit board assembly.

Facts to state, keeping every anchor word for word:

- Trident Electronics quoted $9.04 per board for the Ember circuit board assembly. Anchors: "$9.04".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the circuit board assembly section of the requirements
- [[Trident Electronics]]: supplier details

### `Meetings/2025-10-11 Ember enclosure review.md`

- Type: meeting
- Date: 2025-10-11
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-11
project: Ember
attendees:
  - Tessa Okafor
  - Hazel Osei
  - Ines Fitzgerald
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Pacifica Plastics, mainly on price.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Pacifica Plastics for the Ember enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[Ember enclosure - Pacifica Plastics]]: the offer from Pacifica Plastics
- [[Ember enclosure - Cobalt Molding]]: the offer from Cobalt Molding
- [[Ember requirements]]: the enclosure requirements being checked

### `Projects/Ember.md`

- Type: project
- Date: 2025-10-16
- Author: Hazel Osei (Senior Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Breeze Gen 2
owner: Hazel Osei
status: active
updated: 2025-10-16
```

Situation: Project page of Ember, last edited on 2025-10-16 and never updated since: it still shows Pacifica Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Ember is scheduled to launch on July 26, 2026. Anchors: "July 26, 2026".
- The team chose to move forward with Pacifica Plastics for the Ember enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[2025-09-01 Ember kickoff]]: how the project started
- [[Ember requirements]]: the requirements
- [[2025-10-11 Ember enclosure review]]: where the enclosure vendor was discussed

### `Journal/Tessa Okafor/2025-10-21 Tessa Okafor journal.md`

- Type: journal
- Date: 2025-10-21
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-10-21
author: Tessa Okafor
project: Ember
```

Situation: Personal note: heard in the hallway that Ember is going with Pacifica Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Pacifica Plastics for the Ember enclosure. Anchors: "Pacifica Plastics".

Links, each inside a real sentence of the note:

- [[2025-10-11 Ember enclosure review]]: what came out of the enclosure review

### `Meetings/2025-10-31 Ember design review.md`

- Type: meeting
- Date: 2025-10-31
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-10-31
project: Ember
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Hazel Osei
```

Situation: Design review of Ember. One open question is debated at length and left open.

Facts to state, keeping every anchor word for word:

- The team discussed using recycled plastic for the enclosure for Ember but made no decision. Anchors: "recycled plastic".

Links, each inside a real sentence of the note:

- [[Ember]]: open questions are tracked on the project page

### `Journal/Zoe Adeyemi/2025-11-02 Zoe Adeyemi journal.md`

- Type: journal
- Date: 2025-11-02
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-11-02
author: Zoe Adeyemi
project: Ember
```

Situation: Personal note: frustrated that the team still has not settled using recycled plastic for the enclosure for Ember.

Facts to state, keeping every anchor word for word:

- The team discussed using recycled plastic for the enclosure for Ember but made no decision. Anchors: "recycled plastic".

Links, each inside a real sentence of the note:

- [[2025-10-31 Ember design review]]: the question came up in the design review

### `Meetings/2025-11-15 Ember tooling sign-off.md`

- Type: meeting
- Date: 2025-11-15
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-11-15
project: Ember
attendees:
  - Tessa Okafor
  - Hazel Osei
  - Ines Fitzgerald
  - Naomi Boyle
```

Situation: Vendor validation after the drop tests: the team gives Cobalt Molding the tooling go-ahead for the Ember enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Cobalt Molding received the tooling go-ahead for the Ember enclosure after the drop tests. Anchors: "Cobalt Molding".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: this settles the enclosure section of the requirements
- [[Cobalt Molding]]: Cobalt Molding is now the validated vendor

Never use these words: quote, quotes, quoted, quotation, bid, bids.

### `Meetings/2025-12-05 Ember EVT review.md`

- Type: meeting
- Date: 2025-12-05
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-12-05
project: Ember
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Naomi Boyle
```

Situation: Review of the first engineering validation build of Ember.

Facts to state, keeping every anchor word for word:

- The Ember EVT build produced 60 units. Anchors: "60 units".

Links, each inside a real sentence of the note:

- [[2025-11-15 Ember tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Ruth Holloway/2025-12-07 Ruth Holloway journal.md`

- Type: journal
- Date: 2025-12-07
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-12-07
author: Ruth Holloway
project: Ember
```

Situation: Personal note after the Ember EVT build, counting the units on the bench.

Facts to state, keeping every anchor word for word:

- The Ember EVT build produced 65 units. Anchors: "65 units".

Links, each inside a real sentence of the note:

- [[2025-12-05 Ember EVT review]]: notes from the EVT review

### `Meetings/2026-01-19 Ember pilot kickoff with Larchmont College.md`

- Type: meeting
- Date: 2026-01-19
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-01-19
project: Ember
attendees:
  - Hazel Osei
  - Naomi Boyle
```

Situation: Kickoff of the Ember pilot at Larchmont College: scope and number of units.

Facts to state, keeping every anchor word for word:

- Larchmont College is piloting Ember with 50 units. Anchors: "Larchmont College", "50 units".

Links, each inside a real sentence of the note:

- [[Larchmont College]]: who the customer is
- [[Ember]]: the project page

### `Meetings/2026-01-29 Ember DVT review.md`

- Type: meeting
- Date: 2026-01-29
- Author: Naomi Boyle (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-01-29
project: Ember
attendees:
  - Naomi Boyle
  - Ruth Holloway
  - Tessa Okafor
  - Hazel Osei
```

Situation: Design validation review of Ember: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Ember DVT units showed a CO2 reading drift above 35 degrees Celsius. Anchors: "reading drift".

Links, each inside a real sentence of the note:

- [[2026-01-19 Ember pilot kickoff with Larchmont College]]: DVT units also went to the pilot

### `Meetings/2026-02-23 Ember schedule review.md`

- Type: meeting
- Date: 2026-02-23
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-02-23
project: Ember
attendees:
  - Hazel Osei
  - Naomi Boyle
  - Emeka Nordin
```

Situation: Schedule review of Ember: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Ember will now launch on October 24, 2026. Anchors: "October 24, 2026".
- The Ember launch slipped because of a certification retest at Redstone Compliance Labs. Anchors: "Redstone Compliance Labs".

Links, each inside a real sentence of the note:

- [[Redstone Compliance Labs]]: the lab running the retest
- [[Ember]]: the project page

### `Decisions/Ember launch date change.md`

- Type: decision
- Date: 2026-02-25
- Author: Hazel Osei (Senior Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2026-02-25
project: Ember
decided_by: Hazel Osei
```

Situation: Decision record of the new Ember launch date.

Facts to state, keeping every anchor word for word:

- Ember will now launch on October 24, 2026. Anchors: "October 24, 2026".

Links, each inside a real sentence of the note:

- [[2026-02-23 Ember schedule review]]: the reasons are in the schedule review
