---
type: meeting
date: 2026-03-24
project: Granite
attendees:
  - Ruth Holloway
  - Tessa Okafor
  - Rafael Nakamura
  - Carmen Iverson
---
Ruth, Tessa, Rafael Nakamura and Carmen met for the Granite design review. Most of the time went to a single open question.

## Discussion

- **Status.** Tessa and Ruth gave short updates on the mechanical and electrical design. Nothing in either update needed a decision today.
- **Cellular backhaul.** The main topic was whether to add a cellular backhaul option for Granite, so that sensor data could leave a building without going through the customer's own network.
  - For: some sites may not want our traffic on their network, or may make access slow to arrange. A cellular option would let installs go ahead without waiting on the customer's IT team.
  - Against: Ruth raised the extra draw on the battery and the room the modem and antenna would need on the board. Tessa added that the enclosure would have to make space for the antenna. Carmen worried about what it does to the unit cost target.
  - Rafael Nakamura asked whether the option could come later as a variant rather than in the first release. Nobody had a firm answer.
  - Carmen wants a better sense of how many customers would actually need it before committing either way.
- The debate went around several times and did not converge.

## Decisions

- None. The team discussed adding a cellular backhaul option for Granite but made no decision, and the question stays open.

## Action items

- Carmen to log the cellular backhaul question with the other open questions on the [[Granite]] project page.
- Ruth to sketch what a cellular option would mean for the board and the power budget.
- Tessa to check how much room the enclosure has for an antenna.
- Ruth to send the recap and put the question back on the agenda of a later review.
