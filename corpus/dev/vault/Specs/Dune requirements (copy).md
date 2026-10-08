---
type: spec
date: 2025-07-02
project: Dune
owner: Carmen Iverson
status: draft
---

Working copy of the Dune requirements, written right after the [[2025-06-20 Dune kickoff]] to collect mechanical and power comments before the review.

## Overview

This document sets the requirements for Dune, the ceiling-mounted sensor for retrofit projects that will be sold as the Larkspur Halo Gen 2. The sensor has to fit into existing buildings with as little installation work as possible, and each discipline needs clear targets before vendor work starts.

Carmen Iverson owns this document. Questions and change requests go to her, and any change to a target below needs her approval before it is applied.

## Power

- Dune runs on a battery pack, so installers do not need to bring power to the ceiling.
- The Dune requirements call for a battery life of 18 months in normal use.
- The battery pack is a purchased part. Procurement will source it from an outside vendor against this section.
- Electrical design and firmware treat the battery life as a hard requirement. Any feature that puts it at risk must be raised with the product owner before it is built.

## Cost

- Target unit cost: to be copied in from the product owner once confirmed.
- Tooling is tracked separately from the unit cost and reviewed with procurement.
- Any design choice that pushes the unit cost above the target must be flagged early, with the trade-off written down so the product owner can decide.

## Enclosure

- The enclosure must suit a ceiling mount in existing buildings and be simple for one installer to fit.
- It should look discreet on a finished ceiling.
- The enclosure is a molded part made by an outside vendor. Procurement will ask enclosure vendors for tooling offers against this section.
- Mechanical engineering owns the enclosure design and confirms that it survives normal handling and installation.
- Comment: check the mounting options with installers before the design is frozen.

## Review

Comments in this copy are still open. The power, cost and enclosure sections need a pass with hardware, firmware and procurement before the document can move out of draft.
