---
type: meeting
date: 2025-03-26
project: Atlas
attendees:
  - Zoe Adeyemi
  - Rosa Novak
  - Hector Haddad
  - Hazel Osei
---
Zoe, Rosa, Hector and Hazel met for the Atlas design review. Most of the time went to a single open question: how the unit should be powered.

## Discussion

The team discussed switching to USB-C power for Atlas. The current design runs on a battery, and the question came up whether a USB-C port should replace it or sit next to it.

Arguments for USB-C:

- Facilities teams would not have to swap batteries, which is one less maintenance task for customers.
- The sensors could report more often without eating into a battery budget.
- A standard connector is easy to source and familiar to installers.

Arguments against:

- Cables across an open-plan office are messy, and units would end up placed near outlets instead of where the air needs measuring.
- A port changes the enclosure: Rosa pointed out it needs an opening, a seal and a rethink of the mounting.
- Zoe noted the board would need a new power stage, which touches both the layout and the cost target.
- Hector asked how reporting behavior would differ between the two cases, and whether the firmware should support both.

The discussion went back and forth for a long time. Each argument had a fair counterpoint, and nobody felt there was enough information in the room to settle it. Hazel asked for the trade-offs to be written down before the question comes back.

## Decisions

None on power. The team discussed switching to USB-C power for Atlas but made no decision. The question stays open, and open questions are tracked on the project page, [[Atlas]].

## Action items

- Zoe: outline what USB-C power would change on the board.
- Rosa: outline what a port would change on the enclosure.
- Hector: describe how reporting would work with and without a battery.
- Hazel: bring the question back to a later review once the outlines are in.
