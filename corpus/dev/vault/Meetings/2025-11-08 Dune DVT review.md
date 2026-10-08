---
type: meeting
date: 2025-11-08
project: Dune
attendees:
  - Claire Gallagher
  - Zoe Adeyemi
  - Rosa Novak
  - Carmen Iverson
---

Claire Gallagher, Zoe Adeyemi, Rosa Novak and Carmen Iverson met for the design validation review of Dune to go through what the DVT units showed and decide how to follow up.

## Discussion

Claire presented the results from the DVT units. The main issue is that the Dune DVT units showed firmware resets when the gateway reboots. A unit that is connected to the gateway restarts its own firmware at the moment the gateway goes down and comes back, instead of waiting quietly for the link to return.

Zoe said she wants to understand the exact sequence of events before suggesting a fix. Rosa noted that the resets look like an electrical and firmware matter rather than a mechanical one. Carmen pointed out that the DVT units also went to the pilot described in [[2025-10-29 Dune pilot kickoff]], so the team has to be careful about how it talks about this issue with the people using them.

The rest of the validation results were reviewed briefly, and the group agreed that the resets are the item that matters most at this stage.

## Decisions

No design change was decided in the meeting. The firmware resets are the main issue found on the DVT units and are carried into the follow-up.

## Action items

- Zoe to look into the cause of the resets on the firmware side.
- Claire to keep the test records for the DVT units up to date.
- Send a recap of the review to everyone who attended.
- Schedule a follow-up review once the cause is understood.
