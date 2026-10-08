# Eval questions

Phase 2. The question sets of the evals, derived by code from a corpus truth file (`corpus/<name>/world.json`), so that every expected answer and every expected source note is checkable. Two disjoint splits: `tuning` (thresholds and fixes are tuned on it) and `test` (the reported figures).

## Question shape

`evals/<name>/questions.json` is validated by `QuestionSetSchema` (Zod): `{ world: { seed, scale }, questions: Question[] }`, where a `Question` has:

- `id` (`q-001`…), `split` (`tuning` | `test`), `category` (`simple` | `multi_hop` | `temporal` | `contradiction` | `no_answer`), `question` (English text);
- `expected`, one of:
  - `{ kind: "value", values: string[] }`: the answer must contain one of `values` (equivalent forms of the same answer, e.g. a long date and its ISO form);
  - `{ kind: "conflict", values: [string, string] }`: the answer must report both values as conflicting;
  - `{ kind: "undecided" }`: the answer must say that no decision was made;
  - `{ kind: "abstain" }`: the corpus does not hold the answer;
- `stale`: values that would be a wrong, outdated answer (superseded facts, the decoy vendor…), possibly empty;
- `sources`: vault-relative paths of the notes that hold the answer (empty for `abstain`);
- `entity`: the entity the question is about (an entity id, or `company:<topic>`), used for the split;
- `refs`: the world ids the question comes from (fact, trap, chain or absent topic).

## Acceptance criteria

- **AC1 — determinism**: `buildQuestions(world)` returns deep-equal sets for the same world.
- **AC2 — schema**: the set passes `QuestionSetSchema`; question ids and question texts are unique.
- **AC3 — counts**: on the scale-1 world of seed 42, each split holds exactly 12 `simple`, 15 `multi_hop`, 12 `temporal`, 9 `contradiction` and 12 `no_answer` questions. When a world cannot fill a category of a split, `buildQuestions` throws an error naming the category and the split.
- **AC4 — disjoint splits**: no `entity` appears in both splits. Entities are assigned to splits alternately in id order.
- **AC5 — sources**: every source is the path of a world note. A `value` question's sources state its fact; a `conflict` question's sources are the truth notes of its trap; a `multi_hop` question's sources are the notes of its chain after the first one, in order (the entry note is one way in, not a note the answer needs).
- **AC6 — expected values**:
  - `value`: the values come from the answer fact (its value or its anchors); dates are given both as a long date (`March 2, 2026`) and in ISO form;
  - `conflict`: the two values are anchors of the two facts of a `contradiction` or `divergent_duplicate` trap;
  - `temporal`: the expected value comes from the latest fact of a supersession chain, and `stale` holds the anchors of the superseded fact(s);
  - `abstain`: the question is about an `absent` topic of the world;
  - `multi_hop`: when the chain goes through a superseded fact, `stale` holds the answer the outdated path leads to: the decoy enclosure vendor's contact or city for the supplier chains, the former account owner's office for the account-owner chains;
  - a candidate whose expected values and stale values overlap is dropped: following the outdated path must not give the right answer.
- **AC7 — categories**:
  - `multi_hop`: one question per selected chain, about the chain's answer fact;
  - `temporal`: questions about the current value of a superseded fact; the enclosure-vendor questions use the word "quote" (the vocabulary trap);
  - `contradiction`: one question per selected `contradiction` or `divergent_duplicate` trap;
  - `no_answer`: one question per selected absent topic;
  - `simple`: a fact stated by exactly one note, part of no trap and of no chain, or an `undecided` trap (at most a quarter of the simple questions).
- **AC8 — no leak**: no question text contains one of its expected values or stale values (case-insensitive).
- **AC9 — CLI**: `bun evals/build-questions.ts <name> [--corpus <dir>] [--out <dir>]` reads `<corpus>/<name>/world.json` (default `corpus`) and writes `<out>/<name>/questions.json` (default `evals`), then prints the counts per split and category.

## Technical plan

Files:

- `evals/schema.ts`: `QuestionSchema`, `QuestionSetSchema` and the inferred types.
- `evals/templates.ts`: question wording per fact attribute, chain shape and absent topic (below).
- `evals/questions.ts`: `buildQuestions(world: World): QuestionSet`. Collects candidates per category, assigns each to its entity's split, then picks the required count per split with the seeded PRNG of `corpus/generator/random.ts` (seed = `world.meta.seed`), in a stable order.
- `evals/build-questions.ts`: CLI (AC9).
- `.prettierignore`: add `evals/*/questions.json` (generated file).
- No new dependency.

Wording (`{codename}`, `{customer}`, `{supplier}`, `{person}` are entity names):

- **simple**: `city` → "Where is {supplier} based?"; `account_contact` → "Who is Larkspur's account contact at {supplier}?"; `segment` → "What kind of customer is {customer}?"; `facilities_contact` → "Who is the main contact at {customer}?"; `unit_cost_target` → "What is the target unit cost for {codename}?"; `enclosure_tooling_price:*` → "How much did {supplier} ask for the {codename} enclosure tooling?"; `enclosure_lead_time:*` → "How long does {supplier} need to deliver the {codename} enclosure tooling?"; component price → "What price per {unit} did {supplier} give for the {codename} {label}?"; `pilot` → "Which customer is piloting {codename}?"; `dvt_finding` → "What issue did the {codename} DVT units show?"; `goal` → "What device is {codename} meant to deliver?"; `owner` → "Who is the product owner of {codename}?"; `slip_reason` → "Why did the {codename} launch slip?"; `office` → "Which office does {person} work from?"; `list_price` → "What is the new list price of the Larkspur {line}?"; undecided → "Did the team decide on {phrase} for {codename}?" (company: "Did the leadership team decide on {phrase}?").
- **temporal**: `enclosure_vendor` → "Which quote was selected for the {codename} enclosure?"; `launch_date` → "When is {codename} scheduled to launch?"; `account_owner` → "Who owns the {customer} account?"; `role` → "What is {person}'s current role?".
- **contradiction**: `evt_units` → "How many units did the {codename} EVT build produce?"; `battery_life_requirement` → "What battery life do the {codename} requirements call for?"; `annual_contract_value` → "What is the annual contract value with {customer}?".
- **multi_hop**, by the first note of the chain: requirements → "Who is Larkspur's contact at the supplier building the {codename} enclosure?"; EVT review → "In which city is the supplier of the {codename} EVT enclosures based?"; launch-date decision → "Who is the contact at the lab behind the {codename} launch delay?"; DVT review → "Who is the main contact at the customer running the {codename} pilot?"; quarterly review → "Which office does the current account owner of {customer} work from?".
- **no_answer**, by absent topic: patent filing → "Has Larkspur filed a patent for {codename}?"; crowdfunding campaign → "How much did the {codename} crowdfunding campaign raise?"; launch in Japan → "When does {codename} launch in Japan?"; trade show booth → "At which trade show will {codename} be shown?"; Amazon storefront → "Is {codename} sold through an Amazon storefront?"; Net Promoter Score → "What Net Promoter Score did {customer} give Larkspur?"; data-residency requirements → "What data-residency requirements does {customer} have?"; cyber insurance policy → "Which cyber insurance policy does {customer} require from Larkspur?"; LEED certification → "Which LEED certification level does {customer} target?"; ISO 14001 certification → "Is {supplier} ISO 14001 certified?"; carbon footprint report → "What carbon footprint did {supplier} report?"; conflict minerals report → "Has {supplier} sent its conflict minerals report?"; SOC 2 audit → "When did Larkspur pass its SOC 2 audit?"; Series C funding round → "How much did Larkspur raise in its Series C?"; holiday party venue → "Where is the Larkspur holiday party held?"; four-day work week trial → "When does Larkspur's four-day work week trial start?".

## Test strategy

Unit tests in `evals/questions.test.ts` on `generateWorld({ seed: 42, scale: 1 })` (from `corpus/generator/world.ts`), checking AC1–AC8 over the whole set, plus a tiny world for the "cannot fill a category" error. CLI test in `evals/build-questions.test.ts` as a subprocess with `--corpus` and `--out` pointing to temporary folders.
