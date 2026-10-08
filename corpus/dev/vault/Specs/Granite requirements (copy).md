---
type: spec
date: 2026-02-04
project: Granite
owner: Carmen Iverson
status: draft
---
*Working copy, used to collect mechanical comments on the requirements.*

## Overview

This document sets the requirements for Granite. It was written right after the [[2026-01-23 Granite kickoff]] and turns the project goal into targets that engineering and procurement can work against. Each section states what the product must do. Where a point is still open, it is flagged in the section itself rather than left implicit.

The audience is the Granite core team: product, hardware engineering, firmware and procurement. Changes to this document go through the product owner.

## Power

- Granite runs on a battery, so it can be installed without running new power to the mounting point.
- The Granite requirements call for a battery life of 30 months in normal use.
- Firmware must keep the radio and the sensors in low-power modes between readings, so that the battery target holds over the whole period.
- Replacing the battery must be simple enough for a building maintenance team to do on site.

## Battery pack

- The battery pack is bought from an outside supplier.
- The pack must be sized to meet the battery life above, and it must be safe to ship and store.
- Comment: the size of the pack drives the inside volume of the enclosure, so mechanical needs the pack dimensions as early as possible.

## Cost

- The unit cost target is set by the product owner. Every design choice should be checked against it, and anything that puts it at risk goes back to the product owner before it is locked.
- Tooling is a one-time cost and is tracked separately from the unit cost.

## Enclosure

- The enclosure must look discreet once installed and be quick to mount for an installer working alone.
- Vents must let room air reach the sensors without letting dust build up inside.
- The enclosure must protect the electronics during shipping and installation, and it has to pass drop testing before tooling is released.
- The battery must be reachable without removing the unit from its mount.
- Comment: vent placement and mounting points need a second look once the board outline is known.
- Comment: drop testing should be planned with quality early, so it does not hold up the tooling release.

## Approval

Draft. This version has not been through approval yet. Comments are to be folded into the requirements once the product owner has reviewed them.
