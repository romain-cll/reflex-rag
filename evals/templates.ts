// Question wording, as data. `{name}` marks an entity name filled in by
// `fill`. Fact templates are keyed by fact attribute (see `attributeKey` in
// questions.ts).

export type Vars = Record<string, string>

export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) {
      throw new Error(`No value for {${key}} in "${template}"`)
    }
    return value
  })
}

export const SIMPLE: Record<string, string> = {
  city: "Where is {supplier} based?",
  account_contact: "Who is Larkspur's account contact at {supplier}?",
  segment: "What kind of customer is {customer}?",
  facilities_contact: "Who is the main contact at {customer}?",
  unit_cost_target: "What is the target unit cost for {codename}?",
  enclosure_tooling_price:
    "How much did {supplier} ask for the {codename} enclosure tooling?",
  enclosure_lead_time:
    "How long does {supplier} need to deliver the {codename} enclosure tooling?",
  component_price:
    "What price per {unit} did {supplier} give for the {codename} {label}?",
  pilot: "Which customer is piloting {codename}?",
  dvt_finding: "What issue did the {codename} DVT units show?",
  goal: "What device is {codename} meant to deliver?",
  owner: "Who is the product owner of {codename}?",
  slip_reason: "Why did the {codename} launch slip?",
  office: "Which office does {person} work from?",
  list_price: "What is the new list price of the Larkspur {line}?",
}

export const UNDECIDED = {
  project: "Did the team decide on {phrase} for {codename}?",
  company: "Did the leadership team decide on {phrase}?",
}

export const TEMPORAL: Record<string, string> = {
  enclosure_vendor: "Which quote was selected for the {codename} enclosure?",
  launch_date: "When is {codename} scheduled to launch?",
  account_owner: "Who owns the {customer} account?",
  role: "What is {person}'s current role?",
}

export const CONTRADICTION: Record<string, string> = {
  evt_units: "How many units did the {codename} EVT build produce?",
  battery_life_requirement:
    "What battery life do the {codename} requirements call for?",
  annual_contract_value: "What is the annual contract value with {customer}?",
}

/** By the end of the title of the first note of the chain. */
export const MULTI_HOP: [suffix: string, template: string][] = [
  [
    "requirements",
    "Who is Larkspur's contact at the supplier building the {codename} enclosure?",
  ],
  [
    "EVT review",
    "In which city is the supplier of the {codename} EVT enclosures based?",
  ],
  [
    "launch date change",
    "Who is the contact at the lab behind the {codename} launch delay?",
  ],
  [
    "DVT review",
    "Who is the main contact at the customer running the {codename} pilot?",
  ],
  [
    "quarterly review",
    "Which office does the current account owner of {customer} work from?",
  ],
]

/** By the end of the topic of the absent topic. */
export const NO_ANSWER: [topic: string, template: string][] = [
  ["patent filing", "Has Larkspur filed a patent for {codename}?"],
  [
    "crowdfunding campaign",
    "How much did the {codename} crowdfunding campaign raise?",
  ],
  ["launch in Japan", "When does {codename} launch in Japan?"],
  ["trade show booth", "At which trade show will {codename} be shown?"],
  ["Amazon storefront", "Is {codename} sold through an Amazon storefront?"],
  [
    "Net Promoter Score",
    "What Net Promoter Score did {customer} give Larkspur?",
  ],
  [
    "data-residency requirements",
    "What data-residency requirements does {customer} have?",
  ],
  [
    "cyber insurance policy",
    "Which cyber insurance policy does {customer} require from Larkspur?",
  ],
  [
    "LEED certification",
    "Which LEED certification level does {customer} target?",
  ],
  ["ISO 14001 certification", "Is {supplier} ISO 14001 certified?"],
  ["carbon footprint report", "What carbon footprint did {supplier} report?"],
  [
    "conflict minerals report",
    "Has {supplier} sent its conflict minerals report?",
  ],
  ["SOC 2 audit", "When did Larkspur pass its SOC 2 audit?"],
  ["Series C funding round", "How much did Larkspur raise in its Series C?"],
  ["holiday party venue", "Where is the Larkspur holiday party held?"],
  [
    "four-day work week trial",
    "When does Larkspur's four-day work week trial start?",
  ],
]
