---
type: meeting
date: 2025-06-24
project: Atlas
attendees:
  - Naomi Boyle
  - Zoe Adeyemi
  - Rosa Novak
  - Hazel Osei
---
Naomi, Zoe, Rosa and Hazel met for the design validation (DVT) review of Atlas, focused on the main issue found on the DVT units.

## Discussion

**Main issue.** The Atlas DVT units showed condensation inside the humidity sensor channel. Naomi found it while inspecting units during design validation and walked the group through photos and the inspection log. The condensation sits in the channel that brings room air to the humidity sensor, which is the worst place for it: moisture there can skew humidity readings and, over time, put the electronics near the sensor at risk.

**Possible causes.** The group talked through where the moisture could come from: the shape of the channel, how air moves through the vents, and how the board sits relative to the channel. Rosa thinks the enclosure geometry is the first place to look. Zoe wants to check the sensor placement and the heat from nearby parts on the board. Nobody wanted to name a root cause before more data is in.

**Pilot.** This matters beyond the lab. DVT units also went to the pilot, as planned at the [[2025-06-14 Atlas pilot kickoff with Sheridan Realty Partners|pilot kickoff]], so the same issue could show up in the field. Hazel wants to know early if it does.

**Other findings.** Smaller items from DVT are in the issue log and were not discussed in detail.

## Decisions

- None yet. The root cause of the condensation stays open until the checks below are done.

## Action items

- Rosa: review the humidity sensor channel and vent geometry in the enclosure.
- Zoe: check sensor placement and nearby heat sources on the board.
- Naomi: keep inspecting DVT units and log every case of condensation.
- Hazel: check with the pilot whether the units in the field show the same issue.
