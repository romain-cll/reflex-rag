---
type: spec
date: 2025-11-07
project: Fjord
owner: Diego Bishop
status: draft
---
*Working copy (Rosa). Written right after the [[2025-10-26 Fjord kickoff]] to collect hardware comments before they go into the main document.*

## Overview

This document sets the requirements for Fjord, the sensor kit for school gyms and auditoriums that will be sold as the Larkspur Sentinel Gen 2. It follows what the team agreed at the kickoff: the goal, the owner and the target launch date. Each section turns that goal into targets that engineering and procurement can work against.

Gyms and auditoriums are large, busy rooms. Occupancy swings sharply during events, the ceilings are high and the hardware gets knocked around. The requirements are written with those conditions in mind.

The audience is the Fjord core team: product, hardware engineering, firmware and procurement. Changes go through the product owner.

## Power

- Fjord runs on battery so the kit can be mounted high on a wall or near a stage without running power to it.
- The Fjord requirements call for a battery life of 24 months in normal use.
- Firmware must keep the radio and the sensors in low-power modes between readings so that the battery target holds over the whole period.
- Replacing the battery must be something a school facilities team can do on site with ordinary tools.

## Cost

- The unit cost target is owned by the product owner. Every choice in the sections below should be checked against it.
- Enclosure tooling is a one-time cost and is tracked separately from the unit cost.

## Enclosure

- The enclosure must survive the knocks of a gym: stray balls, ladders and equipment carts.
- Vents must let room air reach the sensors without letting dust build up inside.
- Mounting must be secure on block walls and simple for an installer working from a ladder.
- The battery must be reachable without taking the unit off its mount.
- The enclosure has to pass drop testing before tooling is released.
- Rosa: wall thickness and rib layout to be worked out once suppliers send their design feedback.

## Sensor module

- The sensor module is bought from an outside supplier and priced per module.
- It must give stable readings through the wide swings in occupancy these rooms see during events.
- The supplier must provide datasheets and calibration documentation with the module.

## Open points

- Confirm the range of mounting heights with the product owner.
- Check vent placement against the sensor module layout once a module is picked.
- Fold these comments back into the main requirements.
