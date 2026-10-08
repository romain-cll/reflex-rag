---
type: meeting
date: 2026-06-22
project: Granite
attendees:
  - Naomi Boyle
  - Ruth Holloway
  - Tessa Okafor
  - Carmen Iverson
---
Naomi, Ruth, Tessa and Carmen met for the design validation review of Granite. The meeting focused on the main issue found on the DVT units.

## Discussion

- **Main issue.** The Granite DVT units showed firmware resets when the gateway reboots. Naomi walked through the entries in the issue log: each reset lines up with a gateway restart.
- **Cause.** The root cause is not known yet. Ruth wants to reproduce the resets on the bench with a controlled gateway reboot before anyone starts changing code. Nobody wanted to guess at a fix in the meeting.
- **Pilot.** DVT units also went to the pilot set up in [[2026-06-12 Granite pilot kickoff with Rosewood Property Group]], so the same resets can show up at the pilot site whenever the gateway there restarts. Carmen would rather the customer hear about it from us first than discover it on their own.
- **Other findings.** Tessa and Ruth have smaller items from DVT in the issue log. They were not discussed in detail today; the firmware resets take priority.

## Decisions

- The firmware resets are the main open issue from DVT and are tracked as the top item in the issue log until they are understood.

## Action items

- Ruth to reproduce the firmware resets on the bench with a gateway reboot and share what she finds.
- Naomi to keep the issue log current and watch the pilot reports for the same symptom.
- Carmen to brief the pilot customer on the issue and on what the team is doing about it.
- Naomi to send a recap of this meeting to the attendees.
