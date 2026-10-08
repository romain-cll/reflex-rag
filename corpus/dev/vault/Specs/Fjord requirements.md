---
type: spec
date: 2025-11-05
project: Fjord
owner: Diego Bishop
status: approved
---
## Overview

This document sets the requirements for Fjord, the sensor kit for school gyms and auditoriums that will be sold as the Larkspur Sentinel Gen 2. It builds on what the team agreed at the [[2025-10-26 Fjord kickoff]]: the goal, the owner and the target launch date. Each section below turns that goal into targets that engineering and procurement can work against.

Gyms and auditoriums are large, busy rooms. Occupancy swings sharply during events, the ceilings are high and the hardware gets knocked around. The requirements are written with those conditions in mind.

The audience is the Fjord core team: product, hardware engineering, firmware and procurement. Changes to this document go through the product owner.

## Power

- Fjord runs on battery so the kit can be mounted high on a wall or near a stage without running power to it.
- The Fjord requirements call for a battery life of 18 months in normal use.
- Firmware must keep the radio and the sensors in low-power modes between readings so that the battery target holds over the whole period.
- Replacing the battery must be something a school facilities team can do on site with ordinary tools.

## Cost

- The target unit cost for Fjord is $92.
- Every choice in the sections below should be checked against this target. Anything that puts it at risk comes back to the product owner before it is locked.
- Enclosure tooling is a one-time cost and is tracked separately from the unit cost.

## Enclosure

- The enclosure must survive the knocks of a gym: stray balls, ladders and equipment carts.
- Vents must let room air reach the sensors without letting dust build up inside.
- Mounting must be secure on block walls and simple for an installer working from a ladder.
- The battery must be reachable without taking the unit off its mount.
- The enclosure has to pass drop testing before tooling is released.
- Procurement collects tooling offers from enclosure suppliers against this section.

## Sensor module

- The sensor module is bought from an outside supplier and priced per module.
- It must give stable readings through the wide swings in occupancy these rooms see during events.
- The supplier must provide datasheets and calibration documentation with the module.
- Procurement collects offers from sensor module suppliers against this section.

## Approval

The product owner approved this version as the reference for Fjord. Working copies and comments should be folded back into this page rather than kept as separate documents.

## Decisions

*This section was added after the enclosure vendor was settled.*

The enclosure supplier decision is recorded in the [[2026-01-09 Fjord tooling sign-off]], which settles the enclosure section above. Refer to that meeting note for the validated vendor and the drop test context.
