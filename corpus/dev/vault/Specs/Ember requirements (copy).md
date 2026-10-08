---
type: spec
date: 2025-09-13
project: Ember
owner: Hazel Osei
status: draft
---
Working copy of the Ember requirements, written right after the [[2025-09-01 Ember kickoff]] so that mechanical notes could be added without touching the main document.

## Overview

This document sets the requirements for Ember, the gateway that collects readings across a multi-floor building. It follows the structure of the requirements owned by Hazel Osei: power, cost, enclosure and circuit board assembly. Hardware, firmware and procurement should treat the targets below as fixed unless the product owner agrees to change them.

## Power

The Ember requirements call for a battery life of 18 months. The gateway must reach this in normal use in a building, without the facilities team having to step in between battery changes. Electrical and firmware design choices, such as how often the radio wakes up and how the sensing is scheduled, should be sized against this target. Any design that cannot reach it needs to be flagged to the product owner early rather than discovered during validation.

## Cost

Every part, assembly step and sourcing choice should be weighed against the unit cost target set by the product owner. One-off costs such as enclosure tooling sit outside the unit cost, but procurement should report them alongside each offer so that the team sees the full picture when comparing vendors.

## Enclosure

Mechanical notes for this section:

- The enclosure has to suit indoor commercial spaces such as offices and classrooms.
- It must protect the electronics during shipping and installation.
- Air needs a clear path to the sensing elements.
- Manufacturing is outsourced, so procurement will collect offers for the enclosure tooling from outside vendors, and mechanical engineering will check each offer against this section before a vendor is settled.

## Circuit board assembly

Circuit board assembly is outsourced as well. Procurement will collect offers for assembling the boards, and electrical engineering will review them for process fit. Per-board pricing has to leave enough room within the unit cost target.

## Change control

Comments on this copy go to Tessa Okafor for the mechanical part and to the product owner for everything else. Changes to any target need the product owner's approval and a short note explaining the reason, so that hardware, firmware and procurement keep working from the same numbers.
