---
type: spec
date: 2025-02-04
project: Atlas
owner: Hazel Osei
status: approved
---
## Overview

This document sets the requirements for Atlas, the low-cost sensor for open-plan offices. It builds on what the team agreed at the [[2025-01-25 Atlas kickoff]] and turns the goal into targets that engineering and procurement can work against. Each section states what the product must do. Where a point is still open, it is flagged in the section itself rather than left implicit.

The audience is the Atlas core team: product, hardware engineering, firmware and procurement. Changes to this document go through the product owner.

## Power

- Atlas runs on a battery so it can be placed anywhere on an office floor without depending on outlets.
- The Atlas requirements call for a battery life of 12 months in normal office use.
- Firmware must keep the radio and the sensors in low-power modes between readings so that the battery target holds over the whole period.
- Replacing the battery must be simple enough for a building facilities team to do on site.

## Cost

- The target unit cost for Atlas is $94.
- Every design choice in the sections below should be checked against this target. If a choice puts the target at risk, it comes back to the product owner before it is locked.
- Tooling is a one-time cost and is tracked separately from the unit cost.

## Enclosure

- The enclosure must look discreet in an open-plan office and be easy to mount.
- Vents must let room air reach the sensors without letting dust or debris build up inside.
- The enclosure must protect the electronics during shipping and installation, and it has to pass drop testing before tooling is released.
- The battery must be reachable without removing the unit from its mount.
- Procurement collects tooling offers from enclosure suppliers against this section.

## Circuit board assembly

- The circuit board is assembled by an outside supplier, in line with how Larkspur builds its other products.
- Offers should be priced per board and cover assembly and basic testing of each board.
- The supplier must be able to scale from engineering builds to production volumes without a change of process.

## Approval

The product owner approved this version as the reference for Atlas. Working copies and comments should be folded back into this page rather than kept as separate documents.

## Decisions

*This section was added after the enclosure vendor was settled.*

The enclosure supplier decision is recorded in the [[2025-04-10 Atlas tooling sign-off]], which settles the enclosure section above. Refer to that meeting note for who was validated and why.
