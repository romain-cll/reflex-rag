# Grader check

Twenty answers drawn from the final runs on the test split (`docs/experiments/grader-sample.ts`, seeded), four per config, with answers the grader marked correct and wrong. For each one, say whether you agree with the grader's verdict, given the question and the expected answer. The grader only reads the answer's status and value (and the answer text for conflicts and undecided questions); an explanation that mentions an outdated value it replaces is fine.

**Result (2026-10-10):** Romain agrees with the grader on 20 of 20 answers, 10 it marked correct and 10 it marked wrong, across all five categories. With 20 answers, that bounds the grader's agreement with a human above 83% (95% Clopper-Pearson), not at 100%.

### 1. q-112 (no_answer, config A)

- **Question**: Which LEED certification level does Maple Ridge University target?
- **Expected**: abstain (the vault does not say)
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The excerpts do not state which LEED certification level Maple Ridge University targets, so I cannot answer this from the provided notes.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-33-58-836Z-A-test`
- **Romain agrees** (yes / no, and why if no): yes

### 2. q-070 (simple, config A)

- **Question**: Who is the main contact at Larchmont Regional Hospital?
- **Expected**: value: Owen Kowalski
- **Answer**: status `answered`; value: Owen Kowalski
- **Answer text**: Owen Kowalski, Facilities Manager, is the main contact at Larchmont Regional Hospital.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-33-58-836Z-A-test`
- **Romain agrees** (yes / no, and why if no): yes

### 3. q-074 (multi_hop, config A)

- **Question**: Who is the main contact at the customer running the Granite pilot?
- **Expected**: value: Dana Ortega
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The excerpts name Redwood Hills Realty Partners as the customer for the Granite pilot but do not identify a main contact person there.
- **Grader**: wrong (retrieval_miss)
- **Run**: `runs/2026-10-10T15-59-55-310Z-A-test`
- **Romain agrees** (yes / no, and why if no): yes

### 4. q-080 (multi_hop, config A)

- **Question**: Who is the main contact at the customer running the Cirrus pilot?
- **Expected**: value: Mateo Quinlan
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The excerpts do not name the main contact at Foxborough Unified Schools for the Cirrus pilot. The kickoff note only says Diego will introduce the pilot plan to the customer's main contact.
- **Grader**: wrong (retrieval_miss)
- **Run**: `runs/2026-10-10T15-59-55-310Z-A-test`
- **Romain agrees** (yes / no, and why if no): yes

### 5. q-101 (contradiction, config B)

- **Question**: What battery life do the Ember requirements call for?
- **Expected**: conflict between: 48 months / 26 months
- **Answer**: status `conflict`; value: 48 months \| 26 months
- **Answer text**: The original Ember requirements note says a battery life of 48 months, while the copy of the same note, dated the same day, says 26 months. Neither source supersedes the other, so the conflict is unresolved.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-51-49-502Z-B-test`
- **Romain agrees** (yes / no, and why if no): yes

### 6. q-091 (temporal, config B)

- **Question**: Who owns the Summit Park Workplace Group account?
- **Expected**: value: Leah Ashby; outdated values that must not be given: Aisha Whitfield
- **Answer**: status `answered`; value: Leah Ashby
- **Answer text**: Leah Ashby took over the Summit Park Workplace Group account from Aisha Whitfield in a handoff meeting dated 2025-11-29, which supersedes the older account page stating Aisha Whitfield owns it.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-33-58-836Z-B-test`
- **Romain agrees** (yes / no, and why if no): yes

### 7. q-115 (no_answer, config B)

- **Question**: When does Cirrus launch in Japan?
- **Expected**: abstain (the vault does not say)
- **Answer**: status `answered`; value: June 27, 2027
- **Answer text**: Cirrus now launches on June 27, 2027, after a certification retest moved the earlier date. The launch date change decision supersedes the original date.
- **Grader**: wrong (unsupported_claim)
- **Run**: `runs/2026-10-10T15-51-49-502Z-B-test`
- **Romain agrees** (yes / no, and why if no): yes

### 8. q-105 (contradiction, config B)

- **Question**: How many units did the Ember EVT build produce?
- **Expected**: conflict between: 74 units / 79 units
- **Answer**: status `answered`; value: 79
- **Answer text**: The Ember EVT build produced 79 units, according to Rosa Novak's journal entry dated 2026-01-04, where she says she counted them twice.
- **Grader**: wrong (judge_rejected)
- **Run**: `runs/2026-10-10T15-33-58-836Z-B-test`
- **Romain agrees** (yes / no, and why if no): yes

### 9. q-099 (temporal, config C)

- **Question**: When is Ember scheduled to launch?
- **Expected**: value: March 16, 2027 / 2027-03-16; outdated values that must not be given: January 4, 2027
- **Answer**: status `answered`; value: March 16, 2027
- **Answer text**: Ember is now scheduled to launch on March 16, 2027, replacing the original launch date because of a certification retest at Anvil Test Labs.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-50-30-055Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 10. q-064 (simple, config C)

- **Question**: How long does Lattice Molding need to deliver the Cirrus enclosure tooling?
- **Expected**: value: 9 weeks
- **Answer**: status `answered`; value: 9 weeks
- **Answer text**: Lattice Molding needs 9 weeks to deliver the Cirrus enclosure tooling, per its April 12, 2025 offer.
- **Grader**: correct
- **Run**: `runs/2026-10-10T16-02-22-269Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 11. q-083 (multi_hop, config C)

- **Question**: In which city is the supplier of the Granite EVT enclosures based?
- **Expected**: value: Shenzhen; outdated values that must not be given: Monterrey
- **Answer**: status `conflict`; value: Monterrey \| Shenzhen
- **Answer text**: Sources disagree on the supplier's city. The Wexford Molding directory entry says Monterrey, but the 2026-01-08 tooling sign-off validated Lattice Molding as the enclosure vendor, whose directory entry says Shenzhen. Neither source supersedes the other, so the supplier of the Granite EVT enclosures cannot be settled from these excerpts.
- **Grader**: wrong (wrong_version)
- **Run**: `runs/2026-10-10T16-02-22-269Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 12. q-077 (multi_hop, config C)

- **Question**: Who is Larkspur's contact at the supplier building the Granite enclosure?
- **Expected**: value: Vera Ibarra; outdated values that must not be given: Lucia Engel
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The excerpts do not name a Larkspur contact at Lattice Molding, which the January 2026 sign-off made the validated enclosure vendor. Lucia Engel is Larkspur's contact at Wexford Molding, but Wexford was not kept for the enclosure.
- **Grader**: wrong (judge_rejected)
- **Run**: `runs/2026-10-10T15-50-30-055Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 13. q-066 (simple, config C+)

- **Question**: Did the team decide on adding a cellular backhaul option for Granite?
- **Expected**: no decision was made
- **Answer**: status `answered`; value: no decision
- **Answer text**: No. The design review of 2025-12-24 discussed adding a cellular backhaul option for Granite but made no decision, and the question stays open with a follow-up meeting planned.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-53-22-615Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 14. q-088 (temporal, config C+)

- **Question**: Who owns the Foxborough Unified Schools account?
- **Expected**: value: Luis Whitaker; outdated values that must not be given: Anya Castillo
- **Answer**: status `answered`; value: Luis Whitaker
- **Answer text**: Luis Whitaker is the current account owner, having taken over from Anya Castillo at the 2026-01-29 handoff. The customer page still lists Anya Castillo as owner, but it was written when the deal closed and is outdated.
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-39-14-958Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 15. q-100 (contradiction, config C+)

- **Question**: How many units did the Granite EVT build produce?
- **Expected**: conflict between: 89 units / 94 units
- **Answer**: status `answered`; value: 89
- **Answer text**: The Granite EVT review note records that the build produced 89 units. Zoe Adeyemi's personal journal gives an unofficial count of 94, which conflicts with the meeting record.
- **Grader**: wrong (missed_contradiction)
- **Run**: `runs/2026-10-10T15-39-14-958Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 16. q-102 (contradiction, config C+)

- **Question**: What battery life do the Cirrus requirements call for?
- **Expected**: conflict between: 16 months / 23 months
- **Answer**: status `answered`; value: 16 months
- **Answer text**: The Cirrus requirements call for a battery life of 16 months under normal use in a building.
- **Grader**: wrong (judge_rejected)
- **Run**: `runs/2026-10-10T16-05-07-549Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 17. q-117 (no_answer, config C before)

- **Question**: At which trade show will Cirrus be shown?
- **Expected**: abstain (the vault does not say)
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The retrieval loop abstained (rule abstain).
- **Grader**: correct
- **Run**: `runs/2026-10-10T15-56-08-506Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 18. q-119 (no_answer, config C before)

- **Question**: Is Redstone Plastics ISO 14001 certified?
- **Expected**: abstain (the vault does not say)
- **Answer**: status `abstained`; value: (none)
- **Answer text**: The retrieval loop abstained (rule abstain).
- **Grader**: correct
- **Run**: `runs/2026-10-10T16-08-01-461Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 19. q-108 (contradiction, config C before)

- **Question**: What battery life do the Granite requirements call for?
- **Expected**: conflict between: 53 months / 55 months
- **Answer**: status `answered`; value: 53 months
- **Answer text**: The Granite requirements call for a battery life of 53 months.
- **Grader**: wrong (judge_rejected)
- **Run**: `runs/2026-10-10T15-42-06-201Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes

### 20. q-081 (multi_hop, config C before)

- **Question**: Who is Larkspur's contact at the supplier building the Cirrus enclosure?
- **Expected**: value: Vera Ibarra; outdated values that must not be given: Lucia Engel
- **Answer**: status `answered`; value: Lucia Engel
- **Answer text**: Lucia Engel is Larkspur's account contact at Wexford Molding, the supplier building the Cirrus enclosure.
- **Grader**: wrong (judge_rejected)
- **Run**: `runs/2026-10-10T15-56-08-506Z-C-test`
- **Romain agrees** (yes / no, and why if no): yes
