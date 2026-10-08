---
type: spec
date: 2025-05-16
project: Dune
owner: Carmen Iverson
status: approved
---

## Overview

This document sets out the requirements for Dune. It builds on what the team agreed at [[2025-05-06 Dune kickoff]] and serves as the reference for engineering, procurement and quality as the design moves forward. Each section below states what the product must achieve, and the people working on a given area are expected to check their choices against it.

## Power

The Dune requirements call for a battery life of 40 months. The monitor is meant to run unattended on its battery, so the electronics must be designed around a low average power draw. The sensing schedule and the radio activity are the two main levers, and any change to either of them has to be checked against the battery life requirement before it is adopted.

## Cost

The target unit cost for Dune is $95. This is the cost of the finished unit as delivered by the contract manufacturer, counting the enclosure, the battery pack, the electronics and assembly. Procurement compares every supplier offer with this target, and the product team reviews the running cost against it whenever a significant part is chosen.

## Enclosure

The enclosure protects the electronics, gives the sensor clean airflow and must be simple to mount where the monitor is used. It also has to withstand normal handling during installation and day-to-day use. The enclosure needs tooling, so procurement collects offers from molding vendors and mechanical engineering checks each offer against this section before the team compares them on price and delivery time.

## Battery pack

The battery pack must deliver the battery life set in the Power section at a price that fits the cost target. Procurement collects offers for the pack, mechanical engineering confirms that it fits the enclosure, and quality reviews it before it is approved for the build. The pack should be easy for a technician to replace without special tools.

## Decisions

The enclosure supplier decision is recorded in [[2025-07-20 Dune tooling sign-off]], which settles who builds the tooling. The Enclosure section above should be read together with that record.
