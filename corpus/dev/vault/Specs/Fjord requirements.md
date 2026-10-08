---
type: spec
date: 2025-09-17
project: Fjord
owner: Diego Bishop
status: approved
---
This document sets the requirements for Fjord. It builds on what the team agreed at [[2025-09-07 Fjord kickoff]] and is owned by Diego Bishop. Each section below states what the design must meet. Supplier offers are collected separately by procurement and are measured against these requirements.

## Overview

Fjord is a battery-powered sensor, and the requirements below apply to the hardware as a whole: power, cost, the enclosure and the sensor module. Where a requirement touches more than one discipline, the product owner arbitrates. This version is approved and is the reference for the design work that follows.

## Power

The Fjord requirements call for a battery life of 59 months. The power design, including the choice of cells and the sleep behavior of the electronics, has to be judged against that figure. Any change that could affect battery life should be raised with the product owner before it goes into the design.

## Cost

The target unit cost for Fjord is $56. This is the cost of the finished unit, so it has to cover the enclosure, the sensor module and everything else that goes into the box. Every sourcing choice is checked against this target, and procurement flags any offer that puts it at risk.

## Enclosure

The enclosure protects the electronics and has to hold the board and the battery securely. It is made of tooled plastic parts produced by an outside molder, so this section asks each supplier for the cost of the tooling and for the time it takes to deliver it. Procurement collects the offers and hardware engineering checks them against the mechanical needs listed here.

## Sensor module

The sensor module is the part that measures the air, and it is bought from an outside supplier. This section asks for a price per module, so that the cost of the module can be set against the unit cost target. Hardware engineering reviews each offer for fit with the board design before anything is agreed.

## Decisions

This section was added after the enclosure vendor was settled. The enclosure supplier decision is recorded in [[2025-11-21 Fjord tooling sign-off]], which closes the open point in the enclosure section above.
