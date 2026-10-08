---
type: spec
date: 2026-02-02
project: Granite
owner: Carmen Iverson
status: approved
---
## Overview

This document sets the requirements for Granite. It builds on what the team agreed at the [[2026-01-23 Granite kickoff]] and turns the project goal into targets that engineering and procurement can work against. Each section states what the product must do. Where a point is still open, it is flagged in the section itself rather than left implicit.

The audience is the Granite core team: product, hardware engineering, firmware and procurement. Changes to this document go through the product owner.

## Power

- Granite runs on a battery, so it can be installed without running new power to the mounting point.
- The Granite requirements call for a battery life of 24 months in normal use.
- Firmware must keep the radio and the sensors in low-power modes between readings, so that the battery target holds over the whole period.
- Replacing the battery must be simple enough for a building maintenance team to do on site.

## Battery pack

- The battery pack is bought from an outside supplier, in line with how Larkspur sources its other products.
- The pack must be sized to meet the battery life above with margin, and it must be safe to ship and store.
- Procurement collects per-pack pricing from battery suppliers against this section.

## Cost

- The target unit cost for Granite is $72.
- Every design choice in the sections above and below should be checked against this target. If a choice puts the target at risk, it comes back to the product owner before it is locked.
- Tooling is a one-time cost and is tracked separately from the unit cost.

## Enclosure

- The enclosure must look discreet once installed and be quick to mount for an installer working alone.
- Vents must let room air reach the sensors without letting dust build up inside.
- The enclosure must protect the electronics during shipping and installation, and it has to pass drop testing before tooling is released.
- The battery must be reachable without removing the unit from its mount.
- Procurement collects tooling offers from enclosure suppliers against this section.

## Approval

The product owner approved this version as the reference for Granite. Working copies and comments should be folded back into this page rather than kept as separate documents.

## Decisions

*This section was added after the enclosure vendor was settled.*

The enclosure supplier decision is recorded in the [[2026-04-08 Granite tooling sign-off]], which settles the enclosure section above. Refer to that meeting note for which vendor was validated and on what basis.
