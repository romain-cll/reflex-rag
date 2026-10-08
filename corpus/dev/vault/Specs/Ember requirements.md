---
type: spec
date: 2025-09-11
project: Ember
owner: Hazel Osei
status: approved
---
## Overview

This document sets the requirements for Ember, the gateway that collects readings across a multi-floor building. It builds on what the team agreed at the [[2025-09-01 Ember kickoff]]: the goal of the product, its owner and its target launch. Hardware, firmware and procurement should treat the targets below as fixed unless the product owner agrees to change them.

## Power

The Ember requirements call for a battery life of 12 months. The gateway must reach this in normal use in a building, without the facilities team having to step in between battery changes. Electrical and firmware design choices, such as how often the radio wakes up and how the sensing is scheduled, should be sized against this target. Any design that cannot reach it needs to be flagged to the product owner early rather than discovered during validation.

## Cost

The target unit cost for Ember is $38. Every part, assembly step and sourcing choice should be weighed against this figure. One-off costs such as enclosure tooling sit outside the unit cost, but procurement should report them alongside each offer so that the team sees the full picture when comparing vendors.

## Enclosure

The enclosure has to suit indoor commercial spaces such as offices and classrooms, protect the electronics during shipping and installation, and leave a clear path for air to reach the sensing elements. Manufacturing is outsourced, so procurement will collect offers for the enclosure tooling from outside vendors. Mechanical engineering will check each offer against this section before a vendor is settled.

## Circuit board assembly

Circuit board assembly is outsourced as well. Procurement will collect offers for assembling the boards, and electrical engineering will review them for process fit. Per-board pricing has to leave enough room within the unit cost target above.

## Change control

Comments on this document go to the product owner. Changes to any target need the product owner's approval and a short note explaining the reason, so that hardware, firmware and procurement keep working from the same numbers.

## Decisions

Added after the enclosure vendor was settled: the enclosure supplier decision, and the validation behind it, are recorded in [[2025-11-15 Ember tooling sign-off]]. That sign-off settles the enclosure section above; refer to it rather than to earlier vendor discussions.
