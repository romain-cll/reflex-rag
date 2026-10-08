---
type: spec
date: 2025-03-25
project: Cirrus
owner: Diego Bishop
status: approved
---

I wrote these requirements for Cirrus right after the kickoff, [[2025-03-15 Cirrus kickoff]], while the discussion was still fresh. They are the reference for the mechanical, electrical and quality work while the product is designed.

## Overview

The requirements are grouped by area: power, cost, the enclosure and the sensor module. Each section states what the product has to do and, where it matters, the target we measure against. When a choice in one area affects another, for example when a feature draws more power or adds to the unit cost, it goes to the product owner before it is settled. Questions about the content come to me.

## Power

The Cirrus requirements call for a battery life of 23 months. Battery life is judged under normal use in a building, so anything that draws extra power, such as a radio or a new feature, has to be weighed against it. The electrical engineers own this section and report back on how the design is tracking against the target.

## Cost

The cost section holds the target unit cost for Cirrus. Every choice in the enclosure and sensor module sections is checked against it, and procurement flags anything that would push the unit above it. The cost section is read together with the power section, because a larger battery or a more capable part is the most common way a design drifts away from the target.

## Enclosure

The enclosure has to protect the electronics, suit the setting of a meeting room, and be produced through molded tooling from an outside vendor. Procurement collects offers for the tooling, and the team compares price and delivery time against the schedule and the cost target. The mechanical engineers own this section and judge whether each offer gives us the housing we need.

## Sensor module

The sensor module is the part that does the measuring, and it is bought from an outside supplier. Procurement collects offers priced per module, and the electrical engineers check that each candidate fits the power and cost sections. The module has to stay reliable for the whole of the battery life, so quality engineering reviews it before it is accepted into a build.
