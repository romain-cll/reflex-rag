# Writing brief batch-09

Write each of the 18 notes below as a markdown file of the vault, following corpus/WRITING.md.

## Cast

- Larkspur Devices, Inc. designs connected indoor air-quality sensors for commercial buildings and outsources manufacturing. Offices in Portland (headquarters), Denver, Austin, Boston and Chicago.
- Hazel Osei: Senior Product Manager, Product team
- Tessa Okafor: Mechanical Engineer, Hardware Engineering team
- Omar Hart: Procurement Specialist, Operations team
- Zoe Adeyemi: Electrical Engineer, Hardware Engineering team
- Ruth Holloway: Electrical Engineer, Hardware Engineering team
- Rosa Novak: Mechanical Engineer, Hardware Engineering team
- Claire Gallagher: Quality Engineer, Operations team

## Notes

### `Meetings/2025-07-06 Ember kickoff.md`

- Type: meeting
- Date: 2025-07-06
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-07-06
project: Ember
attendees:
  - Hazel Osei
  - Tessa Okafor
  - Ruth Holloway
  - Rafael Nakamura
  - Omar Hart
```

Situation: Kickoff meeting of Ember: goal, owner and target launch date.

Facts to state, keeping every anchor word for word:

- Ember is the project to build a portable multi-gas sensor for basements, sold as the Larkspur Breeze Gen 2. Anchors: "multi-gas sensor for basements", "Larkspur Breeze Gen 2".
- Hazel Osei is the product owner of Ember. Anchors: "Hazel Osei".
- Ember is scheduled to launch on January 4, 2027. Anchors: "January 4, 2027".

Links, each inside a real sentence of the note:

- [[Hazel Osei]]: Hazel Osei owns the project

### `Specs/Ember requirements.md`

- Type: spec
- Date: 2025-07-16
- Author: Hazel Osei (Senior Product Manager)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-07-16
project: Ember
owner: Hazel Osei
status: approved
```

Situation: Requirements document of Ember, with sections for power, cost, the enclosure and the circuit board assembly. A short "Decisions" section at the end was added later, after the enclosure vendor was settled; it does not name the vendor.

Facts to state, keeping every anchor word for word:

- The Ember requirements call for a battery life of 48 months. Anchors: "48 months".
- The target unit cost for Ember is $67. Anchors: "$67".

Links, each inside a real sentence of the note:

- [[2025-07-06 Ember kickoff]]: the requirements build on what the kickoff agreed
- [[2025-09-19 Ember tooling sign-off]]: the enclosure supplier decision is recorded in the tooling sign-off

### `Specs/Ember requirements (copy).md`

- Type: spec
- Date: 2025-07-16
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 300 to 600 words

Frontmatter, copied exactly:

```yaml
type: spec
date: 2025-07-16
project: Ember
owner: Hazel Osei
status: approved
```

Situation: A duplicate of the Ember requirements made the same day and edited separately. It looks just as official, with the same sections, but asks for 26 months of battery life.

Facts to state, keeping every anchor word for word:

- The Ember requirements call for a battery life of 26 months. Anchors: "26 months".

Links, each inside a real sentence of the note:

- [[2025-07-06 Ember kickoff]]: written right after the kickoff

### `Quotes/Ember enclosure - Redstone Plastics.md`

- Type: quote
- Date: 2025-07-31
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-07-31
project: Ember
supplier: Redstone Plastics
```

Situation: Summary of the quote Redstone Plastics sent for the Ember enclosure.

Facts to state, keeping every anchor word for word:

- Redstone Plastics quoted $40,100 for the Ember enclosure tooling. Anchors: "$40,100".
- Redstone Plastics needs 7 weeks to deliver the Ember enclosure tooling. Anchors: "7 weeks".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the enclosure section of the requirements
- [[Redstone Plastics]]: supplier details

### `Quotes/Ember enclosure - Ironwood Plastics.md`

- Type: quote
- Date: 2025-08-03
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-08-03
project: Ember
supplier: Ironwood Plastics
```

Situation: Summary of the quote Ironwood Plastics sent for the Ember enclosure.

Facts to state, keeping every anchor word for word:

- Ironwood Plastics quoted $68,300 for the Ember enclosure tooling. Anchors: "$68,300".
- Ironwood Plastics needs 14 weeks to deliver the Ember enclosure tooling. Anchors: "14 weeks".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the enclosure section of the requirements
- [[Ironwood Plastics]]: supplier details

### `Quotes/Ember circuit board assembly - Gemini Circuits.md`

- Type: quote
- Date: 2025-08-05
- Author: Omar Hart (Procurement Specialist)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: quote
date: 2025-08-05
project: Ember
supplier: Gemini Circuits
```

Situation: Summary of the quote Gemini Circuits sent for the Ember circuit board assembly.

Facts to state, keeping every anchor word for word:

- Gemini Circuits quoted $2.04 per board for the Ember circuit board assembly. Anchors: "$2.04".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: answers the circuit board assembly section of the requirements
- [[Gemini Circuits]]: supplier details

### `Meetings/2025-08-15 Ember enclosure review.md`

- Type: meeting
- Date: 2025-08-15
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-08-15
project: Ember
attendees:
  - Tessa Okafor
  - Hazel Osei
  - Omar Hart
```

Situation: Enclosure vendor review comparing the two tooling quotes. The team leans toward Redstone Plastics, mainly because its tooling is cheaper.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Redstone Plastics for the Ember enclosure. Anchors: "Redstone Plastics".

Links, each inside a real sentence of the note:

- [[Ember enclosure - Redstone Plastics]]: the offer from Redstone Plastics
- [[Ember enclosure - Ironwood Plastics]]: the offer from Ironwood Plastics
- [[Ember requirements]]: the enclosure requirements being checked

### `Projects/Ember.md`

- Type: project
- Date: 2025-08-20
- Author: Hazel Osei (Senior Product Manager)
- Length: 150 to 300 words

Frontmatter, copied exactly:

```yaml
type: project
product: Larkspur Breeze Gen 2
owner: Hazel Osei
status: active
updated: 2025-08-20
```

Situation: Project page of Ember, last edited on 2025-08-20 and never updated since: it still shows Redstone Plastics as the enclosure vendor and the original launch date.

Facts to state, keeping every anchor word for word:

- Ember is scheduled to launch on January 4, 2027. Anchors: "January 4, 2027".
- The team chose to move forward with Redstone Plastics for the Ember enclosure. Anchors: "Redstone Plastics".

Links, each inside a real sentence of the note:

- [[2025-07-06 Ember kickoff]]: how the project started
- [[Ember requirements]]: the requirements
- [[2025-08-15 Ember enclosure review]]: where the enclosure vendor was discussed

### `Journal/Zoe Adeyemi/2025-08-25 Zoe Adeyemi journal.md`

- Type: journal
- Date: 2025-08-25
- Author: Zoe Adeyemi (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-08-25
author: Zoe Adeyemi
project: Ember
```

Situation: Personal note from someone who was not at the enclosure review: heard in the hallway that Ember is going with Redstone Plastics for the enclosure.

Facts to state, keeping every anchor word for word:

- The team chose to move forward with Redstone Plastics for the Ember enclosure. Anchors: "Redstone Plastics".

Links, each inside a real sentence of the note:

- [[2025-08-15 Ember enclosure review]]: what came out of the enclosure review

### `Meetings/2025-09-04 Ember design review.md`

- Type: meeting
- Date: 2025-09-04
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-04
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

### `Journal/Ruth Holloway/2025-09-06 Ruth Holloway journal.md`

- Type: journal
- Date: 2025-09-06
- Author: Ruth Holloway (Electrical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2025-09-06
author: Ruth Holloway
project: Ember
```

Situation: Personal note: frustrated that the team still has not settled using recycled plastic for the enclosure for Ember.

Facts to state, keeping every anchor word for word:

- The team discussed using recycled plastic for the enclosure for Ember but made no decision. Anchors: "recycled plastic".

Links, each inside a real sentence of the note:

- [[2025-09-04 Ember design review]]: the question came up in the design review

### `Meetings/2025-09-19 Ember tooling sign-off.md`

- Type: meeting
- Date: 2025-09-19
- Author: Tessa Okafor (Mechanical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2025-09-19
project: Ember
attendees:
  - Tessa Okafor
  - Hazel Osei
  - Omar Hart
  - Claire Gallagher
```

Situation: Vendor validation after the drop tests: the team gives Ironwood Plastics the tooling go-ahead for the Ember enclosure. Talk about sign-off, validation and go-ahead.

Facts to state, keeping every anchor word for word:

- Ironwood Plastics received the tooling go-ahead for the Ember enclosure after the drop tests. Anchors: "Ironwood Plastics".

Links, each inside a real sentence of the note:

- [[Ember requirements]]: this settles the enclosure section of the requirements
- [[Ironwood Plastics]]: Ironwood Plastics is now the validated vendor

Never use these words: quote, quotes, quoted, quoting, quotation, quotations, bid, bids, bidding, bidder, bidders.

### `Meetings/2026-01-02 Ember EVT review.md`

- Type: meeting
- Date: 2026-01-02
- Author: Ruth Holloway (Electrical Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-01-02
project: Ember
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Claire Gallagher
```

Situation: Review of the first engineering validation build of Ember, once the enclosure tooling was ready.

Facts to state, keeping every anchor word for word:

- The Ember EVT build produced 74 units. Anchors: "74 units".

Links, each inside a real sentence of the note:

- [[2025-09-19 Ember tooling sign-off]]: enclosures built as agreed at the sign-off

### `Journal/Rosa Novak/2026-01-04 Rosa Novak journal.md`

- Type: journal
- Date: 2026-01-04
- Author: Rosa Novak (Mechanical Engineer)
- Length: 80 to 200 words

Frontmatter, copied exactly:

```yaml
type: journal
date: 2026-01-04
author: Rosa Novak
project: Ember
```

Situation: Personal note from someone who helped on the Ember EVT build but was not at the review: they counted the units themselves.

Facts to state, keeping every anchor word for word:

- The Ember EVT build produced 79 units. Anchors: "79 units".

Links, each inside a real sentence of the note:

- [[2026-01-02 Ember EVT review]]: the build the EVT review was about

### `Meetings/2026-02-16 Ember pilot kickoff.md`

- Type: meeting
- Date: 2026-02-16
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-02-16
project: Ember
customer: Maple Ridge University
attendees:
  - Hazel Osei
  - Claire Gallagher
```

Situation: Kickoff of the Ember pilot at Maple Ridge University: scope and number of units.

Facts to state, keeping every anchor word for word:

- Maple Ridge University is piloting Ember with 80 units. Anchors: "Maple Ridge University", "80 units".

Links, each inside a real sentence of the note:

- [[Maple Ridge University]]: who the customer is
- [[Ember]]: the project page

### `Meetings/2026-02-26 Ember DVT review.md`

- Type: meeting
- Date: 2026-02-26
- Author: Claire Gallagher (Quality Engineer)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-02-26
project: Ember
attendees:
  - Claire Gallagher
  - Ruth Holloway
  - Tessa Okafor
  - Hazel Osei
```

Situation: Design validation review of Ember: the main issue found on the DVT units.

Facts to state, keeping every anchor word for word:

- The Ember DVT units showed a CO2 reading drift in warm rooms. Anchors: "reading drift".

Links, each inside a real sentence of the note:

- [[2026-02-16 Ember pilot kickoff]]: DVT units also went to the pilot

### `Meetings/2026-03-23 Ember schedule review.md`

- Type: meeting
- Date: 2026-03-23
- Author: Hazel Osei (Senior Product Manager)
- Length: 180 to 400 words

Frontmatter, copied exactly:

```yaml
type: meeting
date: 2026-03-23
project: Ember
attendees:
  - Hazel Osei
  - Claire Gallagher
  - Emeka Nordin
```

Situation: Schedule review of Ember: the launch moves because a certification test has to be run again.

Facts to state, keeping every anchor word for word:

- Ember will now launch on March 16, 2027. Anchors: "March 16, 2027".
- The Ember launch slipped because of a certification retest at Anvil Test Labs. Anchors: "Anvil Test Labs".

Links, each inside a real sentence of the note:

- [[Anvil Test Labs]]: the lab running the retest
- [[Ember]]: the project page

### `Decisions/Ember launch date change.md`

- Type: decision
- Date: 2026-03-25
- Author: Hazel Osei (Senior Product Manager)
- Length: 120 to 250 words

Frontmatter, copied exactly:

```yaml
type: decision
date: 2026-03-25
project: Ember
decided_by: Hazel Osei
```

Situation: Decision record of the new Ember launch date. The reasons are left to the schedule review.

Facts to state, keeping every anchor word for word:

- Ember will now launch on March 16, 2027. Anchors: "March 16, 2027".

Links, each inside a real sentence of the note:

- [[2026-03-23 Ember schedule review]]: the reasons are in the schedule review
